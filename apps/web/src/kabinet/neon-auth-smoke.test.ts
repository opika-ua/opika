import { setupTestDatabase } from "@opika/db/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAuthSmoke } from "../../scripts/neon-auth-smoke";

/**
 * The auth smoke (`scripts/neon-auth-smoke.ts`), proven locally first: every
 * step passes against the local database (postgres-js), so a FAIL on the Neon
 * branch is the driver or the dialect, not the script. The target guard it
 * shares with `db:neon-smoke` is tested there (`smokeTarget`).
 */
describe("runAuthSmoke against the local database", () => {
  let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
  let cleanup: () => Promise<void>;
  beforeAll(async () => {
    ({ db, cleanup } = await setupTestDatabase());
  });
  afterAll(async () => cleanup?.());

  it("passes every step: sign-in, verify, the accept, getSession, sign-out, PW-1's four, PW1-F1's two, PW1-F5's two, PW1-F6's one, PW1-F7's one, PW1-F8's one, PW-2's three and F8-F1's one", async () => {
    const outcomes = await runAuthSmoke(db);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
    expect(outcomes.map((o) => o.name)).toEqual([
      "sign-in request (verification row through Better Auth's adapter)",
      "verify (token consumed, session created, email verified, first session stamped)",
      "automatic accept on sign-in (invitation + membership, one statement)",
      "getSession (Better Auth reads the session back; the kabinet resolves a shelter admin)",
      "sign-out (session row deleted)",
      "forgot password (the reset token stored hashed, the email captured)",
      "reset (token consumed, credential created with a hash, the notice captured)",
      "password sign-in (session created, no token in the body)",
      "change password (hash updated, other sessions revoked, one renewed session)",
      "reset voids the other reset links (the other link refused, the sign-in link's row kept)",
      "change voids the reset links (a link asked for before it refused after it, the sign-in link's row kept)",
      "password-write revoke in place (the function and both triggers, enabled)",
      "own password write ends every session in its statement (no Better Auth revoke)",
      "a sign-in racing a password write keeps no session (deleted after its insert; a wrong password's answer)",
      "the operator's refused sign-in does a wrong password's work (the same statements, in order; the same answer)",
      "query errors through the cleaned handle keep name, SQLSTATE and constraint, and no message, parameters or SQL",
      "invitation link (issued hashed, read twice with nothing changed, used up by the POST: credential, verified, signed in, accepted; a second POST unusable)",
      "invitation link refused for a password holder, an operator and a member (each EXISTS true over this driver; page and POST unusable)",
      "invitation POST marks the address verified before the password (a failure between leaves no password; a resend's link then signs in)",
      "kabinet page reads through the cleaned handle (the principal and the password status; a refused read cleaned, no message, parameters or SQL)",
    ]);
    expect(outcomes).toHaveLength(20);
  });

  it("prints no link, token or address in any line", async () => {
    const outcomes = await runAuthSmoke(db);
    for (const o of outcomes) {
      expect(o.detail).not.toMatch(/token=|https?:\/\/|@/);
    }
  });
});
