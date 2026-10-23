# Decisions inbox: fix/f8-f3-disguised-import-scan

Row for the shared table (`docs/decisions-inbox.md`), appended at merge. Tier 1 (auth-adjacent:
the kabinet's raw-database-isolation scan). One review (per the 2026-10-23 "Who does what"
amendment, a fresh local reviewer, since this builder wrote the fix).

| ID | Date | Row | Question | Options | Default taken | Oleksii's answer | Status |
|---|---|---|---|---|---|---|---|
| F8-F3 | 2026-10-23 | `kabinet-db-scan.test.ts`'s detector flagged `createRequire` only as a bare `Identifier` node, which misses `mod["createRequire"]` and `require("node:module")["createRequire"]` — both pull the name out via a `StringLiteral`, never an `Identifier` (from #179's review, recorded in `Claude outputs/HANDOFF-2026-10-23.md:41`) | keep enumerating identifier/property-access shapes one at a time · fail closed on any load of `node:module`/`module` itself, the same move already used for `@opika/db`'s namespace import | fail closed on the import itself (removed the bare-identifier check entirely, replaced with `MODULE_BUILTIN_SPECIFIERS` matched against both the static-import and the `require()`/`import()` call forms) — matches the existing `@opika/db` pattern rather than adding a third special case | — | resolved |

## What this fixes

`apps/web/src/kabinet/kabinet-db-scan.test.ts`: the scanner that proves nothing the kabinet
reaches holds the raw database handle. Replaced the `node.text === "createRequire"` identifier
check with a specifier check (`MODULE_BUILTIN_SPECIFIERS = ["module", "node:module"]`) applied at
both places a module can be named — the static `import` declaration and the `require()`/`import()`
call — so the finding ("an import of node:module") fires however `createRequire` is later pulled
out of the loaded module, not only when the bare identifier appears in source. Three existing
test expectations updated from `"createRequire"` to `"an import of node:module"`; one new test
added covering both disguised forms the review named plus a bare named import from the `"module"`
spelling.

Also fixes `docs/shelter-passwords.md:88-90`'s wording (same review, same handoff line): the
sentence conflated the cleaned chain's fixed 3-link depth (`CAUSE_DEPTH`) with the separate,
deeper fallback walk's own 64-error limit into one dense clause. Rewritten to name both
mechanisms separately, matching `clean-query-errors.ts:101`'s own doc comment, which already
drew this distinction correctly — the prose doc hadn't caught up to it.

## Verified

`pnpm check` green: typecheck, lint (0 errors, same 156 pre-existing warnings as `main`), apps/web
3028 tests (173 files), `build:web`, 151 Playwright harness specs.

Mutation recorded: removed the `MODULE_BUILTIN_SPECIFIERS` check from the `isImportDeclaration`
branch -> the new F8-F3 test's first case (`import * as mod from "node:module"; ...`) failed
with `expected [] to deeply equal ["an import of node:module"]`, confirming the check is
load-bearing for that disguised form.

Migration: none. No SQL changed, so no real-Neon smoke needed for this PR.
