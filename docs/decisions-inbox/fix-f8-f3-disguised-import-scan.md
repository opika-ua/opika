# Decisions inbox: fix/f8-f3-disguised-import-scan

Row for the shared table (`docs/decisions-inbox.md`), appended at merge. Tier 1 (auth-adjacent:
the kabinet's raw-database-isolation scan). Two review rounds: the first (9f5a214) found a real
regression in the fix itself, fixed below; a fresh local reviewer either round, since this
builder wrote the fix.

| ID | Date | Row | Question | Options | Default taken | Oleksii's answer | Status |
|---|---|---|---|---|---|---|---|
| F8-F3 | 2026-10-23 | `kabinet-db-scan.test.ts`'s detector flagged `createRequire` only as a bare `Identifier` node, which misses `mod["createRequire"]` and `require("node:module")["createRequire"]` — both pull the name out via a `StringLiteral`, never an `Identifier` (from #179's review, recorded in `Claude outputs/HANDOFF-2026-10-23.md:41`) | keep enumerating identifier/property-access shapes one at a time · fail closed on any load of `node:module`/`module` itself, the same move already used for `@opika/db`'s namespace import | fail closed on the import itself — `MODULE_BUILTIN_SPECIFIERS` matched against the specifier wherever `factsOf` resolves one, not only two of its four kinds (see F8-F3-R1 below) — matches the existing `@opika/db` pattern rather than adding a third special case | — | resolved |
| F8-F3-R1 | 2026-10-23 | Review of 9f5a214, finding 1: the first version only ran the new check in the `isImportDeclaration` and `isCallExpression` branches, missing `isExportDeclaration` and `isImportEqualsDeclaration` — a real regression, since the old bare-identifier check (removed in the same commit) had caught all of: `export { createRequire } from "node:module"`, `export * from "node:module"` re-exported by name, `export { createRequire as cr }`, `import m = require("node:module"); m.createRequire`, and `process.getBuiltinModule("node:module").createRequire` | — | fixed two ways: one `flagModuleBuiltin` helper, called in all four branches `factsOf` resolves a non-type-only specifier in; and the bare-identifier check **restored alongside it**, not left removed — it's still the only thing that catches `getBuiltinModule(...)` property access, which no specifier check can see since that call isn't recognised as an import/require at all. Comments at `kabinet-db-scan.test.ts:118-133` and `:148` corrected | resolved |

## What this fixes

`apps/web/src/kabinet/kabinet-db-scan.test.ts`: the scanner that proves nothing the kabinet
reaches holds the raw database handle. Added a specifier check
(`MODULE_BUILTIN_SPECIFIERS = ["module", "node:module"]`), applied in all four places `factsOf`
can resolve a module specifier — the static `import` declaration, `export … from`,
`import x = require()`, and the `require()`/`import()` call — so the finding
("an import of node:module") fires however `createRequire` is later pulled out of the loaded
module. This runs *alongside* the original bare-identifier `createRequire` check (round 2,
F8-F3-R1 restored it — it's not a replacement, each catches a form the other can't). Several
existing test expectations that used to read just `["createRequire"]` or just
`["an import of node:module"]` now carry both, where a case triggers both checks (e.g. a named
import whose binding is itself the identifier `createRequire`); a new test covers every disguised
form the #179 and 9f5a214 reviews named.

Also fixes `docs/shelter-passwords.md:88-90`'s wording (same review, same handoff line): the
sentence conflated the cleaned chain's fixed 3-link depth (`CAUSE_DEPTH`) with the separate,
deeper fallback walk's own 64-error limit into one dense clause. Rewritten to name both
mechanisms separately, matching `clean-query-errors.ts:101`'s own doc comment, which already
drew this distinction correctly — the prose doc hadn't caught up to it.

## Review notes (not blockers — follow-up batch)

From the review of 9f5a214 (round 1 — addressed in round 2 above, so these two no longer apply,
left here as a record of what was raised and resolved):
- ~~"written in a string or comment hides no import" tests nothing new now the identifier check
  is gone"~~ — moot: the identifier check was restored, not left removed, so that test is
  meaningful again.
- ~~`docs/shelter-passwords.md:88` undercounts the chain by one~~ — fixed in round 2 (states the
  count only, four linked objects over three hops, rather than trying to attribute roles).

From the review of 6389e4f (round 2), still open, not fixed, genuinely follow-up material:
- `process.mainModule?.require("@opika/db")`, a `getBuiltinModule(...)["createRequire"]` form
  with no `process.` prefix, and (newly found this round) an aliased `require` —
  `const r = require; r("@opika/db")` — all pass under every version of the scanner. Pre-existing
  gaps, not something either fix introduced or F8-F3 named; batch together.
- `clean-query-errors.ts:51`'s own pre-existing doc comment on `CAUSE_DEPTH` still lists only
  3 objects, now disagreeing with `shelter-passwords.md`'s corrected count of 4 in the other
  direction — out of scope for this PR (that comment predates it), but worth reconciling
  whenever that file is next touched.
- No pasted `pnpm check` output in the commit bodies, only a prose summary — same process gap
  the prior review flagged elsewhere this session.
- This PR's second commit (the regression fix) is co-authored by Sonnet; `docs/model-policy.md`
  assigns security-relevant code to Opus. Flagged for Oleksii's awareness, not something the
  builder can fix after the fact — noted here rather than silently dropped.

## Verified

Round 2 (9f5a214 → the fix for F8-F3-R1): `kabinet-db-scan.test.ts` 14/14 locally (one new test
added this round), confirmed the five regressed forms the review named are caught again after
the fix (checked by hand against each form), and that the real-source-tree scan
(`describe("the kabinet reaches the database only through kabinetDb()")`) still passes with the
`ALLOWED` list unchanged. The 6389e4f delta review independently probed 22 forms across all
three versions (fd45e70, 9f5a214, 6389e4f) and confirmed 6389e4f catches everything either
earlier version caught, plus three more it hadn't checked for.

Round 1: `pnpm check` green: typecheck, lint (0 errors, same 156 pre-existing warnings as
`main`), apps/web 3029 tests (173 files), `build:web`, 151 Playwright harness specs.

Mutations recorded:
- removing the `MODULE_BUILTIN_SPECIFIERS` check from the `isExportDeclaration` branch turned
  the new regression test's export-from case red;
- the 6389e4f delta reviewer independently ran two more: removing the `import =` branch's check
  (1 test red), and removing the identifier check entirely (4 tests red, including the
  `getBuiltinModule` case) — confirming neither check subsumes the other.

Migration: none. No SQL changed, so no real-Neon smoke needed for this PR.
