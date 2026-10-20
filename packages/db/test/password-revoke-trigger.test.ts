import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { adopterRepo } from "../src/repos/adopter-repo";
import { sessionRepo } from "../src/repos/session-repo";
import { authAccount, authSession, authUser } from "../src/schema/auth";
import { sessions } from "../src/schema/sessions";
import {
  makeAdopter,
  passwordRevokeCatalog,
  passwordRevokeIsInPlace,
  setupTestDatabase,
  truncateAll,
  writeCredentialPassword,
} from "../src/test-utils/index";

/**
 * PW1-F5's triggers (migration 0013) against Postgres, without Better Auth: which writes end a
 * user's kabinet sessions and which leave every session alone. The flows through Better Auth
 * itself are `apps/web/src/kabinet/password-flows.test.ts`.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const NOW = new Date("2026-10-20T10:00:00.000Z");
const OLENA = "aaaaaaaa-0000-4000-8000-00000000000a";
const PETRO = "bbbbbbbb-0000-4000-8000-00000000000b";

async function user(id: string, email: string) {
  await db.insert(authUser).values({
    id,
    name: "Олена",
    email,
    emailVerified: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

async function signedIn(userId: string, device: string) {
  await db.insert(authSession).values({
    id: `${device}-${userId}`,
    token: randomUUID(),
    userId,
    expiresAt: new Date(NOW.getTime() + 86_400_000),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

const account = (
  id: string,
  userId: string,
  providerId: string,
  password: string | null,
): typeof authAccount.$inferInsert => ({
  id,
  accountId: userId,
  providerId,
  userId,
  password,
  createdAt: NOW,
  updatedAt: NOW,
});

/** Each kabinet session's id, sorted: the ids name the device and the user, never a token. */
const sessionIds = async () =>
  (await db.select({ id: authSession.id }).from(authSession)).map((r) => r.id).sort();

/** Olena on two devices, Petro on one, and an adopter's anonymous session. */
async function everyoneSignedIn() {
  await user(OLENA, "olena@example.org");
  await user(PETRO, "petro@example.org");
  await signedIn(OLENA, "phone");
  await signedIn(OLENA, "laptop");
  await signedIn(PETRO, "phone");
  const adopter = makeAdopter();
  await adopterRepo(db).insert(adopter);
  await sessionRepo(db).insert({
    tokenHash: "a".repeat(64),
    adopterId: adopter.id,
    createdAt: NOW,
    lastSeenAt: NOW,
  });
}

const EVERYONE = [`laptop-${OLENA}`, `phone-${OLENA}`, `phone-${PETRO}`];
const ONLY_PETRO = [`phone-${PETRO}`];

const adopterSessions = async () => (await db.select().from(sessions)).length;

describe("the catalog (PW1-F5, migration 0013)", () => {
  it("both triggers exist and fire, each with its guard, and the function runs as its caller with search_path pinned", async () => {
    const catalog = await passwordRevokeCatalog(db);
    expect(catalog.triggers).toEqual([
      {
        name: "auth_account_password_insert_revokes_sessions",
        enabled: "O",
        definition:
          "CREATE TRIGGER auth_account_password_insert_revokes_sessions AFTER INSERT ON public.auth_account FOR EACH ROW WHEN (((new.provider_id = 'credential'::text) AND (new.password IS NOT NULL))) EXECUTE FUNCTION auth_account_password_revokes_sessions()",
      },
      {
        name: "auth_account_password_update_revokes_sessions",
        enabled: "O",
        definition:
          "CREATE TRIGGER auth_account_password_update_revokes_sessions AFTER UPDATE OF password ON public.auth_account FOR EACH ROW WHEN (((new.provider_id = 'credential'::text) AND (new.password IS DISTINCT FROM old.password))) EXECUTE FUNCTION auth_account_password_revokes_sessions()",
      },
    ]);
    expect(catalog.functions).toEqual([{ security: "invoker", settings: 'search_path=""' }]);
    expect(passwordRevokeIsInPlace(catalog)).toBe(true);
  });

  it("the smoke's check says no to a disabled trigger, and yes again once it is enabled", async () => {
    await db.execute(
      sql`ALTER TABLE auth_account DISABLE TRIGGER auth_account_password_update_revokes_sessions`,
    );
    try {
      const disabled = await passwordRevokeCatalog(db);
      expect(
        disabled.triggers.map((t) => [t.name, t.enabled]),
        "the catalog reads the switch",
      ).toEqual([
        ["auth_account_password_insert_revokes_sessions", "O"],
        ["auth_account_password_update_revokes_sessions", "D"],
      ]);
      expect(passwordRevokeIsInPlace(disabled)).toBe(false);
    } finally {
      await db.execute(
        sql`ALTER TABLE auth_account ENABLE TRIGGER auth_account_password_update_revokes_sessions`,
      );
    }
    expect(passwordRevokeIsInPlace(await passwordRevokeCatalog(db))).toBe(true);
  });
});

