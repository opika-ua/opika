import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type Anchor, compareSites, scanSites, sourceFiles } from "./source-sites";

/**
 * GDPR erasure, option A (`docs/gdpr-analysis.md` §5 item 4). Oleksii,
 * 2026-10-24, widening the first build: "whenever an admin's or invitee's
 * account is deleted, by any path … their email is scrubbed from that
 * shelter's history entries in the same transaction as the deletion. One
 * shared mechanism, not three copies. … A structural check fails if a new
 * user-deletion path appears without the scrub."
 *
 * This is that check. Every place that deletes an `auth_user` row, in
 * `packages/db/src` (every real write funnels through this package, never
 * `apps/web` directly - `kabinet-db-scan.test.ts`'s own premise), is one of
 * exactly two kinds:
 *   - **the shared mechanism's own implementation**
 *     (`repos/admin-erasure-repo.ts`'s `eraseUsersAndScrubHistory`) - the one
 *     place a deletion and a scrub are allowed to not call each other, because
 *     it *is* the thing that does both;
 *   - **an allowed exception**, named here with why it needs no scrub.
 *
 * A new `.delete(authUser)`/raw `DELETE FROM "auth_user"` anywhere else, or
 * one moving to another function, fails this test by naming the file, line
 * and enclosing symbol (sites are anchored by symbol, not line, in
 * `source-sites.ts`, so an edit above one does not), forcing whoever added it to either
 * route it through `eraseUsersAndScrubHistory` or add a reasoned exception
 * here - never to silently ship a third way to delete a user.
 *
 * A fourth way exists and this scan's line-level pattern can't see it (Tier
 * 1 review, PR #199, finding 6): `full-reset.ts`'s `truncateFullReset` wipes
 * `auth_user` via a dynamically built `TRUNCATE "${table}", …` - the literal
 * text "auth_user" never appears next to the word `TRUNCATE` in the source,
 * it sits in a separate `FULL_RESET_TABLES` array `truncateFullReset` reads
 * at runtime. The second scan below catches this shape instead: any
 * non-test file naming `"auth_user"` as a quoted table *and* calling
 * `TRUNCATE` needs the same classification, even though no single line
 * shows both.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");

type Kind = "mechanism" | "exception";
const EXPECTED: ReadonlyArray<Anchor & { kind: Kind; why: string }> = [
  {
    file: "demo-remove.ts",
    symbol: "removeDemoCorpus",
    text: ": tx.delete(authUser).where(inArray(authUser.id, userIds)).returning({ id: authUser.id }),",
    kind: "exception",
    why:
      "deletes a demo/rehearsal shelter's own shelter_history rows outright, in the same " +
      "removal (DEMO_REMOVAL_TABLES includes shelter_history) - there is no row left to carry " +
      "a stale email, so there is nothing for the shared scrub to do",
  },
  {
    file: "repos/application-deletion-repo.ts",
    symbol: "applicationDeletionRepo.deleteWhere",
    text: "tx.delete(authUser).where(ofUser(eq(authUser.id, uid))),",
    kind: "exception",
    why:
      "deletes a self-registered application (D8, «Це не я», and `shelters:delete-test`'s " +
      "pre-launch rehearsal shelters, same batch) with its own shelter_history rows in the same " +
      "transaction. The registrant joined this shelter's organization at registration (one " +
      "email, one shelter); the rehearsal path also requires, under the batch's lock, that they " +
      "are still a member of it, which auth_member_user_id_unique makes their only membership. " +
      "Not scrubbed here: an auth_invitation another shelter sent the same address",
  },
  {
    file: "repos/admin-erasure-repo.ts",
    symbol: "erasureStatement",
    text: 'DELETE FROM "auth_user"',
    kind: "mechanism",
    why:
      "eraseUsersAndScrubHistory's one statement - the one shared mechanism every real deletion " +
      "routes through, awaited on its own or (the operator's «Видалити притулок», " +
      "deleteShelterByOperator) as an item of a batch",
  },
];

const DELETE_PATTERN = /\.delete\(authUser\)|DELETE FROM "auth_user"/;

const found = () =>
  scanSites(ROOT, DELETE_PATTERN, (path) => path.slice(ROOT.length + 1).replaceAll("\\", "/"));

describe("every auth_user deletion is the shared mechanism or a named exception", () => {
  it("matches the expected list exactly - a new site needs a new entry here", () => {
    expect(compareSites(found(), EXPECTED)).toEqual({ unexpected: [], missing: [] });
  });

  it("names exactly one mechanism site and the rest exceptions, each with a real reason", () => {
    const mechanisms = EXPECTED.filter((e) => e.kind === "mechanism");
    expect(mechanisms).toHaveLength(1);
    for (const entry of EXPECTED) expect(entry.why.length).toBeGreaterThan(20);
  });

  it("every TRUNCATE naming auth_user is covered too, even with no single matching line", () => {
    expect(filesWithDynamicTruncateOfAuthUser().sort()).toEqual([...TRUNCATE_SITES].sort());
  });
});

/**
 * `full-reset.ts`: builds `TRUNCATE "support_sessions", …, "auth_user", …`
 * from `FULL_RESET_TABLES` at runtime, in the same statement as every other
 * application table - including `shelter_history`, so there is no row left
 * to carry a stale email once it runs, the same reasoning `demo-remove.ts`'s
 * own exception above already uses.
 */
const TRUNCATE_SITES = ["full-reset.ts"] as const;

function filesWithDynamicTruncateOfAuthUser(): string[] {
  const results: string[] = [];
  for (const path of sourceFiles(ROOT)) {
    const text = readFileSync(path, "utf8");
    if (/\bTRUNCATE\b/.test(text) && /"auth_user"/.test(text)) {
      results.push(path.slice(ROOT.length + 1).replaceAll("\\", "/"));
    }
  }
  return results;
}
