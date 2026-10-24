# GDPR analysis — `/pro` and shelter-admin data

Written for Oleksii's 2026-10-24 launch-gate brief ("a GDPR check of `/pro` and the
shelter-admin data... what data, why, how long, the legal basis, what `/pro` says, and
the gaps"). Research and analysis only — every fix below that touches a public claim or
a compliance posture is flagged as his decision, not built here. Not legal advice; where
a question turns on a genuine judgment call (is X "strictly necessary", is Y's retention
"no longer than necessary"), that's named as a judgment call, not resolved as fact.

**Revised twice after review found real factual errors** in the data inventory and a
citation — fixed in place below rather than silently, since a document whose whole point is
accuracy shouldn't hide that it was wrong. Full history is in this file's own git log and
the PR's review files, not restated here.

## 1. Why GDPR applies here at all

The product's users (adopters, shelters) are mostly in Ukraine, which is not in the EU/EEA.
That alone wouldn't trigger GDPR on its own. **`docs/stack-decision.md`'s own existing
framing (§6, "Hosting and infrastructure") already anticipates this via Art. 3(2)** — GDPR
applies extraterritorially "the moment you serve Polish adopters." That's a real, but
conditional, basis: it depends on actually having EU-based adopters.

**A second, unconditional basis exists and doesn't depend on who the adopters are: GDPR
Art. 3(1) applies GDPR to any controller established in the Union, for processing carried
out in the context of that establishment's activities — regardless of where the data
subjects are.** Oleksii is the controller (he decides what data is collected and why;
there is no separate company), and he said directly, in the brief this analysis answers,
that he lives in Poland — that's the source for this fact, not something inferred or found
elsewhere in the repo. That alone is enough, independent
of Art. 3(2)'s audience-dependent test. Worth being explicit about which clause is doing
the work, because the fixes below (a controller identity, a lawful basis per purpose, data
subject rights) follow from ordinary controller obligations either way — but *why* they're
mandatory rather than aspirational, right now, rests on Art. 3(1) alone, since there's no
verified fact in this repo about actual EU-resident adopters yet.

**Ukrainian law's own view, for the mirror case (data mostly about Ukrainian residents,
controller in the EU):** `docs/stack-decision.md` §6 already verified Ukraine has no
data-localisation mandate for private-sector personal data, and Law 2297-VI Art. 29 treats
transfers to EEA states as going to an adequate-protection jurisdiction. So there's no
Ukrainian-law obstacle to the Neon-in-Frankfurt setup this project already has, separately
from where Oleksii himself is established — the open questions below are all on the GDPR
side.

## 2. Data inventory

### Adopters (anonymous, device-bound — no Better Auth yet, that's M8)

