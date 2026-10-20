import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { authResetLinkRepo } from "../src/repos/auth-reset-link-repo";
import { authUser, authVerification } from "../src/schema/auth";
import { setupTestDatabase, truncateAll } from "../src/test-utils/index";

/**
 * PW1-F1's delete against Postgres, with one row of every shape Better Auth writes to
 * `auth_verification` (Better Auth 1.6.33; the shapes are pinned against Better Auth itself in
 * `apps/web/src/kabinet/password-flows.test.ts`). Only the user's reset links may go.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const NOW = new Date("2026-10-20T10:00:00.000Z");
const at = (ms: number) => new Date(NOW.getTime() + ms);
const OLENA = "aaaaaaaa-0000-4000-8000-00000000000a";
const PETRO = "bbbbbbbb-0000-4000-8000-00000000000b";

/** Better Auth's hashed identifier: SHA-256 of the whole identifier, base64url, no padding. */
const hashed = (identifier: string) => createHash("sha256").update(identifier).digest("base64url");

const row = (id: string, identifier: string, value: string, expiresAt = at(60 * 60_000)) => ({
  id,
  identifier,
  value,
  expiresAt,
  createdAt: NOW,
  updatedAt: NOW,
});

async function users() {
  await db.insert(authUser).values(
    [
      [OLENA, "olena@example.org"],
      [PETRO, "petro@example.org"],
    ].map(([id, email]) => ({
      id: id ?? "",
      name: "Олена",
      email: email ?? "",
      emailVerified: true,
      createdAt: NOW,
      updatedAt: NOW,
    })),
  );
}

const ids = async () =>
  (await db.select({ id: authVerification.id }).from(authVerification)).map((r) => r.id).sort();

describe("authResetLinkRepo.deleteUnused (PW1-F1)", () => {
  beforeEach(async () => {
    await users();
    await db.insert(authVerification).values([
      // Olena's two reset links, and one already past its hour.
      row("olena-reset-1", hashed("reset-password:first-token-0123456789ab"), OLENA),
      row("olena-reset-2", hashed("reset-password:second-token-0123456789a"), OLENA),
      row("olena-reset-expired", hashed("reset-password:old-token-0123456789abc"), OLENA, at(-1)),
      // Olena's magic link: hashed too, but its value is JSON.
      row(
        "olena-magic-link",
        hashed("magic-token-0123456789abcdefghijkl"),
        JSON.stringify({ email: "olena@example.org" }),
      ),
      // A delete-account confirmation, were it ever turned on: her id, a plain identifier.
      row("olena-delete-account", "delete-account-0123456789abcdefghijklmnopqrstuv", OLENA),
      // OAuth state, were social sign-in ever added: plain identifier, JSON value.
      row("oauth-state", "0123456789abcdefghijklmnopqrstuv", JSON.stringify({ userId: OLENA })),
      // Petro's reset link.
      row("petro-reset", hashed("reset-password:petro-token-0123456789ab"), PETRO),
    ]);
  });

  it("deletes the user's reset links, expired included, and answers how many", async () => {
    expect(await authResetLinkRepo(db).deleteUnused(OLENA)).toBe(3);
    expect(await ids()).toEqual([
      "oauth-state",
      "olena-delete-account",
      "olena-magic-link",
      "petro-reset",
    ]);
  });

  it("keeps another user's reset link", async () => {
    await authResetLinkRepo(db).deleteUnused(OLENA);
    expect(await ids()).toContain("petro-reset");
    expect(await authResetLinkRepo(db).deleteUnused(PETRO)).toBe(1);
    expect(await ids()).not.toContain("petro-reset");
  });

  it("keeps a row holding her id under a plain identifier, and a JSON value naming her", async () => {
    await authResetLinkRepo(db).deleteUnused(OLENA);
    const left = await ids();
    expect(left).toContain("olena-delete-account");
    expect(left).toContain("oauth-state");
    expect(left).toContain("olena-magic-link");
  });

  it("answers 0, as a number, when the user holds none", async () => {
    await authResetLinkRepo(db).deleteUnused(OLENA);
    expect(await authResetLinkRepo(db).deleteUnused(OLENA)).toBe(0);
    expect(await authResetLinkRepo(db).deleteUnused("cccccccc-0000-4000-8000-00000000000c")).toBe(
      0,
    );
  });

  it("leaves the user row alone", async () => {
    await authResetLinkRepo(db).deleteUnused(OLENA);
    expect((await db.select({ id: authUser.id }).from(authUser)).map((r) => r.id).sort()).toEqual([
      OLENA,
      PETRO,
    ]);
  });
});
