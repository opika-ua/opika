import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * S8-F5: every place `animals.listing_kind` or `shelters.verification_status`
 * is read or written, as a flat list the test owns rather than trusts a
 * comment to keep current.
 *
 * Why a pattern, not a parsed AST (unlike `kabinet-db-scan.test.ts`'s import
 * walk): that scan exists because an import can be disguised a dozen ways —
 * dynamic, re-exported, renamed, hidden behind a string a comment could also
 * produce. A Drizzle object-literal key named `listingKind`/
 * `verificationStatus` isn't that kind of risk; nobody writes
 * `this["listing" + "Kind"]` to sneak a write past a reviewer. The risk this
 * guards is mundane — a new write path added without also wiring the
 * `everServedAt` hook — and a literal-text scan catches a new occurrence of
 * either identifier exactly as well as a parser would, for a fraction of the
 * code.
 *
 * Scoped to `repos/` and `schema/` only: every real Drizzle call in this
 * package funnels through a `repos/*.ts` function (`onboard-shelter.ts` and
 * `seed.ts` call `animalRepo(db).insert(...)`, never `.insert(animals)`
 * directly), so a write path appearing anywhere else in this package would
 * have to pass through one of these files first.
 *
 * Each entry below is one of exactly three kinds:
 *   - **a column definition** (`schema/*.ts`) — declares the column, writes nothing;
 *   - **a read** (`SELECT`, or a mapper reading a row back) — not a hook site;
 *   - **a write**, which must be one of the three S8-F5 hooks (see each entry).
 * A new match not in this list — a new file, a new line, or an existing
 * line's text changing — fails the test by name, forcing whoever added it to
 * extend this list and say which of the above it is.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");
const SCANNED_DIRS = ["repos", "schema"];

type Kind = "definition" | "read" | "write";
const EXPECTED: ReadonlyArray<{
  file: string;
  line: number;
  text: string;
  kind: Kind;
  why: string;
}> = [
  {
    file: "schema/animals.ts",
    line: 134,
    text: 'listingKind: text("listing_kind", {',
    kind: "definition",
    why: "the column itself",
  },
  {
    file: "schema/shelters.ts",
    line: 43,
    text: 'verificationStatus: text("verification_status", {',
    kind: "definition",
    why: "the column itself",
  },
  {
    file: "repos/gallery-repo.ts",
    line: 269,
    text: "listingKind: animals.listingKind,",
    kind: "read",
    why: "getAnimalColumns' SELECT list for the gallery page",
  },
  {
    file: "repos/mappers.ts",
    line: 126,
    text: "verificationStatus: shelter.verification.status,",
    kind: "write",
    why:
      "shelterToRow, used by every shelter INSERT (onboard-shelter.ts's hook 3, and " +
      "registry-invitations.ts's pending-shelter create, which this hook can never fire " +
      "for since that path never inserts a verified shelter)",
  },
  {
    file: "repos/mappers.ts",
    line: 189,
    text: "listingKind: animal.listing.kind,",
    kind: "write",
    why:
      "animalToRowWithCity, used by every animal INSERT (hook 3: onboard-shelter.ts, seed.ts) " +
      "and by animalRepo.update's full-row overwrite, which is not a hook (test/harness setup " +
      "only — see the reachability check below) and relies on its own everServedAt COALESCE, " +
      "not on this mapper, to never clear the fact (Tier 1 review finding 3, PR #196)",
  },
  {
    file: "repos/kabinet-animal-repo.ts",
    line: 336,
    text: "listingKind: next.kind,",
    kind: "write",
    why:
      "writeListingIf — hook 1. everServedAt is stamped by an EXISTS subquery against the " +
      "shelters row inside this same UPDATE, not from a verification value the caller read " +
      "earlier (Tier 1 review finding 4, PR #196: a value read before the retry loop could go " +
      "stale across a concurrent pause/suspend and over-stamp)",
  },
  {
    file: "repos/kabinet-shelter-repo.ts",
    line: 66,
    text: "verificationStatus: change.verification.status,",
    kind: "write",
    why: "applyAuditedMany's columnsOf — the one UPDATE of this column; its own `becomesVerified` check is hook 2",
  },
];

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile() && path.endsWith(".ts") && !path.endsWith(".test.ts")) yield path;
  }
}

/** A property-key occurrence: `listingKind:`/`verificationStatus:`, not a bare mention in a comment or string. */
const KEY_PATTERN = /\b(listingKind|verificationStatus)\s*:/;

function found(): { file: string; line: number; text: string }[] {
  const results: { file: string; line: number; text: string }[] = [];
  for (const dirName of SCANNED_DIRS) {
    for (const path of walk(join(ROOT, dirName))) {
      const lines = readFileSync(path, "utf8").split("\n");
      lines.forEach((lineText, index) => {
        if (KEY_PATTERN.test(lineText)) {
          results.push({
            file: path.slice(ROOT.length + 1).replaceAll("\\", "/"),
            line: index + 1,
            text: lineText.trim(),
          });
        }
      });
    }
  }
  return results;
}

describe("S8-F5: every listingKind/verificationStatus property site is accounted for", () => {
  it("matches the expected list exactly — a new site needs a new entry here, naming its hook", () => {
    const actual = found()
      .map(({ file, line, text }) => ({ file, line, text }))
      .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
    const expected = EXPECTED.map(({ file, line, text }) => ({ file, line, text })).sort(
      (a, b) => a.file.localeCompare(b.file) || a.line - b.line,
    );
    expect(actual).toEqual(expected);
  });

  it("every write-kind entry is one of the three S8-F5 hooks named in this file's own comment", () => {
    const writes = EXPECTED.filter((e) => e.kind === "write");
    // Not a tautology: fails if a future edit adds a `write`-kind entry
    // whose `why` forgets to say which hook it is.
    for (const entry of writes) {
      expect(entry.why).toMatch(/hook [123]|everServedAt/);
    }
    // The three actual hooks, by file, must each appear at least once.
    expect(writes.some((e) => e.file === "repos/kabinet-animal-repo.ts")).toBe(true);
    expect(writes.some((e) => e.file === "repos/kabinet-shelter-repo.ts")).toBe(true);
    expect(writes.some((e) => e.file === "repos/mappers.ts")).toBe(true);
  });
});

/**
 * `animalRepo.update` (`repos/animal-repo.ts`) is a full-row overwrite with no
 * compare-and-set, no S8-F5 hook, and no handler guard — safe only because
 * nothing in production calls it (Tier 1 review finding 3, PR #196). That was
 * previously a comment's claim, not a tested one. Scoped to `apps/web/src`:
 * the one real caller of `@opika/db/repos` outside this package's own tests.
 */
describe("animalRepo.update stays unreachable from production code", () => {
  const WEB_SRC = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "apps/web/src",
  );
  const CALL_PATTERN = /animalRepo\([^)]*\)\s*\.\s*update\s*\(/;

  function* productionFiles(dir: string): Generator<string> {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) yield* productionFiles(path);
      else if (entry.isFile() && path.endsWith(".ts") && !path.endsWith(".test.ts")) yield path;
    }
  }

  it("no file under apps/web/src calls animalRepo(...).update(...)", () => {
    const hits: { file: string; line: number }[] = [];
    for (const path of productionFiles(WEB_SRC)) {
      readFileSync(path, "utf8")
        .split("\n")
        .forEach((lineText, index) => {
          if (CALL_PATTERN.test(lineText)) {
            hits.push({
              file: path.slice(WEB_SRC.length + 1).replaceAll("\\", "/"),
              line: index + 1,
            });
          }
        });
    }
    expect(hits).toEqual([]);
  });
});
