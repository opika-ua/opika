# Review: uncommitted admin_joined (IN-Q14), feat/h2-admin-joined on d1743a3

VERDICT: PASS WITH NOTES

VERIFIED | TAKEN ON TRUST
---|---
Domain variant is exactly `{ kind, at, shelterAdminId: ShelterAdminIdSchema, invitationId: InvitationIdSchema, email: z.email() }` (history.ts diff read) | The full `pnpm check` (1832 unit / 217 harness, read from the builder's pasted output; I did not re-run it, harness port shared)
`InvitationIdSchema = brandedId<"InvitationId">()` in ids.ts | 10 of the builder's 11 listed mutations (all describe a concrete break with its failure text; not re-run)
Projection is built field by field: `{ kind, at, actor: { kind: "shelter" }, email }`, no spread; actor view has no id variant | That the relayed IN-Q14/12/13 text matches what Oleksii actually sent (the inbox says so, labelled "relayed")
Operator view: `HistoryEntryViewSchema = ShelterHistoryEntrySchema` (views.ts:124); contracts test parses through the procedure's own output schema and keeps both ids |
My own mutation: projection returns `{ ...entry, actor }` (cast) -> 2 red: per-kind test "expected { kind: 'admin_joined', ...(3) } to deeply equal { ...(5) }" and the exact-item test. Restored; diff stat unchanged (8+/4-) |
Suites: domain 451, contracts 194, i18n 23, db kabinet-shelter-repo-many.test.ts 8, all passing against the local test DB |
Copy: uk placeholder is `[COPY PENDING]` + English sense + Oleksii's two drafts quoted, the same convention as `kabinet.confirm.submit`; no Ukrainian beyond his drafts; pinned by copy-status.test.ts (pending + both drafts present) |
IN-Q14 inbox row: shape, "one field", invitationId-to-operator, no gendered past tense, both drafts all match the prompt's text; paraphrase ("Reason, recorded as asked", "Built on this branch", "Operator view, confirmed") sits outside the quote and is labelled |
No accept statement, writer or migration scaffolded; 12 modified + 1 untracked file, all in scope |
Doc comments in history.ts, history-shelter-facing.ts, db/schema/shelter-history.ts ("no evidence and no ids"): checked against the projection; no shelter-facing variant carries any id |

FINDINGS (most severe first)
1. [minor] packages/domain/src/shelters/history-shelter-facing.test.ts:119 — the per-kind test title still reads "carries no moderator id or evidence", but the body now checks admin and invitation ids too (key walk at any depth). A stale title is a small wrong claim. Fix: "carries no id or evidence".
2. [note] packages/domain/src/shelters/history.ts, admin_joined doc comment — "Written only by the accept's own atomic statement ... never after it" describes a writer that doesn't exist yet (IN-Q12/13). It is consistent with Oleksii's IN-Q12 invariant, but nothing enforces it until the accept lands. The accept's review needs to check that this sentence becomes true.
3. [note] InvitationIdSchema has no dedicated test. It uses the shared `brandedId`, which is already covered, and the "refuses without either id" test covers it being present. Acceptable as is.

SIMPLIFICATIONS
- history.test.ts "refuses ..." repeats the `Extract<...>` cast three times. One `const joined = ENTRIES.admin_joined as Extract<...>` would do. Cosmetic; nothing breaks.

TESTS
domain 24 files / 451 passed; contracts 4 / 194; i18n 4 / 23; db kabinet-shelter-repo-many.test.ts 1 / 8 (scoped runs, not a workspace total). Builder's workspace total: 1832 unit, 217 harness.
