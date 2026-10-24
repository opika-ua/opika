import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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
 * `apps/web` directly — `kabinet-db-scan.test.ts`'s own premise), is one of
 * exactly two kinds:
 *   - **the shared mechanism's own implementation**
 *     (`repos/admin-erasure-repo.ts`'s `eraseUsersAndScrubHistory`) — the one
 *     place a deletion and a scrub are allowed to not call each other, because
 *     it *is* the thing that does both;
 *   - **an allowed exception**, named here with why it needs no scrub.
 *
 * A new `.delete(authUser)`/raw `DELETE FROM "auth_user"` anywhere else fails
 * this test by naming the file and line, forcing whoever added it to either
 * route it through `eraseUsersAndScrubHistory` or add a reasoned exception
 * here — never to silently ship a third way to delete a user.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");

type Kind = "mechanism" | "exception";
const EXPECTED: ReadonlyArray<{
  file: string;
  line: number;
  text: string;
  kind: Kind;
  why: string;
}> = [
  {
    file: "demo-remove.ts",
    line: 485,
    text: ": tx.delete(authUser).where(inArray(authUser.id, userIds)).returning({ id: authUser.id }),",
    kind: "exception",
    why:
      "deletes a demo/rehearsal shelter's own shelter_history rows outright, in the same " +
      "removal (DEMO_REMOVAL_TABLES includes shelter_history) — there is no row left to carry " +
      "a stale email, so there is nothing for the shared scrub to do",
  },
  {
    file: "repos/admin-erasure-repo.ts",
    line: 147,
    text: 'DELETE FROM "auth_user"',
    kind: "mechanism",
    why: "eraseUsersAndScrubHistory itself — the one shared mechanism every real deletion routes through",
  },
];

const DELETE_PATTERN = /\.delete\(authUser\)|DELETE FROM "auth_user"/;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile() && path.endsWith(".ts") && !path.endsWith(".test.ts")) yield path;
  }
}

function found(): { file: string; line: number; text: string }[] {
  const results: { file: string; line: number; text: string }[] = [];
  for (const path of walk(ROOT)) {
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((lineText, index) => {
      if (DELETE_PATTERN.test(lineText)) {
        results.push({
          file: path.slice(ROOT.length + 1).replaceAll("\\", "/"),
          line: index + 1,
          text: lineText.trim(),
        });
      }
    });
  }
  return results;
}

describe("every auth_user deletion is the shared mechanism or a named exception", () => {
  it("matches the expected list exactly — a new site needs a new entry here", () => {
    const actual = found()
      .map(({ file, line, text }) => ({ file, line, text }))
      .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
    const expected = EXPECTED.map(({ file, line, text }) => ({ file, line, text })).sort(
      (a, b) => a.file.localeCompare(b.file) || a.line - b.line,
    );
    expect(actual).toEqual(expected);
  });

  it("names exactly one mechanism site and the rest exceptions, each with a real reason", () => {
    const mechanisms = EXPECTED.filter((e) => e.kind === "mechanism");
    expect(mechanisms).toHaveLength(1);
    for (const entry of EXPECTED) expect(entry.why.length).toBeGreaterThan(20);
  });
});
