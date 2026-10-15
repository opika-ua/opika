# H2: what the next two PRs must carry

Order decided by Oleksii, 2026-10-13 (inbox HS-Q13, verbatim there): **the registry PR first, the invite PR after it.** Each
section below is copied into that PR's checklist when it opens. A box here is a merge blocker
unless it says otherwise. Sources are inbox rows in `docs/decisions-inbox.md`.

---

## Registry PR (next)

Serves `registryContract`: `registry.*` plus `session.exitSupport` (HS-Q1). Tier 1: Phase 0
questions go to Oleksii before code.

- [ ] **`admin:bootstrap <email>`** (RG-Q2): behind the production guard; prints the host and the
      email, asks for confirmation, creates the user **and** grants super_admin, and refuses if
      any active super_admin exists (one-time only).
- [ ] **`admin:grant` / `admin:revoke`** (HS-Q4, HS-T11: a merge blocker here), for later admins. Behind the
      production guard. `admin:grant` prints the host and the target email, asks for
      confirmation, and refuses unless the user already exists. `admin:revoke` sets `revoked_at`
      and never deletes (HS-T2).
- [ ] **`animals.version`** (S3-T6) in this PR's migration, **rehearsed on a child branch**
      before production. Edits compare-and-set on `version`; listing moves keep their own guard.
