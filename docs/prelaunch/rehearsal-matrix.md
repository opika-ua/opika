# PRELAUNCH rehearsal matrix (Phase 0, 2026-11-04)

<owner-email> is the owner's address, kept locally, not in the repo.

Read at repo HEAD `7b476e1d4491ccf84cb784057c123ee5c6a20e1c` (origin/main). Replaces the version written on the
stale checkout `03a2b70`. Paths are relative to the repo root.

Rehearsal ON PRODUCTION between reset 1 and reset 2, in TWO sittings. `REGISTRY_HAS_NO_REAL_SHELTERS` and the
pre-launch gate stay ON (`apps/web/src/seo-flags.ts:57, 91`); do not touch either. All sign-ins and account creation
are done by the owner; the advisor drives forms in the owner's signed-in browser. Expected results are derived
from code and tests; anything not derivable says UNVERIFIED and means "observe and record, do not fail the step".

There is no swipe deck any more (retired 2026-11-02, `apps/web/next.config.ts:58-66`; the `swipes` table is dropped
by migration 0022). The adopter gallery is `/tvaryny`; `/tvaryny/gortaty` is a 308 redirect to it. No step below
swipes, skips or reads a deck.

## The two sittings

| Sitting | When | Contents |
|---|---|---|
| **Sitting 1** | Day 1, about 3 to 4 hours | Reset 1 and bootstrap (`reset-runbook.md`), then sections 1 to 7 (operator, invites, onboarding, verification FSM, animals, photos, listing states) (9.1, 9.2 and 9.4 were NOT done in Sitting 1; 9.1/9.2 moved to S.1/S.2 at the end of Sitting 2, 9.4 and the 9.3 erasure check are dropped). |
| **Sitting 2** | Day 2 (no wait: neither 9.1 nor 9.4 was done in Sitting 1; t4 is still S3's admin and its removal is S.1 at the end) | Starts directly with section 8 (adopter side, 393 px), 9.5, 9.6, **NEW (Sitting 2), from the real production state: S2-P pause on S3, S2-E early listing on S1 and S2 (only if #426 is merged and deployed), S2-S admin removal on S3 last**, section 10, then `pre-reset-2` and reset 2. |

The 72 h invitation-expiry wait of the earlier plan is dropped: the 72 h lifetime (`INVITATION_TTL_MS`,
`packages/db/src/repos/kabinet-invitation-repo.ts:24`) and expiry handling are covered by unit tests
(`packages/db/test/kabinet-invitation-repo.test.ts:75, 155-163, 201, 289`: expiry stamp, re-invite after expiry, resend, sweep;
`kabinet-invitation-accept-repo.test.ts:134, 173-188`: accepted at the exact expiry instant, never after; expired
pending rows are canceled).

## Test data (obviously fake, owner's addresses only)

| Thing | Value |
|---|---|
| Operator address | `<owner-email>` (placeholder; the real operator address at launch is a separate choice) |
| Shelter admins | `<owner-email>+t1` ... `<owner-email>+t5` (one person is never operator and shelter admin, `packages/db/src/admin.ts:101`) |
| Probe address that is never created (rate-limit probes, sends 0 emails) | `<owner-email>+nobody` |
| Shelters | «Тест Притулок 1» (S1, happy path, unregistered initiative), «Тест Притулок 2» (S2, registered NGO evidence path), «Тест Притулок 3» (S3, rejection, suspension, admin removal) |
| Phone | Do NOT use `+380 00 000 00 01`: a Ukrainian number must be `+380` plus nine digits, first digit 1-9 (`packages/domain/src/shelters/contact.ts:6-9, 29`), so the form refuses it (negative test 3.4). Valid fake: `+380 10 000 00 01` (the form normalises with `normalizeUaPhone`, `apps/web/src/features/kabinet/profile-edit/fields.ts:126, 164`, then the schema `UA_PHONE` accepts it). |
| EDRPOU | any 8 digits, e.g. `00000001` (`packages/domain/src/primitives/ids.ts:44-49`; no checksum in the schema) |
| Telegram handle | 5-32 of `A-Za-z0-9_`, e.g. `test_pritulok_1` (`contact.ts:55-56`) |
| Address | «вул. Тестова, 1», a real city from `cities` (kept by the reset); no real shelter address, no real person name |
| Animal names | «Тест Пес 1» ..., «Тест Кіт 1» ...; descriptions «Тестова картка, не реальна тварина.» |
| Photos | stock or self-generated images only, never a real shelter's. Keep a local `rehearsal-photos` folder OUTSIDE the repo (the repo is public) |

Gate: the adopter-side browser needs the gate link (`?gate=...`, `apps/web/src/proxy.ts:65-70`); the owner opens it,
the secret is never pasted into chat. The kabinet, `/api/auth`, `/api/kabinet`, `/api/monitoring`, `/api/health`
and crons are gate-exempt (`proxy.ts:135-160, 200-205`).

## Email budget and per-day plan

Facts from code: mail is sent ONLY by four senders: shelter invitation, operator/admin magic sign-in link, password
reset, password-changed notice (`apps/web/src/kabinet/email-senders.ts:147, 221, 301`; `password-hooks.ts`;
`auth.ts:413-417`). There is no sender for verification moves, pause, suspend, admin removal, animal states or
adopter actions, so those cost 0 emails. A magic link is sent only if the address belongs to a user
(`auth.ts:413-417`); a reset link only for shelter admins. Therefore the rate-limit probes with `<owner-email>+nobody`
send 0 emails while still counting against the limiter.

Resend is on Pro (owner's figures; NOT in the repo): no daily limit, SHARED with the
`hello@opika.org.ua` SMTP relay, which sends through Resend on the apex domain
(`docs/onboarding-a-shelter.md:709-716`). The per-day counts below are a rough tally, not a quota. Do not send from `hello@` during the
rehearsal days beyond what is needed.

| Day | Block | Emails |
|---|---|---|
| **Day 1** (Sitting 1) | Reset 1, bootstrap; operator sign-in (1) and a second sign-in after clearing cookies (1); create S1 with first admin t1 (1); resend that invite (1); t1 forgot-password (1 reset) and reset done (1 changed notice); change password in `/kabinet/akaunt` (1 changed notice); invite t2 to S1 (1); create S2 with t3 (1) and S3 with t4 (1); invite t5 to S3, then withdraw (1). Probes with `<owner-email>+nobody`: 0. | 11 |
| **Day 2** (Sitting 2) | Operator sign-in if the session is gone (1); reset 2, bootstrap, operator sign-in (1). Everything else, pause included, sends 0 (S2-P, S2-E and S2-S included). | 2 |

Total about 13 mails over 2 days. If anything fails and needs a repeat, there is room for about 45 more on Day 1
before the 60-per-day ceiling. Do not run Day 1 on the same day as a real shelter's onboarding.

## Sitting 1

Column "Mails" counts emails sent by that step. Run the steps in this order.

### 1. Operator, spam placement, tracking

| # | Step | Expected result | Mails | Source |
|---|---|---|---|---|
| 1.1 | After reset 1 and bootstrap, owner requests a sign-in link at `/kabinet/vkhid` with `<owner-email>` and clicks it. | Link arrives, signs the owner in; the operator's `/kabinet` answers 404 outside support mode (intended); `/kabinet/prytulky` lists no shelters. | 1 | `docs/onboarding-a-shelter.md:731-736`; `auth.ts:413-417` |
| 1.2 | Spam placement of the magic-link mail: inbox, Promotions or Spam? Open "Show original": SPF, DKIM, DMARC all PASS, aligned; click and open tracking absent; the link is a plain URL on the site, not a redirect host. | Pass, plain link. Promotions placement is known from the delivery test and is recorded, not a failure; Spam is a failure. | 0 | `docs/onboarding-a-shelter.md:643-664, 696-703` |
| 1.3 | Re-use the same link a second time. | Opening the link again still shows the «Увійти» page (a GET consumes nothing); pressing «Увійти» answers 400 with the card «Це посилання вже використане або втратило силу.» and a link «Отримати нове посилання» to `/kabinet/vkhid`. | 0 | `auth.ts:406-411`; `apps/web/src/kabinet/confirm-route.ts:164-168, 209-211, 109-111`; `uk.ts:1322-1323` |
| 1.4 | Clear cookies and sign in again. | Second link arrives within a minute, works. Older link no longer valid. | 1 | `auth.ts:31` |
| 1.5 | Sign-in rate limit probe with `<owner-email>+nobody`: request a link 6 times in an hour. | Every answer looks the same as a sent link (no enumeration); no mail arrives; Vercel Logs show `{"event":"rate_limited","limiter":"kabinet-sign-in-address"}` from the 6th request. Limit: 5 per address, 20 per IP, per hour. | 0 | `apps/web/src/kabinet/sign-in-limit.ts:10-11`; `docs/launch-sequence.md:410-412` |
| 1.6 | Operator session limits are 7 days idle / 30 days maximum (just record; not tested live). | n/a | 0 | `apps/web/src/kabinet/auth-cleanup.ts:22-24`; `packages/db/src/repos/auth-expiry-repo.ts:36-39` (operator 7 days idle, 30 absolute; shelter admin 30 / 90) |

### 2. Invites

| # | Step | Expected result | Mails | Source |
|---|---|---|---|---|
| 2.1 | Operator creates S1 «Тест Притулок 1» (create form requires the first admin: `<owner-email>+t1`), still unverified. | Shelter appears in `/kabinet/prytulky`; the first admin is invited; a reminder card tells the operator to tell the shelter personally. Invite mail uses the "not yet verified" variant. | 1 | `docs/onboarding-a-shelter.md:446-492`; `apps/web/src/kabinet/handlers/registry-invitations.ts:56-59`; `email-senders.ts:221` |
| 2.2 | Check the invite mail: placement, headers, link plain, valid for 72 hours. | Same standard as 1.2. The page states «valid N hours» = 72. | 0 | `INVITATION_TTL_MS`, `kabinet-invitation-repo.ts:24` |
| 2.3 | Resend the invite for t1. | New mail; the previous link stops working (a resend issues a new link). | 1 | `registry-invitations.ts:316-338` |
| 2.4 | t1 opens the OLD link. | The one unusable page «Цим запрошенням не можна скористатися». | 0 | `docs/onboarding-a-shelter.md:908-931` |
| 2.5 | t1 opens the new link: page names the shelter and the masked address, set a password (repeat must match), «Зберегти й увійти». | Signed in, kabinet opens. | 0 | `docs/onboarding-a-shelter.md:908-931` |
| 2.6 | Open the same link again. | «Цим запрошенням не можна скористатися» (works once). Invite per-IP limiter: 20/hour. | 0 | `apps/web/src/kabinet/password-limits.ts:26` |
| 2.7 | Sign out; sign in with address + password. | Signed in. No mail. | 0 | `docs/onboarding-a-shelter.md:908-931` |
| 2.8 | Second browser: sign in the same way. Then in browser 1 «Забули пароль?» for t1. | Reset mail arrives (shelter admin only); open it, set a new password; browser 2 is signed out (reload `/kabinet` shows sign-in); a «пароль змінено» mail arrives. | 2 | `apps/web/src/kabinet/password-hooks.ts`; `docs/onboarding-a-shelter.md:844-907` |
| 2.9 | Sign in with the new password. In `/kabinet/akaunt` change the password. | Other sessions revoked, one renewed session; changed-notice mail. | 1 | `password-hooks.ts` |
| 2.10 | Forgot-password limit probe with `<owner-email>+nobody`: 4 requests in an hour. | No mails (not a shelter admin). Logs show `rate_limited` `kabinet-forgot-address` from the 4th (limit 3 per address, 20 per IP per hour). | 0 | `password-limits.ts:23-24`; `docs/launch-sequence.md:413-414` |
| 2.11 | Wrong-password sign-in 5 times for t1. | Attempts 1-5 are checked normally, each answering «Не вдалося увійти. Перевірте адресу й пароль або надішліть собі посилання для входу.»; the 5th starts a 1-minute gate, so the 6th (and any press during the wait) answers 429 «Забагато спроб входу. Спробуйте ще раз через {minutes} хв.» (whole minutes rounded up) and is not counted. After the wait the next attempt is checked, then waits 2, 4, 8, then 15 minutes (cap); no lockout; the correct password signs in after a wait and clears the count. | 0 | `docs/launch-sequence.md:412`; `apps/web/src/kabinet/password-limits.ts:56-68, 134-151`; `password-hooks.ts:352-359`; `uk.ts:277-280` |
| 2.12 | After S1 is verified (step 4.2), operator invites second admin t2 to S1. | Mail variant "verified". t2 accepts; both admins see the same shelter; operator sees both under «Адміністратори». | 1 | `email-senders.ts:221` |
| 2.13 | Operator invites an address that already is an operator (`<owner-email>`) as a shelter admin. | Refused with ADDRESS_HAS_A_ROLE (409), reason `operator`; no invitation is created. Under the admins list the alert reads «Це адреса адміністратора сайту. Для притулку потрібна інша.» (`admin.ts:98-107` is the reverse direction, grant). | 0 | `registry-invitations.ts:289-305`; `kabinet-invitation-repo.ts:291`; `AdminsManager.tsx:182-185`; `uk.ts:1637` |

### 3. Shelter onboarding via the operator screens

| # | Step | Expected result | Mails | Source |
|---|---|---|---|---|
| 3.1 | S1: fill profile (name, description, contact telegram, freshness sentence, address with city). | Saves; the public location shown on any page is the FUZZED one, not the typed address. | 0 | `docs/onboarding-a-shelter.md:227-238`; `LOCATION_HMAC_SECRET` |
| 3.2 | Freshness sentence: type a specific date or `{date}`. | Shown word for word; do not use placeholders. Required to publish. | 0 | `docs/onboarding-a-shelter.md:36-44` |
| 3.3 | Donation link: shelter submits «https://send.monobank.ua/jar/test»; operator approves; then submit another and operator rejects. | Approved link shows on the public shelter page; rejected does not. | 0 | `apps/web/src/kabinet/handlers/registry-writes.ts` (donation moves) |
| 3.4 | Phone `+380 00 000 00 01`. | Refused with «Вкажіть український номер: +380 і ще 9 цифр, наприклад +380 67 123 45 67.» (national part `000000001` starts with 0). Then `+380 10 000 00 01` accepted and stored as `+380100000001`. | 0 | `contact.ts:6-9, 29`; `fields.ts:126, 164`; `uk.ts:566` |
| 3.5 | Create S2 (registered NGO, admin t3) and S3 (unregistered, admin t4). | Both appear, pending. | 2 | `policy.ts:31-42` |
| 3.6 | Logo upload on S1: normal JPEG. | Logo stored as variants under `shelters/<id>/logo/` (two sizes, `small` 80 px and `large` 160 px, `packages/db/src/image-pipeline/variants.ts:48-51`); shown on the shelter page. Logos carry the same Cache-Control header as photos (every put goes through `r2-client.ts:76`). | 0 | `prepare-uploaded-photo.ts:112-114`; `variants.ts:57-78` |

### 4. Verification FSM

Legal moves (10 of 48 state-event pairs; every other pair is `illegal`): pending: start_review, reject;
under_review: approve, reject; verified: suspend, pause; paused: resume, suspend; rejected: resubmit; suspended:
reinstate (returns to the state it came from, verified or paused)
(`packages/domain/src/shelters/verification/transition.ts:75-213`). Evidence needed to approve: unregistered
initiative = 1 site visit + 2 reference contacts; NGO / sole proprietor = 1 EDRPOU + 1 bank holder + 1 reference
contact (`policy.ts:31-42`; `registry-writes.ts:343-366`). The UI offers only legal buttons, so refused pairs are
reached with a second, stale tab (the server re-checks on every attempt: `registry-writes.ts:282-299`).

| # | Step | Expected result | Source |
|---|---|---|---|
| 4.1 | S1: evidence with 1 site visit only, then try approve. | Refused `EVIDENCE_INSUFFICIENT`, naming the first missing requirement (two reference contacts). | `registry-writes.ts:349, 364` |
| 4.2 | S1: add 2 reference contacts (fake numbers, someone other than the shelter itself), start review, approve. | pending, under_review, verified. History shows each move with actor and time. | `transition.ts:75-117` |
| 4.3 | S1 verified: tab A and tab B open on S1. In A approve is no longer offered; in B (stale) press approve again. | Refused `ILLEGAL_TRANSITION` (from verified, event approve). | `registry-writes.ts:298` |
| 4.4 | S3: reject with code «insufficient_evidence» and a note. | rejected; reason recorded. Shelter admin sees it. | `transition.ts:84-105` |
| 4.5 | S3 rejected: operator tries start_review / approve / suspend via a stale tab. | Each refused `ILLEGAL_TRANSITION`. | `transition.ts:179-190` |
| 4.6 | S3: shelter admin resubmits with corrected evidence. | rejected to pending; then start_review and approve. | `transition.ts:179-190` |
| 4.7 | S3 verified: operator suspends (code «unresponsive»). Shelter admin tries pause / resume. | suspended; admin's pause refused `ILLEGAL_TRANSITION`; S3 animals leave the gallery at once. | `transition.ts:117-147`; `packages/domain/src/shelters/verification/state.ts:150-152` (only verified shelters are feed-visible; `feed-predicate.ts`) |
| 4.8 | Operator reinstates S3. | Back to verified; animals reappear in the gallery. | `transition.ts:191-213` |
| 4.9 | S3 admin pauses (code «capacity_reached») then operator suspends the paused shelter, then reinstates. | Reinstate returns to PAUSED (not verified). | `transition.ts:148-178, 191-213` |
| 4.10 | Approve straight from pending (stale tab, skipping review). | The UI never offers approve from pending (only «Взяти на розгляд» and reject), so a plain click cannot test it; the domain refuses it (`approve` from pending returns null), as `ILLEGAL_TRANSITION` from `pending`, event `approve`. To exercise it, drive a stale tab: the operator tab holds an under_review page with approve, another session rejects, the shelter admin resubmits (back to pending), then press approve in the stale tab; the page rereads and shows «З поточного статусу так не можна. Сторінку оновлено.» | `transition.ts:75-94`; `offered-actions.ts:81-82`; `DecisionPanel.tsx:125-126`; `uk.ts:1757` |
| 4.11 | No mail is sent for any of 4.1 to 4.10. | 0 mails. | `email-senders.ts` (four senders only) |

### 5. Animals: every sex x age x size

Domain values: species dog, cat; sex male, female, unknown; size small, medium, large; age bucket baby (<1 y), young
(1-3), adult (3-8), senior (8+) (`packages/domain/src/core.ts:16, 24, 28, 31`; bucket bounds `age.ts:15-27`). 72 combinations in full; cover EVERY value of each axis at least once and every sex x age pair
(12) and every sex x size pair (9). Suggested 12 animals on S1/S3 (names «Тест Пес/Кіт N»).

Publish requires: sex NOT unknown, size, age, description, and at least one photo; otherwise
`PUBLISH_REQUIREMENTS_UNMET` listing all gaps in form order (`packages/domain/src/animals/listing-transition.ts`;
`apps/web/src/kabinet/handlers/animals.ts:308-313, 621`).

| # | Step | Expected result | Source |
|---|---|---|---|
| 5.1 | Create 12 drafts covering: dog+cat; male, female; each size; each age bucket; plus ONE draft with sex unknown. | All save as drafts; drafts are invisible to adopters (404 on their id). | `incomplete-draft-invisible.test.ts`; `animal-detail-listing-kind.test.ts` |
| 5.2 | Publish each draft with at least one photo. | published; appears in the gallery `/tvaryny` of a VERIFIED shelter only; the card shows age bucket / size / species word matching sex (grammatical gender). | `feed-predicate.ts`; `grammatical-gender.ts` |
| 5.3 | Try to publish the sex-unknown draft (also: a draft with no photo, no description). | Publish blocked; the gap names (sex, photo, description) are shown next to the disabled button or in the refusal. | `animals.ts:308-313` |
| 5.4 | Age as a declared bucket vs a birth date. | Both accepted; the bucket is derived consistently from the birth date. | `age.ts` |
| 5.5 | Delete a never-published draft; then try to delete a card that was published and later withdrawn and restored to draft. | First allowed; second refused `WAS_PUBLISHED`. | `animals.ts:719-740` |
| 5.6 | Gallery filters in a private window (species, sex, size, age, city, region): each combination returns exactly the matching cards; counts match. | Matches; a filter with no result shows the empty state. | `feed-predicate.ts`; `gallery-facet-counts.test.ts` |

### 6. Photos

Pipeline (browser first): the form accepts `image/*` (`apps/web/src/features/kabinet/animal-form/PhotoSection.tsx:525`),
the browser decodes and re-encodes to JPEG, scaling the long edge to 2000 px (`PHOTO_MAX_EDGE_PX`,
`packages/domain/src/animals/photo.ts:48`) and trying decreasing quality until the file fits the upload limit
(`apps/web/src/features/kabinet/photos/compress-photo.ts`). The server then re-checks bytes: magic bytes must say
JPEG/PNG/WebP, sharp header format must match, neither side over 2000 px, then re-encodes to WebP variants with NO
metadata (`packages/db/src/image-pipeline/prepare-uploaded-photo.ts:75-109`).

**Five variants per photo, not three** (`IMAGE_VARIANTS = SERVED + EXTRA`, `variants.ts:19-35`, written by
`prepare-uploaded-photo.ts:108-110`; `mid` and `compact` added by `adcee1a`, #406): `thumb` 176x176, `card` 640x800,
`compact` 400x500, `mid` 840x1050, `detail` 1120x1400. Stored as
`animals/<animalId>/<uuid>/{thumb,card,compact,mid,detail}.webp` (`variants.ts:153-158`). The loader does not yet
request `mid` and `compact` (`variants.ts:25-29`), so they never show up in the browser's network tab; derive their
URLs by replacing `card.webp` in a `card.webp` URL. (`docs/onboarding-a-shelter.md:554-577` still says three files:
stale.) Max 10 photos per animal (`photo.ts:38`). Upload limits per shelter: 60 per hour, 300 per day
(`apps/web/src/kabinet/rate-limits.ts:50-51`).

| # | Case | How | Expected result | Source |
|---|---|---|---|---|
| 6.1 | Normal JPEG, 1600 px | Upload via form | Accepted; five WebP variants in R2 (R2 dashboard: the prefix `animals/<animalId>/<uuid>/` holds five files); first photo is the cover; moves «Оновлено» on a published card. | `variants.ts:19-35` |
| 6.2 | Oversize (e.g. 6000 x 4000 JPEG) | Upload via form | The BROWSER scales it to 2000 px and uploads; accepted. The server's `dimensions_exceeded` refusal is NOT reachable from the form. | `compress-photo.ts`; `prepare-uploaded-photo.ts:90-91` |
| 6.3 | Wrong format: HEIC | Upload via form | Client says HEIC unsupported (kind `heic_unsupported`); nothing sent. | `compress-photo.ts` |
| 6.4 | Wrong format: PDF / TXT renamed `.jpg` ("fake bytes") | Upload via form | Client cannot decode: `unreadable`; nothing sent. | `compress-photo.ts` |
| 6.5 | Server-side refusals (`unsupported_type`, `format_mismatch`, `dimensions_exceeded`, `unreadable`) | Only by a direct multipart POST to `shelter.photos.add` (advisor in the owner's signed-in tab via the page's own client, or a local script; needs the owner's explicit OK each time) | Typed error `PHOTO_REJECTED` with the reason; nothing written to R2. A PNG renamed to `.jpg` is accepted as PNG (type is decided by bytes, not name). | `prepare-uploaded-photo.ts:75-98`; `prepare-uploaded-photo.test.ts` |
| 6.6 | GPS-tagged JPEG (phone photo with location) | Upload via form; then download ALL FIVE variants (`thumb`, `card`, `compact`, `mid`, `detail`) from the public URL | No EXIF/GPS/XMP in any of the five. Verify with an offline tool on the owner's machine (e.g. `exiftool` prints no GPS for each file). The browser canvas already drops metadata; to prove the SERVER strips it also, use a direct POST (6.5) with the original GPS file and check the same five. Both must come back clean. | `generate-variants.ts:47-52, 75-106` (no metadata call; sharp writes none); `photo-pipeline-scan.test.ts` |
| 6.7 | **Cache-Control on an uploaded variant** | After 6.1, take the public URL of one variant (browser network tab, or the R2 public base URL plus the key) and run in PowerShell: `curl.exe -sI "<url>"`; read the `cache-control` line. Use a photo uploaded AFTER #404 (2026-11-03). | Expect `cache-control: public, max-age=31536000, s-maxage=14400, immutable` (`IMAGE_CACHE_CONTROL`, `packages/db/src/image-pipeline/r2-client.ts:29`, set on every put at `:76`). **Caveat:** the Cloudflare Cache Rule on `img.opika.org.ua` sets a browser TTL of 1 year (`docs/onboarding-a-shelter.md:538-553`); if the edge rewrites the header you may see only `max-age=31536000`. In that case read the origin value in the R2 dashboard (object details) or retest through a URL that bypasses the rule. Also record `cf-cache-status` (first request MISS, second HIT). Whether the edge rewrites the header: still UNVERIFIED, it depends on the live Cloudflare Cache Rule configuration, which is not in the repository (the doc only describes it). | `r2-client.ts:29, 76`; `docs/onboarding-a-shelter.md:538-553` |
| 6.8 | 11th photo on one animal | Upload via form | Refused `PHOTO_LIMIT_REACHED`. | `photo.ts:38` |
| 6.9 | Remove a photo, reorder, "make cover" | UI | Removal only unlinks it; the five files stay in R2 and stay reachable by URL until the clean-up deletes them (7-day grace); reorder / remove use compare-and-set on the photo list (stale tab gives CONFLICT). | `docs/onboarding-a-shelter.md:554-568`; `packages/domain/src/animals/photo.ts:67` |
| 6.10 | Upload limits (60/hour) | Not rehearsed live (too many uploads); covered by tests. | `photo-processing-budget.test.ts` | |
| 6.11 | Keep a list of R2 prefixes touched (animal ids) for reset 2's R2 check. | R2 dashboard prefix listing plus the `r2:cleanup` dry run counts (there is no `r2:count` script). | `reset-runbook.md` 5(b) | |

### 7. Listing states

Table (`packages/domain/src/animals/listing-transition.ts`): draft -> published (publish); published -> reserved
(reserve), adopted (adopt), withdrawn (withdraw with a reason), self-loop confirm; reserved -> published (release),
adopted, withdrawn, confirm; adopted is TERMINAL; withdrawn -> draft (restore_to_draft). «Ще шукає»/confirm moves
«Оновлено» and can be undone for 8 s on screen, 13 s on the server (`listing-transition.ts:40, 50`). Discoverable
kinds: published and reserved only. Freshness: fresh up to 7 days, aging up to 30, stale beyond (carried over from
`packages/domain/src/discovery/freshness.ts:42-44, 64-67`: whole elapsed 24 h periods; ageDays 0-7 fresh, 8-30 aging, 31+ stale).

| # | Step | Expected result |
|---|---|---|
| 7.1 | Publish (done in 5.2). | Visible in the gallery; detail page `/tvaryny/<id>` 200 with the gate cookie. |
| 7.2 | Reserve. | Still visible with a reserved badge; no reservation timestamp in public data (`animal-detail-listing-kind.test.ts`). |
| 7.3 | Release. | Back to published; `publishedAt` kept (wait clock not reset). |
| 7.4 | «Ще шукає» then «Скасувати» within 8 s. | `confirmedAt` returns EXACTLY to the previous instant; after 13 s the undo is refused (`undo_expired`). |
| 7.5 | Adopt a published animal. | Leaves the gallery; no button leads out of adopted (stale tab: `ILLEGAL_TRANSITION`). Detail URL `/tvaryny/<id>` answers 404 (`animals.byId` NOT_FOUND for a non-discoverable listing), the not-found page: «НЕ ЗНАЙДЕНО» / «Цієї картки більше немає.» / «Цієї тварини вже немає на сайті, або посилання застаріло.» with button «Усі тварини». (`animals.ts:47`; `app/tvaryny/[animalId]/page.tsx:60-61`; `uk-public.ts:533-538`) |
| 7.6 | Withdraw with a reason; then restore to draft; publish again. | Leaves the feed; restore keeps it a draft; republishing restarts the wait clock (`publishedAt` dropped). |
| 7.7 | Withdraw a draft (stale tab). | Refused (draft -> withdrawn is closed; a draft is deleted). |
| 7.8 | S1 admin pauses the shelter («Призупинити», code «seasonal_closure»); then resumes. | While paused ALL its animals leave the gallery and search (only `verified` shelters are feed-visible); resume brings them back. The shelter page stays open (paused is reachable) and shows, in place of the animals list: «Притулок тимчасово не приймає нових звернень», the line «Причина: Сезонна перерва», then «Тварини з цього притулку зараз не показуються в галереї.» (no filters). An animal published before the pause still opens by direct link with the same notice; one published during the pause is 404. History shows both moves. (`animals.ts:51-56`; `ShelterPageScreen.tsx:191-197`; `PauseNotice.tsx`; `AnimalDetailScreen.tsx:155-159`; `uk-public.ts:460-473`) |
| 7.9 | Suspend / reinstate S1 by the operator. | As 4.7 / 4.8. |

### 9 (part 1). Operator: admin removal and invitation withdrawal (NOT done in Sitting 1: 9.1/9.2 moved to S.1/S.2; 9.4 and the 9.3 erasure check are dropped)

| # | Step | Expected result | Mails | Source |
|---|---|---|---|---|
| 9.1 | S3: remove admin t4 («Прибрати»). WRITE DOWN THE TIME. | Membership gone and t4's sessions end at once; recorded in the shelter's history; removing the LAST admin is allowed. | 0 | `registry-invitations.ts:358-362` |
| 9.2 | t4's browser reloads `/kabinet`. | Signed out. | 0 | same |
| 9.4 | Invite t5 on S3, then withdraw the invitation. | Pending invitation removed; t5 never gets an account; no mail on withdrawal. | 1 | `registry-invitations.ts:358-359` |

## Sitting 2 (next day)

### 8. Adopter side, private window, 393 px (no emails)

Open the gate link once in a private window; DevTools device width 393 px. Budgets: API/pages 100 requests per minute
per IP (`docs/launch-sequence.md:406-408`); new anonymous visitors 50 per IP per day (`per-ip-budgets.ts:30`);
first-time shelter reveals 100 per IP per day and 30 shelters per visitor per 24 h (`per-ip-budgets.ts:31`;
`apps/web/src/api/reveal-rate-limit.ts:51`). Every private window is a new anonymous visitor and spends one of the
50 per-IP mints; stay under about 10.

| # | Step | Expected result | Source |
|---|---|---|---|
| 8.1 | Gallery `/tvaryny`: scroll, open a card, go back. | Cards from verified shelters only; each shows freshness wording; demo banner / label present (flag ON). The animal page opens as an overlay from the gallery and as a full page from a direct link. | `seo-flags.ts:57`; `apps/web/src/app/tvaryny/@preview/(.)[animalId]/page.tsx` |
| 8.2 | Gallery filters (species, sex, size, age, city, region); URL reflects filters; reload keeps them. | Results match; empty state when none. | `gallery-facet-counts.test.ts` |
| 8.3 | Save a card; open `/zberezheni`. | Saved list shows it; a card withdrawn or hidden in the meantime no longer exposes its name (S8-F5). Max 200 ids per request. | `docs/launch-gate.md:31`; `/api/rpc/animals/cardsByIds` (gate-exempt, `apps/web/src/proxy.ts:202`) |
| 8.4 | «Дати сімʼю» on a card. | First time for that shelter: contacts revealed, counted once; re-opening the same shelter is free; the shelter's EXACT address is never shown, only fuzzed location. | `packages/i18n/src/messages/uk-public.ts:33-49`; `reveal-rate-limit.ts:37-51`; `pre-reveal-location.test.ts` |
| 8.5 | Reveal on a reserved animal; on a shelter that was suspended in the meantime. | Reserved: reveal works. Suspended / paused: the card is gone from the feed. | `feed-predicate.ts` |
| 8.6 | 404s: `/tvaryny/<random uuid>`, `/prytulky/<random uuid>`, a draft's id, an adopted animal's id, `/tvaryny/not-an-id`. | Branded 404 page with noindex (`animal-surfaces.test.tsx`); the overlay variant shows the 404 copy inside the dialog. |
| 8.7 | `/prytulky/<S1 id>` shelter page. | Name, fuzzed city, donation link only if approved, freshness sentence word for word. |
| 8.8 | `/tvaryny/gortaty` (the retired deck URL). | A 308 redirect to `/tvaryny`; no deck, no error. | `apps/web/next.config.ts:58-66` |
| 8.9 | Rate-limit page: from the page console fire 101 requests to `/tvaryny` within a minute. | From the 101st: 429 rewritten to `/rate-limited` with `Retry-After` and noindex; the copy does not claim the card is gone. Clears within the minute. | `proxy.ts:219-240`; `animal-surfaces.test.tsx` |
| 8.10 | Not rehearsed live (would need 50 new visitors, 31 shelters): the per-IP mint cap and the 30-shelter cap. | Covered by tests `per-ip-budgets.test.ts`, `reveal-rate-limit` tests; observe `rate_limited` log names in Vercel Logs if any appears by accident. |
| 8.11 | 393 px layout: no horizontal scroll, tap targets at least 48 px, sticky bars do not cover content, safe-area respected; kabinet forms at 393 px too. | Pass. Throttle check: Chrome DevTools 6x CPU + Slow 4G, tap kabinet forms immediately on load; a lost tap is a bug to file. | `docs/onboarding-a-shelter.md:479-484` |
| 8.12 | Link preview images: `/opengraph-image` loads without the gate; a per-animal `/tvaryny/<id>/opengraph-image` still needs the gate until launch. | As stated. | `proxy.ts:200-205`; `docs/launch-sequence.md:338-343` |
| 8.13 | Response headers on a page while the gate is on. | Every response carries `X-Robots-Tag: noindex, nofollow` and the page has `<meta name="robots" content="noindex, nofollow">` (root layout). `/robots.txt` is itself gated: with the gate cookie it answers `User-Agent: *` / `Allow: /`; without it, 403 (not gate-exempt). | `docs/launch-sequence.md:354-356`; `next.config.ts:99-106`; `layout.tsx:77-79`; `robots.ts:9-11`; `proxy.ts:65-79, 202-206` |

### 9 (part 3). Support mode and history

| # | Step | Expected result | Mails | Source |
|---|---|---|---|---|
| 9.6 | Operator support mode on S1 (enter, edit nothing, leave). | Allowed (`registry.support.enter`, operator only): the button «Переглянути як притулок · лише читання» sets the support cookie and a session row is created (the reset deletes it, `full-reset.ts:64`); the banner reads «Ви переглядаєте кабінет притулку «{shelter}» – лише перегляд, змінити нічого не можна.»; any write is FORBIDDEN; leaving clears the cookie (`session.exitSupport`). | 0 | `apps/web/src/kabinet/registry-router.ts:213-229`; `support.ts:74-112`; `uk.ts:1180-1181, 1763` |
| 9.7 | Operator history view of S1. | Shows every move of section 4 and 7 with actors; no engagement data. | 0 | `packages/domain/src/shelters/history-no-engagement.test.ts` |

(9.5, the old "leave t6's invitation unused for 72 h" step, is removed.)

### S2. NEW (Sitting 2): pause and early listing, from the REAL production state

Start from what production actually holds (owner, 2026-11-05), not from the Sitting 1 plan:

| Shelter | Real state | Admin | Content |
|---|---|---|---|
| S1 | under_review, evidence: one site visit only | t1 (signed up) | animals: see E.0 |
| S2 | pending, evidence: EDRPOU only | t3 (invite NOT accepted; do not resend, 0 mails) | none |
| S3 | verified | t4 | 1 published cat, 1 adopted dog |

There is NO S4. Phase order: evidence-add (#419, merged; exercised in Sitting 1 steps 4.1/4.2, no new step) ->
S2-P pause (on S3) -> S2-E early listing (S1, S2) -> S3 suspend/reinstate -> S3 admin removal LAST. Run after
section 8 and 9 part 3, before section 10.

**Deployed-state gates (owner reads the Vercel dashboard before the sitting).**
- Pause (#423, merged): usable once the LATEST default-branch deployment is live (Production, Ready); a stale
  deployment still answers 404 for a paused shelter.
- Early listing: #425 is the data and rules (merged); the operator buttons are in #426 (being enqueued).
  **GATE, HARD RULE (owner): the early-listing steps (E.x) run ONLY after #426 is merged AND its deployment is live.
  Do not press «Дозволити показ до завершення перевірки» before that, and allow by no other route (no SQL, no
  script). If #426 is not live, skip S2-E and record "S2-E not run".**
- Migration 0023 (`early_listing_since`) must be on production (`db:check-hashes`: 24 `match` lines through `0023`).

**Roles by phase (one profile holds one session).**
1. Operator phase (owner signed in as the operator in a second browser or private window; advisor drives): suspend,
   reinstate, evidence-add, allow/revoke/approve, admin removal.
2. Shelter phase, in Hobby: owner signed in as t4 for S3 (pause, resume, publish during pause), then as t1 for S1.
3. Adopter checks: one private window at 393 px with the gate link, or the advisor's side with the gate cookie
   (each private window spends one of the 50 per-IP mints; reuse one).

Mails for the whole section: 0. (Operator sign-in if the session is gone, and reset 2's sign-in, are counted in the Day 2 row.)

#### S2-P. Pause, on S3 (all NEW (Sitting 2); 0 mails)

Public reason labels: seasonal_closure «Сезонна перерва», relocation «Переїзд», capacity_reached «Немає вільних місць»,
staff_shortage «Бракує волонтерів»; `other` shows NO reason line. Notice on every page: «Притулок тимчасово не приймає
нових звернень». No date anywhere.

| # | Step | Who | Expect |
|---|---|---|---|
| P.0 | Before pausing: record the S3 cat in the gallery, in search by its name, the counts, and the S3 shelter and cat URLs in `/sitemap.xml`. In the adopter window save the cat; open its page in tab X and open the contact dialog but do NOT confirm (for P.9). Also record the adopted dog's URL behaviour (not discoverable). | O+A | Numbers written down. |
| P.1 | S3 admin (t4) pauses with reason «Сезонна перерва». Kabinet texts: the `animalList` paused line and the pause dialog read «Поки прийом на паузі, ваших тварин немає в галереї та пошуку. Сторінки тварин і притулку відкриваються за прямим посиланням – там видно, що прийом на паузі.» Kabinet reason labels read «Немає вільних місць» and «Бракує волонтерів». | O (t4)+A | S3 paused; both texts word for word; the old line «…не бачать ті, хто шукає» is gone. |
| P.2 | Adopter window: `/prytulky/<S3 id>`. | A | 200, not 404. Notice and «Причина: Сезонна перерва»; the line «Тварини з цього притулку зараз не показуються в галереї.» in place of the list; no date; donation link still shown if S3 has an approved one; no contact or «Дати сімʼю». |
| P.3 | `/tvaryny/<cat id>` direct link. | A | 200 with notice and reason; NO «Дати сімʼю». |
| P.4 | Gallery, search, counts, sitemap. | A | The cat is gone from `/tvaryny`, search, filter and city counts (down by one), and `/sitemap.xml` has no S3 shelter or animal URL. |
| P.5 | View-source (or `curl.exe -s` with the gate cookie) of the shelter page and the animal page. | A | Each has `<meta name="robots" content="noindex...">`. Record whether `X-Robots-Tag` also appears (site-wide while the gate is on). |
| P.6 | Other reasons: resume, pause with «Переїзд», then «Немає вільних місць», then «Бракує волонтерів», then `other`. | O (t4)+A | The reason line matches each label; for `other` the notice shows with NO «Причина» line. |
| P.7 | While paused, t4 creates and publishes a NEW cat «Тест Кіт 99» (one photo; OWNER PREP: the owner supplies the photo). | O (t4)+A | Publish works. `/tvaryny/<new id>` answers 404 (same page as an unknown id; it was never served); not in the gallery. |
| P.8 | Saved-list handling of the P.7 animal: advisor calls `/api/rpc/animals/cardsByIds` (gate-exempt) with its id. | A | Returned as `unavailable` with `name: null`, NOT the `paused` arm: `everServedAt` is null, so the paused arm is skipped and the name stays hidden (`apps/web/src/api/handlers/animals.ts:132-167` and `:51-56` on the early-listing branch `ae755c7`; the paused arm needs `everServedAt !== null`). RESOLVED from code; confirm live. |
| P.9 | Stale tab X from P.0: press confirm in the contact dialog now. | O+A | Refused with typed `SHELTER_PAUSED`; the dialog shows the notice «Притулок тимчасово не приймає нових звернень»; no contact revealed, nothing counted against the 30-shelter cap. |
| P.10 | `/zberezheni` with the cat saved in P.0. | A | «{name} зараз не показується в галереї: притулок тимчасово не приймає звернень.» with the link «Відкрити сторінку»; the header saved-number does NOT count it. |
| P.11 | Paused then suspended: with S3 still paused, the operator suspends S3 (code «unresponsive»). | O (operator)+A | `/prytulky/<S3 id>` and `/tvaryny/<cat id>` read as 404, indistinguishable from an unknown id (compare with `/prytulky/<random uuid>`: same page, same status). |
| P.12 | Operator reinstates S3. | O (operator)+A | Returns to PAUSED, not verified; notice shows again (P.2, P.3 repeated). |
| P.13 | t4 resumes. | O (t4)+A | Everything returns: the cat (and «Тест Кіт 99») in gallery, search, counts and sitemap; shelter page shows the list and the verified trust line, no notice; «Дати сімʼю» works; the saved line is a normal card; per-page noindex gone (site-wide one stays while the gate is on). History shows pause, suspend, reinstate, resume. |
| P.14 | Plain suspend/reinstate of S3 from verified (no pause), the ordinary 4.7/4.8 check. | O (operator)+A | The cat leaves the gallery on suspend and returns on reinstate. |

#### S2-E. Early listing, on S1 and S2 (all NEW (Sitting 2); 0 mails)

**GATE (bold, owner hard rule): run ONLY after #426 is merged AND deployed. Before that there is no operator button and
nobody may allow listing by any other route.**

Public wording. Card and animal-page label «На перевірці»; shelter trust line «Притулок на перевірці»; reveal-dialog line
(N3) «Цей притулок ще проходить перевірку. Не переказуйте гроші наперед.»; share preview line «Тварина з притулку, який ще
проходить перевірку.» Minimum evidence to allow: one site visit OR one reference (`EARLY_LISTING_EVIDENCE_KINDS`,
`packages/domain/src/shelters/verification/early-listing.ts` on `ae755c7`); EDRPOU and bank holder do NOT count.
(Changed 2026-11-19, owner: an open-sources check counts too, with or without its registry part;
the refusal now reads «Щоб дозволити показ, потрібне хоча б одне: відкриті джерела, відеодзвінок або рекомендація.»)

| # | Step | Who | Expect |
|---|---|---|---|
| E.0 | Preconditions. #426 live. OWNER PREP: S1 needs at least 2 published animals (the owner has t1 publish them first; they stay hidden until the allow, since S1 is under_review). Record the gallery count and the sitemap. | O (t1)+A | Baseline written down. |
| E.1 | Below-minimum refusal on S2 (pending, EDRPOU only): operator presses «Дозволити показ до завершення перевірки». The confirm text reads «Картки притулку побачать усі, з позначкою «на перевірці». Дозвіл діє до 60 днів, зняти його можна будь-коли.» | A | Refused: «Щоб дозволити показ, потрібен хоча б візит на місце або одна рекомендація.» Nothing public; no history line. |
| E.2 | On S2 evidence-add a bank-holder item (fake data), then press allow again. | A | STILL refused with the same text (a bank holder is not a visit or a reference). S2 stays pending and unlisted. S2 stays pending and unlisted so far. |
| E.3 | Third-period refusal, LIVE on S2 (pending; this also covers allowing from pending; S2 has no animals, so nothing appears publicly). Evidence-add 1 reference (fake). Then: allow, revoke, re-allow with a note, revoke, allow again. | A | The first allow works from pending (S2 stays pending); the re-allow asks for the note and works with it; after the second revoke the third allow is refused: «Показ до перевірки вже дозволяли двічі.» Leave S2 REVOKED at the end. |
| E.4 | S1 (site visit on file, so the minimum is met): operator allows. | A | Allow works; S1 stays under_review; history line recorded with actor and time. |
| E.5 | Gallery, search, counts. | A | S1 animals appear in `/tvaryny`, search and counts (up by the S1 number), each card with «На перевірці». Ordering unchanged by the label (no boost, no penalty): record one S1 card's position among verified cards. |
| E.6 | Shelter page `/prytulky/<S1 id>` and an animal page `/tvaryny/<id>`. | A | Trust line «Притулок на перевірці» instead of the verified line, no date; the animal page shows «На перевірці» near the shelter row. |
| E.7 | Contact reveal on an S1 animal; read the dialog and the reveal response. | A | Dialog shows «Цей притулок ще проходить перевірку. Не переказуйте гроші наперед.» The payload carries only the public label; neither `pending` nor `under_review` appears in what the adopter receives. |
| E.8 | View-source of the S1 shelter and animal pages; `/sitemap.xml`. | A | Both pages `noindex`; no S1 shelter or animal URL in the sitemap. |
| E.9 | Share preview: `/tvaryny/<S1 animal id>/opengraph-image` (gate cookie) or the page `og:description`. | A | «Тварина з притулку, який ще проходить перевірку.» present; no claim of verification. The preview may lag up to about 25 h (cache): record only. |
| E.10 | S1 kabinet as t1 (third session). | O (t1)+A | ONE banner only, dated: «Ваші картки показуються з позначкою «на перевірці» до {date}.» ({date} = allow + 60 days), not three overlapping messages (not also the pending note, not also the not-shown line). History line «Ваші картки показуються, поки триває перевірка». |
| E.11 | Operator view of S1, days-left line. | A | A line «До кінця показу: {n} день / дні / днів» shown from day 0 (muted style until the last 7 days, normal style at 7 or fewer): `EarlyListingPanel.tsx:163-164` on `ae755c7` renders it for every running permission, `remind` only changes the look; right after the allow it reads «60 днів». RESOLVED from code. Other plural forms (1, 2, 5, 21, 22) are covered by unit tests, not live. |
| E.12 | Operator presses «Зняти дозвіл» (revoke) on S1. | A | S1 animals leave gallery, search, counts at once; shelter and animal pages answer 404 again; history «Показ карток до завершення перевірки знято», also visible to t1. |
| E.13 | Re-allow S1 (second period). | A | Asks for a written note, label «Чому подовжуєте показ»; refused without it (`note_required`), works with it; animals return with the label. Count rule, RESOLVED from code: `periodsUsed` is the number of `early_listing_allowed` history rows (`packages/db/src/repos/kabinet-shelter-repo.ts:302` on `ae755c7`), and history survives reject and resubmit, so an allow made before a reject/resubmit DOES count toward the cap of 2 (`EARLY_LISTING_MAX_PERIODS`); there is no reset on resubmit. Accepted as intended behaviour (owner decision); a unit test and a note in the early-listing doc are a separate code PR, not part of this file. |
| E.14 | Evidence-add 2 reference contacts (fake numbers) on S1 (now visit + 2 references, the unregistered rule); approve. | A | Approve clears the permission: S1 verified, label «На перевірці» and the dated banner gone, verified trust line, S1 URLs in the sitemap, E.8 noindex gone, operator view shows no days-left line. |
| E.15 | Expiry after 60 days. | O | NOT run live (cannot wait 60 days). Covered by the automated SQL-versus-domain parity test (strict boundary at exactly 60 days), plus a DB check on a CHILD branch only: ask the advisor for the snippet. Never run SQL for this feature against production. |

#### S2-D. Donation link (all NEW (Sitting 2); 0 mails)

**GATE (bold): run S2-D ONLY after the pending donation PR (donation gate, `registry.donation.remove`, suspend moves a live link to pending, userinfo/punycode validation) is merged AND deployed. Before that, skip S2-D and record "S2-D not run".** Exact UI strings are TBD: the donation copy is not approved yet; each row's wording is in `D:\Startup\opika\Claude outputs\donation-copy-table.md` («рядок буде в таблиці донат-копі»). Until that table is approved, check meaning, not words. Existing step ids are unchanged; D.1 runs INSIDE S2-E (between E.5 and E.14, while S1 is early-listed), D.2 right after E.14, D.3 to D.7 on S3 before S.1.

| # | Step | Who | Expect |
|---|---|---|---|
| D.1 | NEW (Sitting 2). While S1 is early-listed (after E.4/E.5, before E.14): record whether S1 has an approved donation link at this point (step 3.3 may have approved one). Open `/prytulky/<S1 id>` and an S1 animal page. | A | Neither page shows a donation link while S1 is early-listed, even if an approved link exists. Record yes/no for the approved link. |
| D.2 | NEW (Sitting 2). Right after E.14 (S1 approved and verified): reopen both S1 pages. | A | If S1 has an approved link, it now appears on BOTH the shelter page and the animal page. If S1 has none, record "no link to show" and propose/approve one to see it appear. |
| D.3 | NEW (Sitting 2). S3 has an approved live donation link (propose and approve one first if not; fake `https://send.monobank.ua/jar/test`). Operator suspends S3 (code «unresponsive»). | O (operator)+A | The live link goes to PENDING (not live): gone from S3 pages (they are 404 while suspended anyway); the operator's donation card shows it as pending; the shelter's kabinet donation section explains why (strings TBD, `donation-copy-table.md`). |
| D.4 | NEW (Sitting 2). Operator reinstates S3, then looks at the S3 pages. | O (operator)+A | The link is NOT live on the shelter or animal pages (still pending). Operator approves it (one click) and the link is live again on both. |
| D.5 | NEW (Sitting 2), OPTIONAL variant of D.3. Before suspending, the shelter (t4) proposes a NEWER link while the old one is live; then the operator suspends. | O (operator, t4)+A | The newer pending proposal stays pending; the old live link is not restored as live and appears only in history. Reinstate, approve the pending one: it goes live. |
| D.6 | NEW (Sitting 2). Remove action on S3: operator removes the live link with a reason. Then the shelter proposes a new link and the operator approves it. | A + O (t4) | After removal the link is gone from the shelter and animal pages; the shelter history and the kabinet donation section show the removal (strings TBD). The new proposal, once approved, is live. |
| D.7 | NEW (Sitting 2). Validation: t4 proposes `https://user@example.org` (userinfo) and then a link whose host starts with `xn--` (punycode). | O (t4)+A | Both are refused with the shelter-facing error (wording TBD, `donation-copy-table.md`); nothing becomes pending or live. |

#### S2-S. Last: S3 admin removal

| # | Step | Who | Expect |
|---|---|---|---|
| S.1 | Everything else in section 8, 9 part 3, S2-P and S2-E is finished and S3 is back to verified. Operator removes admin t4 from S3 («Прибрати»). WRITE DOWN THE TIME. | A | Membership gone, t4's sessions end at once, history line recorded; removing the last admin is allowed. |
| S.2 | t4's browser reloads `/kabinet`. | O | Signed out. |
| S.3 | Optional erasure check, only if you wait at least 6 hours (auth clean-up cron every 6 h, `apps/web/vercel.json:6`): in Neon SQL Editor, read-only, `SELECT count(*) FROM auth_user WHERE email = '<owner-email>+t4';` | O | 0. If you cannot wait 6 hours, skip it and go straight to reset 2 (it truncates everything anyway); record "S.3 skipped". |

### 10. Reset 2 preconditions

| # | Step | Expected result |
|---|---|---|
| 10.1 | Record what exists: 3 shelters, animals as found, photo prefixes (R2 dashboard object count, and the `r2:cleanup` dry run). | Numbers written down to compare against reset 2's dry run. |
| 10.2 | Check Vercel Logs for the whole rehearsal: any `error`, 5xx, `rate_limited` that surprised; Sentry issues. | List of findings to fix before launch. |
| 10.3 | Create `pre-reset-2`, run `reset-runbook.md` with N = 2. | All 17 tables 0; hashes match; bootstrap; photos swept (grace 0) or left for the cron; Cloudflare Purge Everything. |

## Not covered live (and why)

- Per-IP mint cap (50/day) and 30-shelter reveal cap: would need many visitors/shelters; unit tests only.
- Photo upload budgets (60/h, 300/day): unit tests only.
- Invitation expiry after 72 h: dropped from the live plan, unit tests only.
- Server-side photo refusals other than via direct POST (step 6.5).
- Real deliverability to non-Gmail providers (TLS Enforced bounces): only the owner's Gmail aliases are used
  (`docs/onboarding-a-shelter.md:626-642`).