describe("a password write ends that user's kabinet sessions, in the same statement", () => {
  beforeEach(everyoneSignedIn);

  it("a first password (a credential inserted with a hash): both of Olena's devices", async () => {
    await db.insert(authAccount).values(account("olena-credential", OLENA, "credential", "hash-1"));
    expect(await sessionIds()).toEqual(ONLY_PETRO);
    expect(await adopterSessions()).toBe(1);
  });

  it("a new password (our own UPDATE of the hash, no Better Auth anywhere): both of Olena's devices", async () => {
    await db.insert(authAccount).values(account("olena-credential", OLENA, "credential", "hash-1"));
    await signedIn(OLENA, "phone");
    await signedIn(OLENA, "laptop");
    expect(await sessionIds()).toEqual(EVERYONE);
    await writeCredentialPassword(db, OLENA, "hash-2", NOW);
    expect(await sessionIds()).toEqual(ONLY_PETRO);
    expect(await adopterSessions()).toBe(1);
  });

  it("a password cleared from a credential: ends them too (no path does it today)", async () => {
    await db.insert(authAccount).values(account("olena-credential", OLENA, "credential", "hash-1"));
    await signedIn(OLENA, "phone");
    await db
      .update(authAccount)
      .set({ password: null })
      .where(eq(authAccount.id, "olena-credential"));
    expect(await sessionIds()).toEqual(ONLY_PETRO);
  });
});

describe("every other write leaves every session alone", () => {
  beforeEach(everyoneSignedIn);

  it("a credential inserted with no password", async () => {
    await db.insert(authAccount).values(account("olena-credential", OLENA, "credential", null));
    expect(await sessionIds()).toEqual(EVERYONE);
  });

  it("another provider's row, inserted with a password, then its password changed", async () => {
    await db.insert(authAccount).values(account("olena-other", OLENA, "email", "hash-1"));
    await db
      .update(authAccount)
      .set({ password: "hash-2" })
      .where(eq(authAccount.id, "olena-other"));
    expect(await sessionIds()).toEqual(EVERYONE);
  });

  it("an UPDATE that writes the same hash again, or any other column of the credential", async () => {
    // The hash goes in first (that write ends her sessions, as above), then she signs in again.
    await db.insert(authAccount).values(account("olena-credential", OLENA, "credential", "hash-1"));
    await signedIn(OLENA, "phone");
    await signedIn(OLENA, "laptop");
    expect(await sessionIds()).toEqual(EVERYONE);

    await writeCredentialPassword(db, OLENA, "hash-1", new Date(NOW.getTime() + 1));
    await db
      .update(authAccount)
      .set({ accessToken: "x", scope: "y", updatedAt: new Date(NOW.getTime() + 2) })
      .where(eq(authAccount.id, "olena-credential"));
    expect(await sessionIds()).toEqual(EVERYONE);
  });

  it("a credential with no password, updated with still none", async () => {
    await db.insert(authAccount).values(account("olena-credential", OLENA, "credential", null));
    await db
      .update(authAccount)
      .set({ password: null, updatedAt: new Date(NOW.getTime() + 1) })
      .where(eq(authAccount.id, "olena-credential"));
    expect(await sessionIds()).toEqual(EVERYONE);
  });

  it("deleting the credential", async () => {
    await db.insert(authAccount).values(account("olena-credential", OLENA, "credential", "hash-1"));
    await signedIn(OLENA, "phone");
    await signedIn(OLENA, "laptop");
    await db.delete(authAccount).where(eq(authAccount.id, "olena-credential"));
    expect(await sessionIds()).toEqual(EVERYONE);
  });

  it("another user's password: only Petro's own session goes", async () => {
    await db.insert(authAccount).values(account("petro-credential", PETRO, "credential", "hash-1"));
    expect(await sessionIds()).toEqual([`laptop-${OLENA}`, `phone-${OLENA}`]);
    expect(await adopterSessions()).toBe(1);
  });
});