- [ ] **Migration 0011 frozen before any rehearsal** (RS-R1): the PR names the commit holding the
      final 0011, and anything later goes in 0012. After the rehearsal, `pnpm --filter @opika/db
      db:check-hashes` against the rehearsal branch prints `match` for 0011 (its recorded hash
      equals the committed file's).
      **Frozen at 6b7fa12** (unchanged since; `drizzle-kit generate` reports no schema drift), and
      `check-migration-hashes.test.ts` pins its hash, so an edit fails CI instead of a rehearsal.
      **On production 2026-10-13** (ep-dawn-pond-b1dz515g, Oleksii, RG-R4): `db:check-hashes` 12/12
      match; 12 migrations; animals 18, all `version` 0; `support_sessions` and
      `invitation_created_users` exist, 0 rows; shelters 2, auth users 0.
- [ ] **The registry answers 503 without `LOCATION_HMAC_SECRET`** (RG-Q10) while the kabinet is
      unavailable. Shelter create and address changes recompute the public location with that
      key. `apps/web/src/api/env.ts`'s required production schema does not gain it here.
- [ ] **`pnpm --filter @opika/db location:verify`** exists (RG-Q10): read-only, behind the production
      guard, prints the host, recomputes every shelter's public location with the configured key,
      prints counts only, and exits non-zero on any mismatch. Seeded rows are classified by
      identity, not by key (RG-Q11): a seed-range id (`51000000-…`) on the test-only key counts
      as `demo` on its own line and passes; the test-only key on any other id is a separate
      `PRIVACY` failure. One test per path.
- [ ] **The registry's multi-step writes run on a real Neon branch** (Oleksii, verbatim, 2026-10-13: "I'll
      create a fresh child branch, rehearsal-0011, and give you its endpoint id. Run 0011 there with
      --expect <that endpoint>, then the registry's multi-step write tests against the same branch.
      Report the counts."), through the production driver
      (neon-http), each statement named (review of the registry handlers, finding 6):
      `applyAuditedMany` (UNION ALL history rows + the at-shelter animals CTE), `createWithHistory`,
      `removeMember` (membership + sessions + history), `withdrawPending`, `createInvitation` and
      `resend` with their history rows, support `touch` (`make_interval`), and the S1 list's
      row-comparison keyset. Counts reported.
      **Run 2026-10-13 on rehearsal-0011 (ep-crimson-pine-b1ka29bi):** 0011 applied, `db:check-hashes`
      12/12 match (0011 included), `db:neon-smoke` 14 passed / 0 failed.
- [ ] Invitations go only through `kabinetInvitationRepo`, with the operator's own user as the
      inviter (HS-Q7). The end-to-end accept test passes on the pinned better-auth.
- [ ] *Existing invariant (HS-Q7, already tested):* the organization plugin keeps `allowUserToCreateOrganization: false`.
      `FORWARDED_AUTH_PATHS` gains no organization path until the invite PR forwards
      accept-invitation on purpose.
- [ ] *Existing invariant (HS-Q3, already tested):* `no-self-serve-yet.test.ts` stays green. Nothing here lets a real shelter sign in;
      production still answers 503 (no sender).

## Invite PR (after the registry PR)

The first PR in which a real shelter can sign in (HS-Q3). Tier 1.

**Merge readiness, checked 2026-10-15 at 85bc73e (EM-B11).** Every box under "#94's merge" is
ticked with its evidence or marked superseded with the decision that moved it; CI `check` is green
on 85bc73e. One Tier 1 default wants Oleksii's word before the merge: EM-T26 (b), below. Everything
under "Wiring commit and production rollout" happens after the merge and blocks only that step.
The branch inbox files fold into `docs/decisions-inbox.md` in a separate docs PR after the merge,
as #87 did. Done on `chore/inbox-fold` (2026-10-15): all six files (#89, #93, #95, #94) are rows in
`docs/decisions-inbox.md` and the branch files are deleted.

### #94's merge

- [x] **Superseded, not a #94 merge blocker: "the `/prytulkam` A1–A3 and B1 copy is live in this
      PR"** (HS-Q3, commitments #6 and #7, `docs/h2-copy-sheet.md`). #94 turns no sign-in on and
      opens no shelter write, so no commitment sentence goes false with its merge. Where each part
      went: **A2 and A1** ship in the wiring commit (EM-Q1, Oleksii, verbatim: "(b). A2 keeps the
      current text; the new paragraph ships in the commit that turns production sign-in on."; A1,
      row 91: "ship it in the same commit as row 89"), items under the wiring commit below,
      together with the `no-self-serve-yet.test.ts` change. **A3** stays as it is (answer 3,
      verbatim: "A3: keep as is.", `docs/h2-copy-sheet.md` A3). **B1** moves to the edit-screens
      gate: shelter writes stay refused until K2/K3 (KH-Q1), so nothing can move a confirmation
      date and commitment #7's «оновлювали» stays true; B1's replacement ships with K2/K3.
- [x] **Magic-link provider:** Brevo (IN-E2, 2026-10-13), Resend the documented fallback, not set
      up. Gmail delivery test by `email:delivery-test` (IN-E5); ukr.net/i.ua postponed with a trigger
      (IN-E4); apex DMARC `p=reject` is a follow-up (IN-E3). **Superseded for sign-in on 2026-10-15**
      (EM-R1 fired, EM-B6 item 2: "Resend for SIGN-IN sends: GO"): see the Resend items below.
      **Superseded for invites on 2026-10-15** (EM-B10, after delivery test 5: "Decision: invites
      move to Resend; retire Brevo."): one provider, Resend, for all email.
- [x] **Resend set up for sign-in** (Oleksii, 2026-10-15, inbox EM-R3/EM-B8: "RESEND: done and
      Verified."): EU account (`eu-west-1`), domain `mail.opika.org.ua` Verified, tracking off. DNS in
      Cloudflare, all DNS only: TXT `resend._domainkey.mail` (DKIM), CNAME `rsend.mail` →
      `rsend-euw1.forge.rmta.net` (the bounce / return-path domain, so SPF: delivery test 4 showed SPF
      passing for `rsend.mail.opika.org.ua`, relaxed-aligned with the From domain), CNAME `send.mail` →
      `send.forge.rmta.net` (the other CNAME Resend requires; not the SPF domain, corrected per test 4,
      EM-B9); Brevo's records and DMARC unchanged.
- [x] **`RESEND_API_KEY` in Vercel Production and in `.env.local`** (EM-B8; key name EM-B7): a
      sending-only key restricted to `mail.opika.org.ua`. Read by the app only once
      `EMAIL_SIGN_IN_PROVIDER=resend` is set (the wiring commit, below).
- [x] **Delivery test 4 (sign-in via Resend)** (Oleksii's, by hand, 2026-10-15; inbox EM-B9):
      sign-in via Resend landed in **Promotions** (~1 s), DKIM pass `d=mail.opika.org.ua` (plus
      amazonses.com), SPF pass for `rsend.mail.opika.org.ua`, DMARC pass, no List-Unsubscribe, no
      pixel, direct links; invite via Brevo in Primary (~2 s), still with List-Unsubscribe, an open
      pixel and the link rewritten through Brevo's click tracker. **Sign-in in Promotions is accepted**
      (his decision, EM-B9: "accept Promotions for sign-in (copy row 10 already points people there),
      no more email-version experiments for now").
- [x] **Delivery test 5 (both via Resend)** (Oleksii's, by hand, 2026-10-15; inbox EM-B10): invite
      via Resend in **Primary** (~1 s), sign-in via Resend also Primary this time (Promotions in test
      4; one inbox, not conclusive, copy row 10's Промоакції hint stays); both DKIM pass
      `d=mail.opika.org.ua s=resend` (+ amazonses), SPF pass `rsend.mail.opika.org.ua`, DMARC pass,
      no List-Unsubscribe, no pixel, links straight to `https://opika.org.ua/kabinet/vkhid…`,
      Reply-To `hello@opika.org.ua`. **His decision: invites move to Resend; retire Brevo** (EM-B10;
      order: code, then the Production switch-on, then a 30-day grace, then removals each with his
      OK).
- [x] **Code: every route reads its provider's own key** (EM-B10 step 1, his words: "the invite path
      reads RESEND_API_KEY via the provider switch, same as sign-in. No sends with a mismatched
      provider/key pair at any point."): `PROVIDER_KEY_NAMES` covers every provider
      (`RESEND_API_KEY`, `BREVO_API_KEY`, `POSTMARK_API_KEY`), `EMAIL_PROVIDER_API_KEY` is gone, a
      provider named without its key is `invalid` (sign-in off). The registry's blocked-addresses
      view and the per-invite check answer `unknown` (`provider_suppresses`) on Resend (EM-T26);
      EM-F1 stays a follow-up. **Done:** 7f1ab18 (EM-T26), Tier 1 review PASS WITH NOTES
      (`docs/reviews/feat-h2-invite/invites-resend.md`, its own mutation spot-check red as
      expected); its finding 1 is the `LOCATION_HMAC_SECRET` line in the switch-on item below,
      finding 2 (two stale comments) is a wiring-commit item below. CI green on 85bc73e.
- [ ] **EM-T26 (b) confirmed by Oleksii** (a Tier 1 default, so it holds the merge until he
      answers): on Resend, the registry's blocked-addresses view answers `unknown`
      (`provider_suppresses`) instead of listing blocked addresses, until EM-F1 reads Resend's
      suppression list. EM-P1 named (a) EM-F1 first or (b) this as "his call"; (b) was taken as the
      default. Its consequence: IN-E9's operator notice (EM-B1 answer 4's blocked-addresses view)
      shows nothing on Resend, and a non-block failure stays log-only, address masked. Consistent
      with EM-B6 item 2b, verbatim: "Resend sends show the block-list check as "not checked" for
      now; scanning Resend's suppression list is a follow-up", which was said of sign-in sends.
      Recommended: confirm (b).
- [x] **The /pro `about.data` addition is live in this PR** (KH-C1; moved back from the wiring
      commit by Oleksii's handoff of 2026-10-14, verbatim: "Row 90 ships with the #94 merge (all it
      describes is live via #95, and #94 starts storing admin emails at invite)."): his final text,
      appended to `about.data`, pinned in `copy-status.test.ts` and `/pro`'s `page.test.tsx`. Claims
      checked against the code in inbox EM-T17. EM-Q11's two findings answered (a) (his words: "With
      these, the /pro sentence ships exactly as written, with the #94 merge.") and built (EM-T20,
      EM-T21); rechecked in EM-T17: every claim true of the registry's own storage. Vercel's request
      logs are recorded as an infrastructure limit, not a copy change (EM-L1).
- [x] **`RATE_LIMIT_KEY_SECRET` set in Vercel Production** (EM-Q11; Oleksii, 2026-10-14, verbatim:
      "RATE_LIMIT_KEY_SECRET ... already set"; the "..." is the relay's elision). Every rate limiter
      keys a client IP as `ip:` + HMAC-SHA256 under it (EM-T20); a production build fails, and a
      production instance refuses to boot, without one of 32+ characters.
- [x] **`RATE_LIMIT_KEY_SECRET` set in Vercel Preview (separate value)** (Oleksii, 2026-10-15, EM-B6
      item 4, verbatim: "RATE_LIMIT_KEY_SECRET required on every Vercel deployment, including Preview
      (separate Preview value). Build-time check covers both."; EM-T23). From this PR a Preview build
      fails, and a Preview instance refuses to boot, without one of 32+ characters. **Done**
      (EM-B8: "Set in Vercel Preview as Sensitive, with its own value, separate from Production.")
- [x] **Before a reveal, adopters receive the city only** (EM-Q10, answered (a); EM-T19): no
      `district` and no coordinates in any pre-reveal response (`feed.list`, `gallery.list`,
      `animals.byId`, `shelters.byId`, `cities.list`), held by a schema walk and a served-response
      test. Row 57 (`kabinet.profile.addressNote`) is live again with his text. **Since 2026-10-15
      the reveal sends no exact address, district or coordinates either** (EM-D1, decision #2
      revised): `animals.reveal` and `reveals.listMine` carry contacts and the city only; the
      contract walk now covers every adopter-facing output with no exemption, plus a served-JSON
      test.
- [x] **The daily auth clean-up also deletes sessions past the 30-day absolute cap** (EM-Q11 (2);
      EM-T21), in the same statement, tested locally with the cap passed and the idle expiry ahead.
- [x] **Real-Neon rerun of step 18 with the 30-day cap condition** (EM-T21): Oleksii reruns
      `neon-smoke.ts`; step 18 now also checks a session past the cap (idle expiry ahead) goes and
      one just under it stays. **Done 2026-10-15** (EM-B11 item 1, verbatim: "Neon smoke rerun
      (step 18), from D:\opika-worktrees\invite (feat/h2-invite), target ep-calm-math-b1ffs8rq
      (smoke-invite): 18 passed, 0 failed. All accept paths pass (idempotent, membership_conflict
      shape, duplicate-invitation cancel). Auth clean-up deleted 2 verifications + 2 sessions; live
      and under-cap rows were kept, expired and past-cap rows were gone. Tick it on the merge
      checklist.").
- [x] **`KABINET_OPERATOR_DISPLAY_NAME` set in Vercel Production** (Oleksii, 2026-10-14, verbatim:
      "KABINET_OPERATOR_DISPLAY_NAME=Олексій Колотенко is set in Vercel Production (nominative). Tick
      it on the #94 merge checklist"). It signs both emails (`— {operator}`) and labels the
      operator's history lines.
- [x] **Delivery test 3** (Oleksii's, by hand; his action c, 2026-10-14): both emails to the same
      Gmail with the operator name set, `--operator-name "Олексій Колотенко"`. He reports the tabs.
      Run 2026-10-14 14:24 UTC: both emails held at Brevo ("Sent" only, no delivered, deferred or
      blocked event); open, inbox EM-R2. His instruction: "Don't resend."
      Trigger recorded (EM-R1): if the reworked sign-in email still lands in Promotions, sign-in sends
      are proposed for Resend; invites stay on Brevo while they land in Primary.
      **Reported 2026-10-15** (EM-B6 item 1): both delivered at 15:11 UTC, 47 min late; sign-in →
      Promotions (second time), invite → Primary. EM-R1 fired; sign-in moves to Resend (EM-T22).
      **Done:** test 3 reported (EM-B6 item 1); tests 4 and 5 followed (items above).
- [x] **An invitation reaches the invitee.** The registry PR's `registry.admins.invite` and
      `registry.shelters.create` write the invitation and the invitee's user but send nothing
      (no provider yet). This PR decides how the invitee hears of it (an invite email through the
      provider, or the operator telling them and them signing in by magic link) and tests it.
      **Decided and built:** an invite email through the provider (IN-Q3, IN-E2; Resend since
      EM-B10), its landing page that sends a fresh magic link (IN-Q11, EM-T6, EM-T9), the
      operator's reminder to tell the shelter personally (IN-E13, EM-B2), the automatic accept on
      first sign-in (IN-Q12–IN-Q14). Delivered to a real Gmail inbox in Oleksii's delivery tests
      1–5 (IN-E6, EM-B6, EM-B9, EM-B10; test 5: invite via Resend in Primary). Production sending
      is connected by the wiring commit (below); until then production sends nothing.
- [x] **`/kabinet` page loads are rate limited** (inbox KS-Q3, answered as KH-Q8): built on
      `feat/h2-kabinet-hardening`. `proxy.ts` charges every `/kabinet` page load against the
      kabinet limiters (per IP, then per user), keyed as the API keys them, and answers 429.
- [x] **Shelter writes stay refused** (KH-Q1): `SHELTER_WRITE_POLICY` stays
      `refused_until_edit_screens` in this PR. Production sign-in turning on does not open them;
      only the K2/K3 PR does, together with the A1/A2/B1 replacement copy.
      **Holds at 85bc73e:** #94 does not touch `access.ts`; `SHELTER_WRITE_POLICY` is
      `{ kind: "refused_until_edit_screens" }`, pinned by `shelter-writes-refused.test.ts` (walks
      the served router, every shelter write refuses) and `access.test.ts`: 112 passed, run
      2026-10-15 in the invite worktree; CI green on 85bc73e.
- [x] **`CRON_SECRET` is set before the hardening branch deploys** (KH-T6; done, EM-B8): Oleksii sets it
      (`openssl rand -hex 32`) in Vercel's Production environment first; production refuses to
      boot without it. Then the daily auth clean-up (KH-Q9) runs at 03:00 UTC.
- [x] **Real-Neon run of the auth clean-up statement** (KH-Q9): done twice: #95's run (step 15
      there) and #94's final run (step 18 after the merge renumbering, below): 1 verification + 1
      session deleted, live rows kept. Covers the statement before EM-Q11's 30-day condition; the
      rerun with it is ticked above (EM-B11 item 1).
- [x] **#94's statements on real Neon** (IN-Q9), Oleksii's run of 2026-10-14 as relayed by the
      coordinating session: `db:neon-smoke` on `smoke-invite` (`ep-calm-math-b1ffs8rq`, a fresh
      child of the production branch), run from the invite worktree: **16 passed, 0 failed**. Step 15
      (the accept): accepted, then `nothing_to_accept` on re-run; 1 membership, 1 `admin_joined`
      (idempotent on real Neon). Step 16 (the one-membership conflict on the neon-http driver):
      typed `membership_conflict`, the invitation stays pending.
- [x] **#94's final real-Neon verification** (IN-T16), Oleksii's rerun of 2026-10-14 as relayed by
      the coordinating session, on `smoke-invite` (`ep-calm-math-b1ffs8rq`) from the invite
      worktree: **18 passed, 0 failed**. Step 17 (duplicate invitations): newest accepted, older
      canceled, 0 pending. Step 18 (#95's auth clean-up, post-merge numbering): 1 verification + 1
      session deleted, live rows kept. Step 14 (bootstrap) refused: an operator from the previous
      run on this branch, expected.
- [x] **The one-membership unique violation is a typed error, never a 500** (IN-Q8, IN-T1): in the
      PR that first writes `auth_member` (auto-accept on first sign-in), `auth_member_user_id_unique`
      maps to `ADDRESS_HAS_A_ROLE` (`shelter_admin`), with a test that accepts two invitations for one
      address and asserts the typed refusal. Built in #94 (`kabinetInvitationAcceptRepo`), tested on
      postgres-js, and verified on neon-http by the real-Neon smoke's step 16 above.
- [x] **`registry.admins.invite` refuses an operator's address** (RG-T10; Oleksii, verbatim: "RG-T10:
      accepted as an invite-PR item. It must land before admin:bootstrap."), so inviting an operator can
      never end in `conflicting_roles`. Lands before the rollout's `admin:bootstrap` step.
      **Done:** 5f95dc1 (`ADDRESS_HAS_A_ROLE`, reason `operator`), with review ee847a2's finding 1
      (every write that makes an invitation live re-checks) fixed in 854a322; pass 2: "Finding 1 is
      fixed" (`docs/reviews/feat-h2-invite/ee847a2.md`).
- [x] **`www.opika.org.ua` redirects 308 to the apex** (IN-R2, Decision 2): a Vercel domain setting,
      Oleksii's action before sign-in goes live; `PRODUCTION_ORIGIN` is `https://opika.org.ua`.
      Done (EM-B8; Oleksii, verbatim: "www.opika.org.ua is added in Vercel as a 308 redirect to
      opika.org.ua, with a DNS-only CNAME in Cloudflare. Vercel shows it Valid."). Checked by the
      Resend-route review: `www.opika.org.ua/kabinet?x=1` → `308`,
      `Location: https://opika.org.ua/kabinet?x=1`.

### Wiring commit and production rollout (after #94 merges; not #94 merge blockers)

Oleksii's order from the merge on (EM-B11 item 3, verbatim): "a. CI green on #94, then I merge
and wait for the Production deploy. b. location:verify --prod (after your answer to 2), target 0
mismatches. c. The 7 ADD variables in Production only (...). KEEP, DON'T ADD and REMOVE stay as
you listed. d. No manual redeploy: the wiring commit's deploy picks them up. e. Before the wiring
commit, give me a names-only check (e.g. vercel env ls production) and the exact list of names
you expect, so a typo is caught before switch-on. Never ask for values." (The "(...)" is the
relay's elision.)

- [x] **The location key reaches the app, verified first** (RG-Q10; Oleksii, verbatim: "Invite PR
      rollout checklist, before the env schema change: I set the secret in Vercel (same value as
      the onboarding script's), then run location:verify against prod with that value → must
      report 0 mismatches."), in this order, **before** the env schema change below:
  1. Oleksii sets `LOCATION_HMAC_SECRET` in Vercel (production), the same value the onboarding
     script uses. **Done 2026-10-15** (EM-B11 item 2, verbatim: "I've now generated one (32 random
     bytes, hex) and set it in Vercel Production. I keep the value myself; it's used for every
     onboarding run and never rotated."). No shelter was ever onboarded with an earlier key (his
     words: "never existed before today").
  2. Oleksii runs `location:verify --prod` against production with that value: **0 mismatches**
     and no `PRIVACY` line. A `demo` count is expected while the seeded corpus is on production.
     **Done 2026-10-15** (EM-B12, his report verbatim: "Target: Neon endpoint ep-dawn-pond-b1dz515g
     (production, matches RG-R4) match 0 / demo 2 (seeded fictional shelters on the test-only key) /
     MISMATCH 0, no PRIVACY line."). With no real-key rows yet this proves nothing about the key
     itself (RG-T1): the first `onboard:shelter --commit` is the real test (expect `match 1`).
- [ ] *Not a blocker, a note:* the `demo` line goes to 0 when the demo corpus is removed at the
      first real shelter (RG-Q11). From then on, any `demo` count means seeded rows survived that
      removal, which is a finding in its own right.
- [ ] **Names-only check before the wiring commit** (EM-B11 item 3e): Oleksii runs
      `vercel env ls production` (names only, never values) and compares it against the expected
      list, which the wiring commit's Phase 0 restates: the seven ADDs below, the KEEPs below,
      `LOCATION_HMAC_SECRET`, and none of the DON'T ADDs.
- [ ] **Production switch-on (EM-B10 step 2; Oleksii sets the variables himself), after the code
      above is deployed.** Vercel, **Production environment only**, never Preview:
      - **ADD** `EMAIL_PROVIDER` = `resend`
      - **ADD** `EMAIL_FROM_ADDRESS` = `noreply@mail.opika.org.ua`
      - **ADD** `EMAIL_FROM_NAME` = `Opika` (optional in code; without it the From is the bare
        address, which the delivery tests never sent)
      - **ADD** `EMAIL_REPLY_TO` = `hello@opika.org.ua` (required: no Reply-To, sign-in stays off)
      - **ADD** `PRODUCTION_ORIGIN` = `https://opika.org.ua`
      - **ADD** `BETTER_AUTH_SECRET` (`openssl rand -hex 32`, Sensitive) and `BETTER_AUTH_URL` =
        `https://opika.org.ua` (must equal `PRODUCTION_ORIGIN`)
      - **KEEP** `RESEND_API_KEY` (set, EM-B8), `KABINET_OPERATOR_DISPLAY_NAME`, `CRON_SECRET`,
        `RATE_LIMIT_KEY_SECRET` (set)
      - **DON'T ADD** `EMAIL_SIGN_IN_PROVIDER` (unset means sign-in uses `EMAIL_PROVIDER`; setting it to
        `resend` changes nothing) or `BREVO_API_KEY` (only a rollback to Brevo would need it)
      - **REMOVE** nothing yet. `EMAIL_PROVIDER_API_KEY`, if it was ever set in Vercel, is read by no
        code from this commit on; as the Brevo key's Vercel variable its removal is a retirement step
        below, with his OK.

      **None of this turns anything on.** Until the wiring commit, production answers 503 on
      `/api/auth` and `/api/kabinet` whatever is set (`kabinetAuthAvailability`), nothing reads the
      `EMAIL_*` variables in production, and nothing sends. They are read by `productionSignInOf`,
      which the wiring commit connects. Then sign-in and invites go out through Resend on
      `RESEND_API_KEY`.
      Also required before the wiring commit, as its own earlier step (rollout order Q10): `LOCATION_HMAC_SECRET` in Vercel Production, the same value the onboarding script uses, then `location:verify --prod` reports 0 mismatches; without it every `/registry/` call answers 503 (review of the step-1 code, finding 1).
- [ ] **`LOCATION_HMAC_SECRET` joins the required production env schema** (RG-Q10) in
      `apps/web/src/api/env.ts`, only after the step above. The same change rewrites the comments
      that say it is never in Vercel (`env.ts`, `onboard-shelter.ts`'s R2 note), which become false.
- [ ] **A production build fails without the five sign-in variables** (IN-R2, Decision 1;
      Oleksii, verbatim: "From the commit that turns sign-in on: A production build fails if any of
      the five variables is missing, so a bad deploy never goes live. Keep the runtime boot check as
      a second guard. Until that commit, nothing changes."): `EMAIL_PROVIDER`, the selected
      provider's own key (`RESEND_API_KEY` for `resend`; `EMAIL_PROVIDER_API_KEY` is gone, EM-B10),
      `EMAIL_FROM_ADDRESS`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (plus
      `PRODUCTION_ORIGIN`, which they are checked against), in the wiring commit, with a test.
      Whether `PRODUCTION_ORIGIN` itself joins the build-time check (a sixth variable, beyond
      Decision 1's five) is decided in the wiring commit's Phase 0 (review pass 2, finding 4).
      **`EMAIL_REPLY_TO` is now required by `emailProviderConfigOf`** (Oleksii, 2026-10-14, answer 5:
      "Reply-To: hello@opika.org.ua on all emails"), so sign-in stays off without it; whether it
      joins the build-time list too is the same Phase 0 question as `PRODUCTION_ORIGIN`.
- [ ] **The wiring commit turns production sign-in on through `productionSignInOf`**, which now also
      stays off while any `kabinet.*` string (email templates included) is `[COPY PENDING]`
      (Oleksii, answer 7). It builds `providerMagicLinkSender` with `operatorName` from the `on`
      result (`ProductionSignIn.operatorName`, i.e. `operatorDisplayName(env)`), so the sign-in email
      is signed with the same name as the invite (the option is required; a test on the wiring
      asserts the configured name reaches the sent email). That commit wires the provider-backed invitation sender with
      `cachedBlockList(config)` built once per process; on Resend it answers `unknown`
      (`provider_suppresses`, EM-T26) until EM-F1 reads Resend's suppression list. **Routes
      (EM-T22):** the `on` result's `email` is `emailRoutesOf(env)`'s `{ invite, signIn }`; pass
      `routes.signIn` to `providerMagicLinkSender` (its `ProviderMail` built on that route, so a
      Resend route's block check is `unknown`/`provider_suppresses`) and `routes.invite` to the
      invitation sender and to `cachedBlockList`, with a test that each sender reaches its own
      provider. **Vercel Production variables:** the switch-on list above (EM-B10); with
      `EMAIL_PROVIDER=resend` and `EMAIL_SIGN_IN_PROVIDER` unset, both routes are Resend on
      `RESEND_API_KEY`. (This item said `EMAIL_SIGN_IN_PROVIDER=resend` before test 5; not needed
      now.)
- [ ] **The confirm page's over-limit card ships before production sign-in is turned on**
      (IN-T15, Oleksii: "A plain 429 is fine for now. Add a gate item: the over-limit card ships
      before production sign-in is turned on."). Today a rate-limited «Увійти» POST answers a plain
      429.
- [ ] **A2's new third paragraph ships here (EM-Q1)**, in the wiring commit itself (Oleksii,
      verbatim: "(b). A2 keeps the current text; the new paragraph ships in the commit that turns
      production sign-in on."). **Final yes given** (2026-10-14, row 89 of the PR #94 copy export,
      verbatim: "FINAL YES as drafted"); the text is on `docs/h2-copy-sheet.md` A2. The same commit
      updates `copy-status.test.ts`'s A2 pin, commitments row 6 in
      `docs/standing-constraints.md` and the `docs/marketing/brand-voice.md` note.
- [ ] **A1's added line ships in the same commit** (row 91, final, 2026-10-14, verbatim: "Place it
      directly before the current last paragraph of §7, and ship it in the same commit as row 89."):
      «Доступ до кабінету я надсилаю сам — листом на адресу, яку ви мені вкажете.»
      (`docs/h2-copy-sheet.md` A1), with a `copy-status.test.ts` pin on its position.
- [ ] **The runtime boot check stays as the second guard** (IN-R2, Decision 1): production refuses
      to boot without them from the same commit, tested.
- [ ] **Two stale comments rewritten in the wiring commit** (review invites-resend.md, finding 2):
      `apps/web/src/kabinet/auth-route.ts:12` ("The invite PR adds the provider") and
      `apps/web/src/app/kabinet/layout.tsx:9` ("until the invite PR adds an email provider"). #94
      does not wire the provider; the wiring commit does.
- [ ] **Real-Neon run before the production 503 lifts** (HS-T4, HS-T4b, HS-Q12): sign-in,
      verify, getSession, accept-invitation, the audited-write CTE, the listing jsonb
      compare-and-set, the deleteDraft 23503 catch, and the `last_updated_at` round-trip
      (S3-T6).
- [ ] **Production rollout order** (RG-Q2, superseding HS-Q13's; Oleksii, verbatim: "Rollout order
      becomes: invite merged → admin:bootstrap → I sign in → first shelter invite."), after the
      registry PR has merged:
  1. invite PR merged
  2. `admin:bootstrap <email>` on production (creates Oleksii's user and grants super_admin, once)
  3. Oleksii signs in on production
  4. first shelter invite

  Full order as restated 2026-10-13 (IN-E1, verbatim): "LOCATION_HMAC_SECRET + location:verify →
  provider, DNS and auth env → Neon run → merge → admin:bootstrap → sign-in → first invite → demo
  corpus removed." Status of "provider, DNS and auth env": **provider and DNS done for Resend**
  (EM-R3: `mail.opika.org.ua` Verified, DKIM `resend._domainkey.mail`, return path / SPF via
  `rsend.mail.opika.org.ua`, DMARC `p=none`; Brevo's records stay until its retirement below);
  **auth env still pending**: the switch-on list above (EM-B10).

  HS-Q13's earlier order ("… → I sign in → admin:grant on my own user → …") couldn't run: sign-up is
  off, so no production user exists to sign in or to grant (RG-Q2).

## Brevo retirement (after the switch-on; EM-B10)

Oleksii's order, verbatim (EM-B10): "3. Brevo's dashboard confirms no sends after the switch.
30-day grace period for Brevo's delayed retries. 4. After the grace period, with my explicit OK at
each step: delete the Brevo API key in Brevo; remove its Vercel env var; remove the DNS records
brevo1._domainkey.mail, brevo2._domainkey.mail and the mail TXT brevo-code; close or downgrade the
Brevo account. Nothing gets removed without my say-so." Not merge blockers for #94: each happens
after it. **Every removal below needs Oleksii's explicit OK at that step.**

**Runbook, one provider (Resend) for all email.** DNS in Cloudflare, all DNS only: TXT
`resend._domainkey.mail` (DKIM, `s=resend`), CNAME `send.mail` → `send.forge.rmta.net`, CNAME
`rsend.mail` → `rsend-euw1.forge.rmta.net`. **The SPF / bounce (return-path) domain is
`rsend.mail.opika.org.ua`**, relaxed-aligned with the From domain `mail.opika.org.ua`; `send.mail`
is not the SPF domain (EM-R3, EM-B9). DMARC `_dmarc` and `_dmarc.mail`, `p=none`, unchanged.
**To remove after the grace period, with his OK:** CNAMEs `brevo1._domainkey.mail` and
`brevo2._domainkey.mail`, TXT `mail` `brevo-code`. The Brevo support note about test 3's hold
(EM-R2) is no longer needed.

- [ ] **No Brevo sends after the switch** (step 3): Brevo's dashboard shows no send after the
      switch-on deploy. Starts the grace period.
- [ ] **30-day grace period** for Brevo's delayed retries, counted from the last Brevo send. Brevo's
      code path (request shape, block-list read) and `BREVO_API_KEY`'s name stay in the code as the
      rollback until it ends.
- [ ] **Delete the Brevo API key in Brevo.** Needs Oleksii's explicit OK.
- [ ] **Remove its Vercel env var** (`EMAIL_PROVIDER_API_KEY` if it was set there with the Brevo key,
      or `BREVO_API_KEY` if that was ever added for a rollback). Needs Oleksii's explicit OK.
- [ ] **Remove the DNS records** `brevo1._domainkey.mail`, `brevo2._domainkey.mail` and the `mail` TXT
      `brevo-code` (first: DMARC aggregate reports for `mail.opika.org.ua` show only Resend passing).
      Needs Oleksii's explicit OK.
- [ ] **Close or downgrade the Brevo account.** Needs Oleksii's explicit OK.
- [ ] **Remove Brevo's code path** (EM-P1 step 1's dead-code list: the Brevo branch of
      `providerRequest`, the Brevo block-list read, `brevo` in `EMAIL_PROVIDERS` and the delivery
      test's flags, the Brevo tests) and `BREVO_API_KEY` from `.env.example`. A Tier 1 commit. Needs
      Oleksii's explicit OK.
- [ ] *Then, separately:* IN-E3's apex DMARC `p=reject`, once the reports are clean for Resend alone.