| What | Where | Why | Retention | Likely legal basis |
|---|---|---|---|---|
| `sessions` (token hash, `adopter_id`, `created_at`, `last_seen_at`) — the token itself is a SHA-256 hash of a server-issued, ≥256-bit random value (CLAUDE.md decision #13) | Postgres (Neon, Frankfurt) | Lets the deck remember what this device has already swiped/revealed, across visits | **Lazily deleted, not proactively.** `validateSession` (`apps/web/src/api/session/manager.ts`) checks the 30-day absolute / 7-day idle policy only when the token is *presented* — a row past either limit is deleted the next time its cookie comes back, never on a schedule. A device that never returns (cookie cleared, browser abandoned) leaves its row in place indefinitely; nothing sweeps expired-but-never-revisited rows | Legitimate interest (Art. 6(1)(f)), arguably — the seen-set memory is the product's one adopter-visible mechanism; **whether the cookie needs ePrivacy consent at all is a live judgment call**, see G7 |
| `adopters` (one row per `sessions` row, device-bound, carries `device_session_id`) | Postgres | Identity the rest of this table hangs off | **Not lazily deleted either, and not a side effect of anything else.** `validateSession`'s cleanup (above) deletes only the matching `sessions` row; `demo:remove` removes shelters, animals, swipes and reveals, never adopters. No *retention or cleanup* path deletes an `adopters` row — the only thing that ever does is `seed.ts`'s `db:seed`, a whole-database `TRUNCATE` (dev/local tooling, not a retention mechanism). So an adopter's `device_session_id` outlives even its own expired, already-deleted session row, indefinitely | Same basis |
| `swipes` (adopter_id, animal_id, direction, swiped_at) | Postgres | Seen-set exclusion in the deck; Phase 2's reward ledger (not built) | **Narrower than "none": `demo:remove --shelter` does delete every swipe referencing that shelter's animals** (`packages/db/src/demo-remove.ts`) — but that only fires when a whole shelter is removed. For an adopter whose swiped shelters stay in business indefinitely, there is no retention mechanism at all tied to the *adopter's* own age or inactivity | Legitimate interest, same basis as above |
| `reveals` (adopter_id, animal_id, shelter_id, revealed_at, shelter_snapshot, animal_snapshot) | Postgres | Lets `animals.reveal` be idempotent (don't re-charge a rate-limit unit for the same shelter); historical record of who was shown what shelter contact | **Append-only by design** (CLAUDE.md decision #9), with the same shelter-removal exception as `swipes` above. `shelter_snapshot`/`animal_snapshot` freeze the shelter's name/contact/animal facts *as revealed*, so this is also the one place a shelter's now-changed contact details stay recorded against a specific adopter | Legitimate interest (abuse prevention via idempotency) for the fact of the reveal; the *snapshot's* indefinite retention is harder to justify on the same basis — see gap G3 |
| Saved list (which animals a visitor has bookmarked) | **Not server-side at all** — `localStorage`, this browser only. `animals.cardsByIds`'s batch read is a `credentials: 'omit'` POST, no cookie, and the server doesn't log or store which ids were asked for | n/a — client state | n/a — never reaches the server as a record | n/a — nothing to have a legal basis for |
| Per-IP rate-limit keys (`ip:` + HMAC-SHA256 under `RATE_LIMIT_KEY_SECRET` — never the raw address itself) | Upstash Redis | Abuse/scraping prevention (per-IP throttling on the deck, the gallery, reveals, kabinet routes) | Short TTLs only: ~2 minutes (kabinet per-IP), ~2 hours (sign-in per-IP and the typed-address key) — `@upstash/ratelimit`'s sliding-window `PEXPIRE` | Legitimate interest (Art. 6(1)(f), security/anti-abuse — one of GDPR's own listed examples of a likely legitimate interest, Recital 49) |
| Vercel Analytics / Speed Insights | Vercel's own infrastructure, not this app's database | Aggregate traffic/performance numbers | Vercel's own retention (not controlled by this app) | **Cookieless** (`SiteAnalytics.tsx`'s own comment) — Vercel's documented approach avoids a persistent per-visitor identifier, which is the usual basis for treating this kind of aggregate, non-tracking analytics as not needing consent under ePrivacy. Worth confirming this is still true of the current `@vercel/analytics` version rather than assumed, see G6 |

**A fact worth being precise about:** an anonymous device-session hash with no name, email or
phone attached is still very likely "personal data" under GDPR. Recital 30 names online
identifiers (device IDs, cookies) as personal data when they can be linked to a natural person,
directly or indirectly — and combined with swipe/reveal behaviour tied to one device over time,
this is squarely the kind of pseudonymous-but-identifiable data GDPR Art. 4(1) and Recital 26
cover. "No PII" is not the same claim as "not personal data."

### Shelter admins (named individuals, Better Auth)

