import {
  cityRepo,
  kabinetInvitationRepo,
  kabinetInviteLandingRepo,
  shelterRepo,
} from "@opika/db/repos";
import { authInvitation, authUser, authVerification } from "@opika/db/schema";
import { makeCity, makeShelter, setupTestDatabase, truncateAll } from "@opika/db/test";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { createKabinetAuth, FORWARDED_AUTH_PATHS, type KabinetAuth } from "./auth";
import {
  type InviteLandingDeps,
  inviteLandingOf,
  MAGIC_LINK_REQUEST_PATH,
  sendMagicLinkThroughAuth,
} from "./invite-landing";
import { capturingSender } from "./magic-link-sender";
import { SIGN_IN_LIMITS } from "./sign-in-limit";

/**
 * IN-T10: the invite landing (`/kabinet/vkhid?zaproshennia=<id>`). Real
 * Postgres, real Better Auth, its real magic-link endpoint reached through
 * `auth.handler`; only the email provider is a capture (IN-Q9: no real
 * sends). The page that renders this is a thin shell over `inviteLandingOf`
 * plus the card (`InviteLandingCard.test.tsx`), and answers 404 while
 * sign-in is unavailable through `kabinetAvailabilityOrNotFound`, as K1 does.
 */

const BASE = "http://localhost:3000";
const OPERATOR = "0ec0ec0e-0000-4000-8000-000000000002";

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;
let sender: ReturnType<typeof capturingSender>;
let pending: Promise<void>[];
let auth: KabinetAuth;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

