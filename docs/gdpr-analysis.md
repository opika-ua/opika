# GDPR analysis — `/pro` and shelter-admin data

Written for Oleksii's 2026-10-24 launch-gate brief ("a GDPR check of `/pro` and the
shelter-admin data... what data, why, how long, the legal basis, what `/pro` says, and
the gaps"). Research and analysis only — every fix below that touches a public claim or
a compliance posture is flagged as his decision, not built here. Not legal advice; where
a question turns on a genuine judgment call (is X "strictly necessary", is Y's retention
"no longer than necessary"), that's named as a judgment call, not resolved as fact.

## 1. Why GDPR applies here at all

The product's users (adopters, shelters) are mostly in Ukraine, which is not in the EU/EEA.
That alone wouldn't trigger GDPR. But **GDPR Art. 3(1) applies GDPR to any controller
established in the Union, for processing carried out in the context of that establishment's
activities — regardless of where the data subjects are or what nationality they hold.**
Oleksii is the controller (he decides what data is collected and why; there is no separate
company), and he lives in Poland. That's enough on its own: this is **Art. 3(1) territorial
scope through the controller's establishment**, not the weaker, more contested Art. 3(2)
"targeting/monitoring EU data subjects" test that would otherwise be the live question for a
Ukraine-focused product. Worth being explicit about which clause applies, because the fixes
below (a controller identity, a lawful basis per purpose, data subject rights) follow from
ordinary controller obligations either way, but *why* they're mandatory rather than aspirational
rests on this one fact.

**Ukrainian law's own view, for the mirror case (data mostly about Ukrainian residents,
controller in the EU):** `docs/stack-decision.md` §3.1 already verified Ukraine has no
data-localisation mandate for private-sector personal data, and Law 2297-VI Art. 29 treats
transfers to EEA states as going to an adequate-protection jurisdiction. So there's no
Ukrainian-law obstacle to the Neon-in-Frankfurt, Vercel-in-Poland-controller setup this
project already has — the open questions are all on the GDPR side.

## 2. Data inventory

### Adopters (anonymous, device-bound — no Better Auth yet, that's M8)

| What | Where | Why | Retention | Likely legal basis |
|---|---|---|---|---|
| `adopters.device_session_id` — SHA-256 hash of a server-issued, ≥256-bit random token (CLAUDE.md decision #13) | Postgres (Neon, Frankfurt) | Lets the deck remember what this device has already swiped/revealed, across visits | **No expiry in the database.** The *cookie* holding the token expires (30 days absolute / 7 days idle, `DEFAULT_SESSION_POLICY`), so the device stops being able to present it — but the `adopters` row itself, and everything referencing it, is never deleted | Legitimate interest (Art. 6(1)(f)), arguably — the seen-set memory is the product's one adopter-visible mechanism; **whether the cookie needs ePrivacy consent at all is a live judgment call**, see §4 |
| `swipes` (adopter_id, animal_id, direction, swiped_at) | Postgres | Seen-set exclusion in the deck; Phase 2's reward ledger (not built) | **No cleanup. Kept indefinitely**, tied to a device-session hash that itself never expires at the row level | Legitimate interest, same basis as above |
| `reveals` (adopter_id, animal_id, shelter_id, revealed_at, shelter_snapshot, animal_snapshot) | Postgres | Lets `animals.reveal` be idempotent (don't re-charge a rate-limit unit for the same shelter); historical record of who was shown what shelter contact | **Append-only by design** (CLAUDE.md decision #9) — no deletion mechanism exists. `shelter_snapshot`/`animal_snapshot` freeze the shelter's name/contact/animal facts *as revealed*, so this is also the one place a shelter's now-changed contact details stay recorded against a specific adopter indefinitely | Legitimate interest (abuse prevention via idempotency) for the fact of the reveal; the *snapshot's* indefinite retention is harder to justify on the same basis — see gap G3 |
| Saved list (which animals a visitor has bookmarked) | **Not server-side at all** — `localStorage`, this browser only. `animals.cardsByIds`'s batch read is a `credentials: 'omit'` POST, no cookie, and the server doesn't log or store which ids were asked for | n/a — client state | n/a — never reaches the server as a record | n/a — nothing to have a legal basis for |
| Per-IP rate-limit keys (`ip:` + HMAC-SHA256 under `RATE_LIMIT_KEY_SECRET`) | Upstash Redis | Abuse/scraping prevention (per-IP throttling on the deck, the gallery, reveals, kabinet routes) | Short TTLs only: ~2 minutes (kabinet per-IP), ~2 hours (sign-in per-IP and the typed-address key) — `@upstash/ratelimit`'s sliding-window `PEXPIRE` | Legitimate interest (Art. 6(1)(f), security/anti-abuse — one of GDPR's own listed examples of a likely legitimate interest, Recital 49) |
| Vercel Analytics / Speed Insights | Vercel's own infrastructure, not this app's database | Aggregate traffic/performance numbers | Vercel's own retention (not controlled by this app) | **Cookieless** (`SiteAnalytics.tsx`'s own comment) — Vercel's documented approach avoids a persistent per-visitor identifier, which is the usual basis for treating this kind of aggregate, non-tracking analytics as not needing consent under ePrivacy. Worth confirming this is still true of the current `@vercel/analytics` version rather than assumed, see G6 |