`uk.about.data` (its substance walked paragraph by paragraph in §3) was first verified against code in the 2026-10-14
session that wrote it (`docs/decisions-inbox.md` rows EM-T17/EM-Q11). Re-checked against the
schema again this pass, which found two real gaps the earlier verification didn't cover
(G4's departed-admin case, below) because `about.data` never claimed anything about them
one way or the other:

| What | Where | Why | Retention | Likely legal basis |
|---|---|---|---|---|
| Name, email (`auth_user`) | Postgres | Sending invites, sign-in links, reset links, password-change notices | **Not deleted on its own** — only when the whole shelter record is removed (`demo:remove --shelter`). **A narrower case is a real gap, not covered by that:** an admin *removed from* a shelter that keeps operating (`registry.admins.remove`) keeps their `auth_user`/`auth_account` rows — the only cleanup path, `cleanUpInvitedUsers`, only ever deletes a user who was invited and **never signed in even once** (`isNull(invitationCreatedUsers.firstSessionAt)` in `kabinet-invited-users-repo.ts`), which by construction excludes anyone who actually used the account. See G4 | Contract/legitimate interest while the membership exists; unclear once it's ended, see G4 |
| Password hash (scrypt, `auth_account`) | Postgres | Sign-in | Same as above | Contract |
| `user_agent` (verbatim, `auth_session`) | Postgres | Not stated in `/pro`'s own text, but the decision to keep it **is** on record: KH-Q6 (`docs/decisions-inbox.md`), Oleksii's verbatim answer — "User agent: (a), keep it" — and Better Auth 1.6.33 has no option to omit it (`createSession` writes it unconditionally; blanking it would mean the app rewriting Better Auth's own session row, which he declined). So the narrower, real gap is that `/pro` states the fact with no stated purpose, not that no purpose was ever decided — see G5 | Lives for the session's own 30-day idle / 90-day absolute window (role-dependent, `KABINET_SESSION_LIMITS`), then is deleted within two cron intervals of that expiry — ~12 hours, accounting for one possible skipped run (Vercel doesn't retry a missed cron), the same worst-case reasoning `auth-cleanup.ts`'s own comment applies to the link figure below, just without that figure's extra 15-minute window | Unclear in `/pro`'s own copy — see G5 |
| IP address | **Not stored in Postgres** (`disableIpTracking: true`, `ip_address = ''`) | — | n/a in the DB | An IP never reaches Upstash in raw form either — only as an HMAC-SHA256 output under `RATE_LIMIT_KEY_SECRET` — and it does reach Vercel's own edge logs (outside this app's control, per his own EM-L1 scoping) |
| Typed sign-in addresses with no matching account | `auth_verification` | Rate-limiting / sign-in flow | 15-minute TTL, swept by the same 6-hourly cron, 12h15m worst case (same figure as above) | Legitimate interest |
| Shelter history (`shelter_history`) | Postgres | Audit trail of the shelter's own kabinet writes | **Deleted only with the shelter record.** Carries no *adopter* data by design (`history-no-engagement.test.ts`) — but it does carry an admin's email at the moment they joined or were removed (`admin_joined`/`admin_removed` entries, `packages/domain/src/shelters/history.ts`), **stored at that moment and never updated or removed afterward**, even if that same admin is later removed from the shelter. See G4 | Legitimate interest/contract |
| Support sessions (`support_sessions`, an operator's "view as this shelter" record) | Postgres | Audit of operator support access | **Never deleted, by approved design, not an oversight** — RS-Q0 ("Rows never deleted") and Oleksii's own DR-Q1(b), verbatim (`packages/db/src/demo-remove.ts`'s own comment): "Never delete support sessions; demo:remove refuses while any demo shelter has one. If the count on production isn't 0 when I run it, I decide again with the number in front of me." (That reserved re-decision is about running the removal script on production, not about this row's own retention — included for completeness, not glossed over.) Stronger than the rest of this table: a shelter with even one support session on record can't be removed by `demo:remove` at all — refused outright, not just left with a dangling row | Legitimate interest |
| Photos (kabinet uploads) | Cloudflare R2 | Animal listings | Deleted "on the shelter's request", by hand | Not personal data about a natural person in the ordinary case (EXIF/metadata is stripped, the subject is an animal) — flagging as a judgment call rather than settled fact, since a photo could in principle include a person in frame; nobody's reviewed uploads for that |

## 3. What `/pro` currently says (`uk.about.*` in `packages/i18n/src/messages/uk.ts`)

Five paragraphs under `about.data` (not four — corrected this pass, matching the actual
`\n\n`-separated count in the source, though `apps/web/src/app/pro/page.tsx`'s own comment
still says "four," left over from before the saved-list paragraph was added), plus
`about.analytics` and `about.contact`. Rather than paste a copy that will drift the moment
the source changes — and R4-2's held sentence is already due to change `about.analytics`
specifically — read `uk.about.*` directly for the live text; its substance, checked against
the code again this pass:

- **¶1 (shelter-owned data):** the shelter owns what it enters; exact address never shown
  publicly; a shelter can ask to have its record removed. Matches `PublicShelterSchema`'s
  `pick`-based stripping and `demo:remove --shelter`.
- **¶2 (kabinet access):** name/email for invites and links, a hash not the password, no IP
  storage, a 30-day/90-day session policy, typed addresses and expired sign-in records gone
  "протягом доби." The 30/90-day figures match `apps/web/src/kabinet/auth.ts`'s session
  config; "протягом доби" is the cron's own stated worst case of 12h15m, so the claim is
  true with room to spare, not tight against it.
- **¶3 (history):** every kabinet change recorded with who made it; nothing about adopters
  in it; deleted with the shelter record. True of the data `about.data` is describing —
  **but silent on the departed-admin case in G4**, which isn't a claim this paragraph makes
  false, just one it doesn't address at all.
- **¶4 (photos):** no location metadata; removed photos stop showing, files deleted by
  hand on request.
- **¶5 (saved list):** `localStorage` only, no cookie on the batch read, nothing logged
  about which ids were asked for.

**Everything in `about.data` checks out against the code.** It says nothing at all about
adopter data beyond the held R4-2 sentence (the one-cookie disclosure, not yet live — it
exists as `PENDING_R4_2_ANALYTICS_SENTENCE`, `packages/i18n/src/messages/uk.ts`, and lands
once the pre-launch gate comes down, tracked on the branch that opened PR #194), nothing
about processors, nothing about a legal basis, and nothing about how to exercise a
data-subject right.

## 4. Gaps

Ranked by what's missing versus what's just informally rather than formally stated — not by
GDPR fine-risk, which isn't mine to assess.

**G1 — No formal privacy policy exists, only `/pro`'s informal prose.** `/pro` reads as "an
honest page about what the site does," not as a GDPR Art. 13/14 notice. It's missing, at
minimum: the controller's identity and contact in the Art. 13(1)(a) sense (a name and a way to
reach them beyond an email address — no registered business name or address appears anywhere
in the product), the legal basis for each processing purpose, data subject rights (access,
erasure, portability, objection, and the right to lodge a complaint with a supervisory
authority), and international transfer disclosure (processors in the US — see G2). This is
scoped as its own deliverable in `docs/build-plan.md` Phase H5 ("privacy policy (GDPR), consent
handling"); the brief that asked for this analysis is effectively pulling H5's audit forward,
not its build.

**G2 — Processors with US data storage aren't disclosed anywhere, and no SCC/DPA status is
recorded.** Two known cases:
- **Resend** (sign-in and invite emails): account data — email metadata and logs, 30-day
  retention — is stored in the US regardless of the EU sending region. Recorded in
  `docs/decisions-inbox.md` row EM-F3 as his own relayed statement, not independently
  re-verified against Resend's own terms this pass.
- **Upstash** (rate-limit keys): row RL-4 (2026-10-06) records Upstash's own database region
  as `iad1` (US East), set to match what the dashboard showed as the app's Vercel Function
  Region at provisioning time. But the app's `vercel.json` has `regions: ["fra1"]`
  (Frankfurt), pinned a month *earlier* (`61183b2`, 2026-09-09) — so the region RL-4 matched
  against was itself already stale by the time Upstash was provisioned. I haven't checked
  the live Upstash dashboard to see whether its region is still `iad1`, still pointed at a
  fact that stopped being true in September — flagging the conflict, not guessing the answer.

Neither Resend's nor Upstash's data-processing terms (SCCs, a signed DPA) are referenced
anywhere in the repo. They may already be covered by each vendor's standard terms — that's
worth confirming rather than assuming is fine or assuming is a problem.

**G3 — No retention policy tied to an adopter's own age or inactivity.** Not every category
in this doc has a stated window — `shelter_history` and `support_sessions` in §2 are
deliberately permanent, by his own decision, not gaps — but none of the adopter-side
`sessions`, `adopters`, `swipes` and `reveals` rows has *any* cleanup tied to the adopter's
own age or inactivity, beyond the narrow, incidental case of the whole owning shelter being
removed. The *functional* purpose of a `swipes` row (seen-set exclusion) is moot well before
any new retention window would need to bite: `validateSession`'s own policy kills a session
at `min(createdAt + 30 days, lastSeenAt + 7 days)`, and once it's dead `session.bootstrap`
mints a *new* adopter identity rather than reviving the old one — so a session's swipes can
never again serve the purpose they were kept for, no later than 30 days after it was created,
and as soon as 7 days after its last use if it went idle first. The actual gap is that nothing
deletes the *rows* once that purpose has lapsed; GDPR's storage-limitation principle
(Art. 5(1)(e)) is about the data outliving its purpose, and here that's concrete and
measurable against the formula above, not merely "no number was ever chosen."

**G4 — No mechanism for a data subject rights request, and one structural case that today's
tooling can't close at all.**
- **For an adopter:** nothing documents `hello@opika.org.ua` as an intake channel for this,
  and answering "delete everything about adopter X" would mean identifying them by their
  cookie value or device-session hash — which is itself worth flagging rather than treating
  as a solved mechanism: asking someone to paste a live session credential into a support
  email is the same class of risk `docs/onboarding-a-shelter.md`'s own "Debugging sign-in"
  section already warns about for kabinet sessions, now in a channel with no redaction
  habit built around it. **The runbook isn't a one-line delete either.** `swipes`, `reveals` and `sessions` all reference
  `adopters.id` with Postgres's default `NO ACTION` foreign-key behaviour (no `onDelete`
  clause in any of the three schema files), so a bare `DELETE FROM adopters` fails with a
  constraint violation; the three child tables have to be deleted first, in that order
  relative to the parent, not just "the adopters row plus its swipes/reveals."
- **For a shelter admin removed from a shelter that keeps operating:** there is currently no
  path at all, not just an undocumented one. `cleanUpInvitedUsers`'s `cleanupCandidates`
  query only matches a user with no session ever recorded (`isNull(firstSessionAt)`), so a
  real admin who signed in and worked, then was removed, keeps their `auth_user`/
  `auth_account` rows indefinitely, and their email stays in that shelter's `shelter_history`
  forever (`admin_removed` entries store the email at the moment of removal, never updated).
  The same history also keeps `admin_invited`/`admin_invitation_resent` entries
  (`packages/domain/src/shelters/history.ts`), which can name someone who was invited and
  **never even joined** — a narrower case than G4's main one, but the same underlying gap.
  Closing this needs either a new deletion path or a documented decision that the history
  entry is a legitimate-interest audit record that outlives the membership — currently
  neither has been decided.

**G5 — `auth_session.user_agent`'s purpose is decided (KH-Q6) but not stated in `/pro`'s own
copy.** Oleksii's own verbatim answer in KH-Q6 is "User agent: (a), keep it," and Better Auth 1.6.33
gives no option to omit it without the app rewriting Better Auth's own session row, which he
declined to do. So the real, narrower gap is only that `/pro`'s sentence lists the fact with
no stated *why* — not that no purpose exists, and not something "trivial to drop," since
dropping it would need new code Better Auth doesn't otherwise require.

**G6 — Vercel Analytics' "cookieless" claim should be reconfirmed against the current package
version before it's relied on in a formal policy**, rather than carried forward from the
comment in `SiteAnalytics.tsx`. Not independently verified against `@vercel/analytics`'s
current behaviour this pass — the in-repo comment is the only source, and a formal privacy
policy repeating it as fact deserves its own check.

**G7 (a judgment call, not a gap per se) — whether the adopter's one session cookie needs
ePrivacy consent at all.** ePrivacy's Art. 5(3) exempts cookies "strictly necessary... to
provide [a service]... explicitly requested by the subscriber or user." The cookie serves two
purposes, not one, and they don't argue the same way: the deck's "don't re-show what I
already acted on" memory is the weaker case (a list view works without it); the *reveal*
side — not re-charging a rate-limit unit for a shelter already revealed to this same
visitor — is a stronger "strictly necessary" candidate, since it's an abuse-prevention
mechanism closer to what Recital 47's own anti-fraud framing describes, not a convenience
feature. This determines whether a consent banner is needed for that one cookie or not, and
it's a real judgment call rather than something code can resolve — flagging both sides
rather than picking one.

## 5. Proposed fixes (not built — Oleksii's to decide, prioritise, or reject)

None of these touch code without his go-ahead; several are pure-copy or pure-policy
decisions (`docs/standing-constraints.md`'s Ukrainian-copy and public-claim gates apply).

1. **Write a real privacy-policy page** (Phase H5, pulled forward): controller identity,
   purposes, legal bases, retention per category (this doc's §2 table is the starting
   inventory), processor list with their locations, data subject rights and how to exercise
   them, supervisory-authority complaint right. This is the one item that actually closes G1,
   and it's a genuinely new page, not an edit to `/pro`.
2. **Decide a retention window for `adopters`/`sessions`/`swipes`/`reveals`** (closes G3) —
   e.g., a scheduled sweep deleting rows whose owning session has been expired for some
   stated grace period, alongside the existing auth-cleanup cron. A product decision (how
   long is "necessary" for the seen-set feature to keep working across a plausible return
   visit) before it's a build, and the deletion order from G4 applies here too.
3. **Resolve the Upstash region conflict and record both processors' status** — confirm
   which region the live Upstash database is actually in, and obtain/confirm DPA/SCC
   coverage for both Resend and Upstash, naming both in the new privacy policy once it
   exists (closes G2 alongside #1).
4. **Define a data-subject-request procedure** covering both the adopter case and the
   departed-shelter-admin case in G4. For the adopter case, the *deletion itself* is just
   three statements in FK order (already worked out in G4) — what's still missing is intake
   and identification: a documented channel, and a safer way to identify the requester than
   asking them to paste a live session credential. For the departed-admin case there's a
   real decision first, not just paperwork — three options:

   **Option A — Full erasure on removal.** `registry.admins.remove` deletes the departed
   admin's `auth_user`/`auth_account` rows outright (once they hold no other shelter
   membership), and scrubs the `email` field on their shelter's `admin_joined`/
   `admin_invited`/`admin_invitation_resent`/`admin_removed` history entries to a fixed
   placeholder at the same moment. *Deleted:* the account rows, immediately. *Kept,
   anonymised:* the history entries themselves (who did what, when, by which moderator) —
   forever, same as every other history entry, but with no email in them. *Cost:* the one
   real complication is that `shelter_history` is explicitly designed as append-only
   (`packages/db/src/schema/shelter-history.ts`'s own doc comment: "A shelter's append-only
   history"); this is the one case where an entry would need an in-place edit after the
   fact, which is new.

   **Option B — Erasure on removal, time-boxed retention of the email in history.** Same
   immediate account-row deletion as A, but the history entries keep the real email for a
   stated grace period (e.g. 12 months — long enough to investigate a dispute that surfaces
   shortly after someone leaves), after which a scheduled job redacts it, the same shape as
   the existing auth-cleanup cron. *Deleted:* account rows, immediately. *Kept, unredacted,
   for N months:* the history email. *Anonymised after that:* same placeholder as A. *Cost:*
   a new scheduled job, on top of A's history-editing problem.

   **Option C — No deletion of the history email at all, as a documented position, not an
   oversight.** Decide and record in the forthcoming privacy policy that a shelter's own
   audit trail of who acted on its account is a legitimate interest that outlives an
   individual's membership — the same basis `shelter_history` already uses for everything
   else, and the same shape as an employer's own personnel/access-log retention after
   someone leaves a role. *Deleted:* the account rows only (no reason to keep login
   credentials for someone who can no longer sign in). *Kept, not anonymised, same lifespan
   as the rest of `shelter_history`:* the email in every entry, until the shelter itself is
   removed. *Cost:* none in code; the cost is in not calling this "closed" from a strict
   right-to-erasure reading — it's a legitimate-interest balancing call, which is a real
   GDPR concept but one a controller has to actually weigh and document, not assume.

   **My recommendation: A.** It gets the actual erasure GDPR's right-to-erasure provision
   (Art. 17) is about, costs one history-editing mechanism (not a new scheduled job like B),
   and doesn't ask a future reader of the privacy policy to accept a balancing argument (C)
   for data that's easy enough to actually remove. But this is squarely his call — it's a
   product/legal decision, not an implementation detail.
5. **State `auth_session.user_agent`'s purpose in `/pro`'s own copy** (closes G5) — a copy
   change, not a code change; the decision to keep the field is already made.
6. **Decide G7** — a consent mechanism for the one adopter cookie, or a recorded "strictly
   necessary" position covering both the deck and reveal purposes. Either is defensible;
   what isn't is leaving it undecided once a formal policy exists to make the omission
   conspicuous.
7. **Re-verify G6** before the privacy policy asserts it.

Sequencing: #1 first (the actual Phase H5 deliverable; #3/#6/#7 are inputs to it), #4 next
(it has a real decision buried in it, not just paperwork), #2 after that, #5 last (smallest,
no urgency).

## Verification note

Re-verify every number and mechanism named above against the live source before citing it
in an actual policy, rather than trusting this document's own prior pass.