beforeEach(async () => {
  await truncateAll(db);
  sender = capturingSender();
  pending = [];
  auth = createKabinetAuth({
    db,
    sender,
    schedule: (work) => {
      pending.push(work());
    },
    baseURL: BASE,
    secret: "test-only-secret-that-is-long-enough-0123456789",
    secureCookies: false,
  });
  await db.insert(authUser).values({
    id: OPERATOR,
    name: "Оператор",
    email: "op@example.org",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});

const limiters = (perAddress = 1000, perIp = 1000) => ({
  perAddress: inMemoryRateLimiter({ windowMs: 3_600_000, maxRequests: perAddress }),
  perIp: inMemoryRateLimiter({ windowMs: 3_600_000, maxRequests: perIp }),
});

/** A shelter and one pending invitation for `email`, written the way the registry writes it. */
async function invitation(email = "olena@example.org", now = new Date()) {
  const city = makeCity();
  await cityRepo(db).insert(city);
  const shelter = makeShelter({
    displayName: "Лапа допомоги",
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id } as never,
  });
  await shelterRepo(db).insert(shelter);
  const invitationId = crypto.randomUUID();
  const result = await kabinetInvitationRepo(db).invite({
    shelterId: shelter.id,
    email,
    name: "Олена",
    inviterUserId: OPERATOR,
    ids: { invitationId, userId: crypto.randomUUID(), organizationId: crypto.randomUUID() },
    now,
    history: {
      id: crypto.randomUUID(),
      entry: { kind: "admin_invited", at: now, moderatorId: OPERATOR as never, email },
    },
  });
  if (result.kind !== "invited") throw new Error(`invite refused: ${result.kind}`);
  return { invitationId, shelter };
}

/**
 * Sets one invitation's status. This package doesn't depend on drizzle-orm
 * (no `eq` here), so the table is rewritten: every invitation write in the
 * app stays in kabinetInvitationRepo, and this is test setup only.
 */
async function setStatus(invitationId: string, status: string) {
  const rows = await db.select().from(authInvitation);
  await db.delete(authInvitation);
  await db
    .insert(authInvitation)
    .values(rows.map((row) => (row.id === invitationId ? { ...row, status } : row)));
}

function deps(overrides: Partial<InviteLandingDeps> = {}): InviteLandingDeps {
  return {
    lookup: (id) => kabinetInviteLandingRepo(db).invitationOf(id),
    limiters: limiters(),
    ip: "203.0.113.7",
    now: new Date(),
    sendMagicLink: (email) => sendMagicLinkThroughAuth(auth, BASE, email),
    ...overrides,
  };
}

async function open(invitationId: string, d = deps()) {
  const landing = await inviteLandingOf(invitationId, d);
  await Promise.all(pending);
  return landing;
}

describe("the invite landing's GET sends a fresh magic link to the invited address (IN-Q11)", () => {
  it("sends exactly one link, to the invitation's address, and says so with the address masked", async () => {
    const { invitationId } = await invitation("Olena@Example.org");
    const landing = await open(invitationId);
    expect(landing).toEqual({
      kind: "sent",
      shelterName: "Лапа допомоги",
      maskedEmail: "o•••@example.org",
    });
    expect(sender.sent.map((m) => m.email)).toEqual(["olena@example.org"]);
    expect(sender.sent[0]?.url).toMatch(
      /^http:\/\/localhost:3000\/kabinet\/vkhid\/pidtverdzhennia\?token=[A-Za-z]+$/,
    );
  });

  it("changes nothing else: the invitation stays pending, only Better Auth's verification row is written", async () => {
    const { invitationId } = await invitation();
    const before = await db.select().from(authInvitation);
    await open(invitationId);
    expect(await db.select().from(authInvitation)).toEqual(before);
    expect(await db.select().from(authVerification)).toHaveLength(1);
  });

  it("goes through a path the auth route forwards (the same one K1's form uses)", () => {
    expect(FORWARDED_AUTH_PATHS).toContain(MAGIC_LINK_REQUEST_PATH);
  });
});

describe("what the landing reveals (IN-T10)", () => {
  it("an id nobody issued, a malformed one, an expired and a withdrawn invitation all read the same: unusable, nothing sent", async () => {
    const { invitationId: expiredId } = await invitation(
      "expired@example.org",
      new Date(Date.now() - 73 * 3_600_000),
    );
    const { invitationId: withdrawnId } = await invitation("withdrawn@example.org");
    await setStatus(withdrawnId, "canceled");
    for (const id of [
      crypto.randomUUID(),
      "not-an-id",
      "",
      `${crypto.randomUUID()}x`,
      expiredId,
      withdrawnId,
    ]) {
      expect(await open(id), id).toEqual({ kind: "unusable" });
    }
    expect(sender.sent).toEqual([]);
  });

  it("an accepted invitation says so and sends nothing", async () => {
    const { invitationId } = await invitation();
    await setStatus(invitationId, "accepted");
    expect(await open(invitationId)).toEqual({ kind: "already_accepted" });
    expect(sender.sent).toEqual([]);
  });

  it("a link Better Auth refuses to send reads as send_failed, never as sent", async () => {
    const { invitationId } = await invitation();
    expect(await open(invitationId, deps({ sendMagicLink: async () => false }))).toEqual({
      kind: "send_failed",
      shelterName: "Лапа допомоги",
    });
    expect(
      await open(
        invitationId,
        deps({
          sendMagicLink: async () => {
            throw new Error("down");
          },
        }),
      ),
    ).toEqual({ kind: "send_failed", shelterName: "Лапа допомоги" });
  });
});

describe("rate limits: the existing sign-in budgets (IN-Q11, HS-Q5)", () => {
  it("the per-address budget is K1's: five links an hour, the sixth sends nothing", async () => {
    const { invitationId } = await invitation();
    const shared = limiters(SIGN_IN_LIMITS.perAddress.maxRequests);
    const results = [];
    for (let i = 0; i < 6; i++)
      results.push((await open(invitationId, deps({ limiters: shared }))).kind);
    expect(results).toEqual(["sent", "sent", "sent", "sent", "sent", "rate_limited"]);
    expect(sender.sent).toHaveLength(5);
  });

  it("charges the same `address:` key K1's form charges, so the two share one budget", async () => {
    const { invitationId } = await invitation("Olena@Example.org");
    const shared = limiters(1);
    // K1's form spends the address's one link (signInAllowed's key format).
    expect(await shared.perAddress.check("address:olena@example.org", new Date())).toBe(true);
    expect(await open(invitationId, deps({ limiters: shared }))).toEqual({ kind: "rate_limited" });
    expect(sender.sent).toEqual([]);
  });

  it("charges the per-IP budget on every open, before the lookup, and reads the same for a guessed id", async () => {
    const { invitationId } = await invitation();
    const shared = limiters(1000, 2);
    expect((await open(crypto.randomUUID(), deps({ limiters: shared }))).kind).toBe("unusable");
    expect((await open(crypto.randomUUID(), deps({ limiters: shared }))).kind).toBe("unusable");
    // The budget ran out on guesses: the real id now reads exactly as a guessed one does.
    expect(await open(invitationId, deps({ limiters: shared }))).toEqual({ kind: "rate_limited" });
    expect(await open(crypto.randomUUID(), deps({ limiters: shared }))).toEqual({
      kind: "rate_limited",
    });
    expect(sender.sent).toEqual([]);
  });
});