**A fact worth being precise about:** an anonymous device-session hash with no name, email or
phone attached is still very likely "personal data" under GDPR. Recital 30 names online
identifiers (device IDs, cookies) as personal data when they can be linked to a natural person,
directly or indirectly — and combined with swipe/reveal behaviour tied to one device over time,
this is squarely the kind of pseudonymous-but-identifiable data GDPR Art. 4(1) and Recital 26
cover. "No PII" is not the same claim as "not personal data."

### Shelter admins (named individuals, Better Auth)

Already disclosed in detail by `uk.about.data` (quoted in full in §3) and verified against
code in the 2026-10-14 session that wrote it (`docs/decisions-inbox.md` rows EM-T17/EM-Q11).
Summary, re-checked against the schema this pass rather than re-trusted wholesale:

| What | Where | Why | Retention | Likely legal basis |
|---|---|---|---|---|
| Name, email (`auth_user`) | Postgres | Sending invites, sign-in links, reset links, password-change notices | **Not deleted on its own** — only when the whole shelter record is removed (`demo:remove --shelter`) | Contract/legitimate interest — necessary to run the account the shelter asked for |
| Password hash (scrypt, `auth_account`) | Postgres | Sign-in | Same as above | Contract |
| `user_agent` (verbatim, `auth_session`) | Postgres | — (not explained anywhere why it's kept at all, see G5) | Session cleanup deletes expired rows within ~25h of expiry | Unclear — see G5 |
| IP address | **Not stored in Postgres** (`disableIpTracking: true`, `ip_address = ''`) | — | n/a in the DB | Raw IPs *do* reach Upstash (HMAC'd keys only) and Vercel's own edge logs (outside this app's control, per his own EM-L1 scoping) |
| Typed sign-in addresses with no matching account | `auth_verification` | Rate-limiting / sign-in flow | 15-minute TTL, swept by a cron within ~25h of expiry | Legitimate interest |
| Shelter history (`shelter_history`) | Postgres | Audit trail of the shelter's own kabinet writes | **Deleted only with the shelter record** | Legitimate interest/contract — and by design carries no adopter data at all (`history-no-engagement.test.ts`) |
| Photos (kabinet uploads) | Cloudflare R2 | Animal listings | Deleted "on the shelter's request", by hand | n/a (not personal data about a natural person once EXIF/metadata is stripped, which it is) |

## 3. What `/pro` currently says (full text, `uk.about.*` / `packages/i18n/src/messages/uk.ts`)

Four paragraphs under `about.data`, plus `about.analytics` and `about.contact`:

> Дані, які вносить притулок — адреса, контакти, картки тварин, — належать притулку. Точна
> адреса ніколи не показується публічно: той, хто шукає тварину, бачить лише місто. Притулок
> може попросити видалити свій запис у будь-який момент.
>
> Для притулків із доступом до кабінету сайт зберігає імʼя та адресу пошти адміністратора, щоб
> надсилати запрошення, посилання для входу чи нового пароля і повідомлення про зміну пароля, а
> також технічний запис про браузер і пристрій, з якого виконано вхід. Для адміністраторів
> кабінетів притулків зберігається лише незворотний хеш пароля, а не сам пароль. IP-адреси не
> зберігаються. Вхід у кабінет притулку діє 30 днів від останнього відвідування і не довше 90
> днів, після чого треба увійти знову. Адреси, введені у формі входу, і записи про входи, що
> втратили силу, видаляються протягом доби.
>
> Кожна зміна в кабінеті записується в історію притулку... Про людей, які шукають тварину, в
> історії нічого немає. Історія видаляється разом із записом притулку.
>
> Фото, завантажені в кабінеті, зберігаються без даних про місце зйомки...
>
> Список збережених тварин зберігається лише в цьому браузері...

`about.analytics`: «Сайт збирає базову статистику відвідувань — скільки людей заходить і
наскільки швидко працюють сторінки — без реклами.» `about.contact`: «Написати мені:
hello@opika.org.ua»

**Everything quoted above checks out against the code** (re-verified this pass, same way
EM-T17 did on 2026-10-14) — this is a genuinely accurate, if informal, disclosure of the
*shelter-admin* data. **It says nothing at all about adopter data beyond the held R4-2
sentence** (the one-cookie disclosure, not yet live — see `docs/launch-gate.md` §C), nothing
about swipes or reveals, nothing about processors, nothing about a legal basis, and nothing
about how to exercise a data-subject right.

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
  retention — is stored in the US regardless of the EU sending region (`docs/decisions-inbox.md`
  row EM-F3, already verified in a prior session, not re-derived here).
- **Upstash** (rate-limit keys): provisioned in `iad1` (US East) per RL-4's record. Worth a
  fresh check whether that's still its actual region — RL-4 is from 2026-10-06, and the app's
  own Vercel function region was already pinned to `fra1` (Frankfurt) three weeks earlier
  (O-9, 2026-09-13), so either Upstash's region genuinely differs from the app's for a reason,
  or the two have drifted and nobody's looked since. I didn't verify the live Upstash dashboard
  value — flagging as unverified, not assuming either way.

Neither Resend's nor Upstash's data-processing terms (SCCs, a signed DPA) are referenced
anywhere in the repo. They may already be covered by each vendor's standard terms — that's
worth confirming rather than assuming is fine or assuming is a problem.

**G3 — No retention policy for adopter data (`adopters`, `swipes`, `reveals`).** Every other
data category in this codebase has a stated, enforced retention window (kabinet sessions,
sign-in verification tokens, shelter history tied to the shelter's own lifecycle). Adopter
rows have none — a device-session hash from day one of this project, plus its full swipe and
reveal history, would still be sitting in the database unchanged years later with nobody
having decided that on purpose. GDPR's storage-limitation principle (Art. 5(1)(e)) requires
data be kept "no longer than is necessary for the purposes for which [it is] processed" — and
right now there's no stated purpose-linked endpoint to that retention at all, which makes "no
longer than necessary" unanswerable rather than merely generous.

**G4 — No mechanism for a data subject rights request.** `/pro`'s contact address
(`hello@opika.org.ua`) could serve as the intake channel, but nothing documents that it's meant
to, and there's no built path to actually act on an erasure or access request for an *adopter*
specifically — a shelter admin can ask to leave and the whole shelter record (and its admins'
`auth_user` rows) can be removed via existing tooling, but an adopter is identified only by a
device-session hash with no email to search by. Answering "delete everything about adopter X"
would mean asking the requester for the hash (or the cookie) and deleting that one `adopters`
row plus its `swipes`/`reveals` rows by hand — possible today, but undocumented and unbuilt as
a defined procedure.

**G5 — `auth_session.user_agent` is stored with no stated purpose.** Unlike every other field
`about.data` lists, nothing explains *why* the browser/device string is kept — the standing
`docs/standing-constraints.md` convention ("comments explain why a business rule exists") isn't
met here, and neither is Art. 5(1)(b)'s purpose-limitation principle in the privacy-policy
sense: a controller is supposed to be able to say what a piece of data is *for*. It may simply
be useful for a shelter admin's own security awareness (seeing what device signed in) — but
that's a guess, not a verified purpose, and `/pro`'s own sentence just lists it as a fact
without saying why.

**G6 — Vercel Analytics' "cookieless" claim should be reconfirmed against the current package
version before it's relied on in a formal policy**, rather than carried forward from the
comment in `SiteAnalytics.tsx`. I didn't independently verify this against `@vercel/analytics`'s
current behaviour this pass — the in-repo comment is the only source, and a formal privacy
policy repeating it as fact deserves its own check.

**G7 (a judgment call, not a gap per se) — whether the adopter's one session cookie needs
ePrivacy consent at all.** ePrivacy's Art. 5(3) exempts cookies "strictly necessary... to
provide [a service]... explicitly requested by the subscriber or user." The cookie here is set
only after the visitor's first swipe/reveal action and exists to make the "one at a time" deck
mode not re-show things the visitor already acted on — arguably strictly necessary to the
feature the visitor just invoked, arguably not (a list view works without it, so the *site*
functions without the cookie, even if the deck's own memory doesn't). This determines whether a
consent banner is needed for that one cookie or not, and it's a real judgment call rather than
something code can resolve — flagging it rather than picking a side.

## 5. Proposed fixes (not built — yours to decide, prioritise, or reject)

None of these touch code without your go-ahead; several are pure-copy or pure-policy
decisions (`docs/standing-constraints.md`'s Ukrainian-copy and public-claim gates apply).

1. **Write a real privacy-policy page** (Phase H5, pulled forward): controller identity,
   purposes, legal bases, retention per category (this doc's §2 table is the starting
   inventory), processor list with their locations, data subject rights and how to exercise
   them, supervisory-authority complaint right. This is the one item that actually closes G1,
   and it's a genuinely new page, not an edit to `/pro`.
2. **Decide a retention window for `adopters`/`swipes`/`reveals`** (closes G3) — e.g., delete an
   anonymous adopter row (and its swipes/reveals) once its cookie has been un-renewable for some
   stated period past the 30-day absolute cap, as a scheduled job alongside the existing
   auth-cleanup cron. This is a product decision (how long is "necessary" for the seen-set
   feature to keep working across a plausible return visit) before it's a build.
3. **Record Resend's and Upstash's processor status** — confirm or obtain their DPA/SCC
   coverage, and name both in the new privacy policy once it exists (closes G2 alongside #1).
4. **Define a data-subject-request procedure for adopters** — even a short internal runbook
   ("ask for the cookie value or the device-session hash, delete the matching `adopters` row and
   its `swipes`/`reveals`") would close G4 without new code.
5. **State `auth_session.user_agent`'s purpose**, or drop it if there isn't a real one (closes
   G5) — smallest possible change, worth doing regardless of the rest.
6. **Decide G7** — add a lightweight consent mechanism for the one adopter cookie, or record the
   "strictly necessary" reasoning as the deliberate position taken. Either is defensible; what
   isn't is leaving it undecided once a formal policy exists to make the omission conspicuous.
7. **Re-verify G6** before the privacy policy asserts it.

I'd sequence these as: #1 first (it's the actual deliverable Phase H5 names, and #3/#6/#7 are
just inputs to it), #2 and #4 next (closeable independently, and #2 especially is the kind of
thing that's cheap now and expensive to retrofit once real adopter volume exists), #5 last
(trivial, no urgency).
