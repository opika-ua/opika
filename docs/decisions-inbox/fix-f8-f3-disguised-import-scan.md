# Decisions inbox: fix/f8-f3-disguised-import-scan

Row for the shared table (`docs/decisions-inbox.md`), appended at merge. Tier 1 (auth-adjacent:
the kabinet's raw-database-isolation scan). Two review rounds: the first (9f5a214) found a real
regression in the fix itself, fixed below; a fresh local reviewer either round, since this
builder wrote the fix.

| ID | Date | Row | Question | Options | Default taken | Oleksii's answer | Status |
|---|---|---|---|---|---|---|---|
| F8-F3 | 2026-10-23 | `kabinet-db-scan.test.ts`'s detector flagged `createRequire` only as a bare `Identifier` node, which misses `mod["createRequire"]` and `require("node:module")["createRequire"]` — both pull the name out via a `StringLiteral`, never an `Identifier` (from #179's review, recorded in `Claude outputs/HANDOFF-2026-10-23.md:41`) | keep enumerating identifier/property-access shapes one at a time · fail closed on any load of `node:module`/`module` itself, the same move already used for `@opika/db`'s namespace import | fail closed on the import itself — `MODULE_BUILTIN_SPECIFIERS` matched against the specifier wherever `factsOf` resolves one, not only two of its four kinds (see F8-F3-R1 below) — matches the existing `@opika/db` pattern rather than adding a third special case | — | resolved |
| F8-F3-R1 | 2026-10-23 | Review of 9f5a214, finding 1: the first version only ran the new check in the `isImportDeclaration` and `isCallExpression` branches, missing `isExportDeclaration` and `isImportEqualsDeclaration` — a real regression, since the old bare-identifier check (removed in the same commit) had caught all of: `export { createRequire } from "node:module"`, `export * from "node:module"` re-exported by name, `export { createRequire as cr }`, and `import m = require("node:module"); m.createRequire` | — | fixed: one `flagModuleBuiltin` helper, called in all four branches `factsOf` already resolves a non-type-only specifier in, so a fifth branch added later can't repeat the same omission. Comment at `kabinet-db-scan.test.ts:16` corrected (said "both places," there are four) | resolved |

## What this fixes

`apps/web/src/kabinet/kabinet-db-scan.test.ts`: the scanner that proves nothing the kabinet
reaches holds the raw database handle. Replaced the `node.text === "createRequire"` identifier
check with a specifier check (`MODULE_BUILTIN_SPECIFIERS = ["module", "node:module"]`), now
applied in all four places `factsOf` can resolve a module specifier — the static `import`
declaration, `export … from`, `import x = require()`, and the `require()`/`import()` call — so
the finding ("an import of node:module") fires however `createRequire` is later pulled out of
the loaded module. Three existing test expectations updated from `"createRequire"` to
`"an import of node:module"`; a new test covers both disguised forms the #179 review named plus
a bare named import from the `"module"` spelling.

Also fixes `docs/shelter-passwords.md:88-90`'s wording (same review, same handoff line): the
sentence conflated the cleaned chain's fixed 3-link depth (`CAUSE_DEPTH`) with the separate,
deeper fallback walk's own 64-error limit into one dense clause. Rewritten to name both
mechanisms separately, matching `clean-query-errors.ts:101`'s own doc comment, which already
drew this distinction correctly — the prose doc hadn't caught up to it.

## Review notes (not blockers — follow-up batch)

From the review of 9f5a214:
- `process.mainModule?.require("@opika/db")` and `getBuiltinModule("module")["createRequire"]`
  pass under both the old and new scanner — pre-existing gaps, not something this fix introduced
  or F8-F3 named, so left for a separate follow-up rather than expanding this PR's scope.
- `kabinet-db-scan.test.ts`'s "written in a string or comment hides no import" test still
  contains `createRequire` text that the removed identifier check used to exercise; it now tests
  nothing new. Should be swapped to `"node:module"` text, or dropped, in the follow-up batch.
- `docs/shelter-passwords.md:88`'s "(Drizzle's error, the driver's, and one more)" undercounts
  the chain by one when read as a node count rather than a hop count — inherited phrasing from
  `clean-query-errors.ts:51`'s own pre-existing comment, not introduced by this rewrite.
- No pasted `pnpm check` output in the commit bodies, only a prose summary — same process gap
  the prior review flagged elsewhere this session.

## Verified

Round 2 (9f5a214 → the fix for F8-F3-R1): `kabinet-db-scan.test.ts` 13/13 locally, confirmed the
five regressed forms the review named are caught again after the fix (checked by hand against
each form), and that the real-source-tree scan (`describe("the kabinet reaches the database
only through kabinetDb()")`) still passes with the `ALLOWED` list unchanged.

Round 1: `pnpm check` green: typecheck, lint (0 errors, same 156 pre-existing warnings as
`main`), apps/web 3028 tests (173 files), `build:web`, 151 Playwright harness specs.

Mutations recorded:
- removing the `MODULE_BUILTIN_SPECIFIERS` check from the `isImportDeclaration` branch turned
  the new F8-F3 test's namespace-import case red;
- (round 2) reverting `flagModuleBuiltin` to run only in the two original branches turns the
  `export`/`import =` forms' coverage red again — confirmed by hand, matching the reviewer's own
  mutation B.

Migration: none. No SQL changed, so no real-Neon smoke needed for this PR.
