# Review: H2 handlers slice rows 1-2 (uncommitted tree vs 4b81960), Tier 1, synchronous

VERDICT: STOP (blocks the merge, not the commit). Fix finding 1 before committing; 0009 must not reach a rehearsal branch as it stands.

VERIFIED | TAKEN ON TRUST
--- | ---
Column names and required-ness match Better Auth 1.6.33 `getSchema()` for the stated options (ran it: all 7 models, every field and nullability match; FK targets match) | Builder's mutation on the `auth_member` unique index, and on the exact-columns test (both present in the description and plausible; not re-run)
**Ids: NOT OK.** Probe: real `betterAuth` + `drizzleAdapter(provider:"pg")` against local opika_test, `signUpEmail` → `23502 null value in column "id" of auth_user` | That the TS schema and the 0009 snapshot agree (I did not run drizzle-kit generate)
Drizzle adapter: `db.transaction` only on `provider === "mysql"` paths (lines 147, 511, 552) and when `config.transaction` is truthy (578). Claim true | Neon behaviour for anything here (local only)
`history.test.ts` byte-identical to HEAD (`git diff --quiet` → clean) | Pasted `pnpm check` (no commit yet; caller's numbers accepted)
0009 is additive: 10 CREATE TABLE, 1 nullable ADD COLUMN, constraints/indexes only. Safe on 2 shelters (all-null unique is fine) |
Organization plugin: `createOrganization` always inserts a creator member (crud-org.mjs:79-100); `createInvitation` requires the inviter to be a member (crud-invites.mjs:90-94); `acceptInvitation` inserts a member |
Domain no-engagement test mutated myself: nested `adopterId` → red `expected [ 'adopterId' ] to deeply equal []`. Same mutation showed `revealedBy` slipped through (finding 3) |
No brand strings in diff; no other `kabinetContract` importers left |

FINDINGS
1. [high] auth.ts:21-117, 0009 — every Better Auth id is `text PRIMARY KEY` with no default. With `generateId: "uuid"` on pg, `supportsUUIDs` is true, so Better Auth deliberately **omits** the id and expects the database to generate it (core `get-id-field.mjs:16`: `useUUIDs → shouldGenerateId = !supportsUUIDs`).
   Failure: every sign-up / org / session / verification insert → NOT NULL violation. Evidence: probe above.
   Fix (pick one, re-test with a real adapter insert): `uuid().primaryKey().defaultRandom()` (CLI's shape; then every `*_id` FK, `super_admins.user_id`, `shelters.organization_id` must be `uuid` too), or keep text with `.default(sql\`gen_random_uuid()::text\`)`. Add a test that inserts through Better Auth's adapter, not raw SQL. The raw-SQL member test supplies ids, which is why nothing caught this.
2. [medium, decision] auth.ts:115 vs the registry PR's invite flow. With one membership per user, the operator can never be a member of more than one org. Better Auth's invite endpoint refuses inviters who aren't members, and `createOrganization` makes its caller owner. So "the operator invites a shelter's first admin" cannot go through the plugin's endpoints. It has to be server-side adapter writes (`auth_invitation.inviter_id` is NOT NULL FK, so whose id goes there?). The index is defensible. The flow it forces isn't recorded anywhere.
3. [low] history-no-engagement.test.ts:47-60: whole-word match misses inflections (`revealedBy`, `viewedAt`, `swipedAt`). Fix: match each camelCase word with `startsWith` on stems (`adopter`, `reveal`, `swip`, `view`, `seen`). `reviewer` still splits as a single word and passes.
4. [low] shelter-history.test.ts:12-13: the comment says the entry shape is pinned in `history.test.ts`. It is pinned in `history-no-engagement.test.ts`.
5. [note] seed.ts:1421 `TRUNCATE … shelters … CASCADE` now also wipes `shelter_history` (not in the diff; the guard limits it to demo data). Say so in that comment when a writer exists.

FK choices are right: `shelter_history → shelters` NO ACTION (history must block deleting a shelter), `shelters.organization_id` NO ACTION, auth children cascade.

SIMPLIFICATIONS
- None worth taking. `better-auth` with no importer is fine because Phase 0 sequenced it.

STOP REASON
Two items need Oleksii (Tier 1, security/authz):
(a) HS-T2. `super_admins` table vs the `users.role` that the proposal and Phase 0 named. The builder reported it rather than resolving it silently. The reasoning holds, and a separate table also avoids clashing with Better Auth's own `admin` plugin `role` field. Still his call.
(b) Finding 2. Confirm that first-admin invites go through server-side adapter writes (and say which user is `inviter_id`), or relax the unique index.

TESTS
db shelter-history.test.ts 4 passed · domain src/shelters 9 files / 152 passed · contracts src/kabinet 105 passed · web kabinet-cross-tenant 1 passed + 16 todo
