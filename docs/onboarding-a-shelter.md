# Onboarding a real shelter

Follow this while on the phone with a volunteer, in order. Don't improvise
the sequence — the dry run exists specifically so you see the computed
public location before anything touches the live database.

## What to ask the shelter for

- **Legal shape**: registered NGO (legal name + EDRPOU), sole proprietor
  (legal name + EDRPOU), or an unregistered volunteer group (just a contact
  person's name).
- **Exact address** — street, city, coordinates. Never shown to an adopter
  directly; this is what gets fuzzed.
- **A contact channel** they actually answer on — phone, Telegram, or both.
- **A donation link**, if they have one (their own page — this platform
  never touches money).
- **A freshness sentence, in their own words** — one or two sentences about
  how current their listings are. Required; don't onboard without it.
  It is shown **word for word**: nothing fills in a date or an animal's name
  (inbox VH-Q1). So keep a specific date and any animal's name out of it: a
  typed date goes stale while it still reads as current, and `{date}` or
  `{name}` would appear with their braces.
- **Real verification evidence** — see below. Not their name for the record;
  actual evidence the domain's own verification policy requires, or the
  script refuses to write a `verified` shelter at all.
- **For each animal**: name, species, sex, size bucket, age bucket, a short
  description, and at least one real photo file — see "Photos" below.

## The input file

**Save it outside this repository.** It will contain a real address and
phone number, and `docs/standing-constraints.md` forbids real shelter data
in the repo — it's public. The script refuses to run on a file inside the
working tree; this isn't a formality to route around, it's the actual
guard. A sensible place: `~/opika-shelters/domivka-brovary.json`.

Fictional worked example (values only — see `packages/db/src/onboard-
shelter.ts` for the exact schema, enforced by zod, so a typo fails loudly
before anything is computed):

```json
{
  "shelter": {
    "idSeed": "domivka-brovary",
    "displayName": "Притулок «Домівка»",
    "descriptionUk": "Невеликий притулок у Броварах, шукаємо дім для 12 собак і 5 котів.",
    "legalEntity": {
      "kind": "unregistered_initiative",
      "contactPersonName": "Олена Ковальчук"
    },
    "exactAddress": {
      "line1": "вул. Незалежності, 12",
      "line2": null,
      "postalCode": null,
      "cityId": "<a real CityId from the seeded 8 cities — ask if unsure>",
      "district": null,
      "coordinates": { "lat": 50.5111, "lng": 30.7903 }
    },
    "contact": {
      "primary": { "kind": "telegram", "handle": "domivka_brovary" },
      "additional": [{ "kind": "phone", "e164": "+380671234567" }]
    },
    "donation": { "url": "https://send.monobank.ua/jar/example", "provider": "monobank_jar" },
    "freshnessSentenceUk": "Оновлюємо картки щотижня, у суботу.",
    "evidence": [
      {
        "kind": "site_visit",
        "visitedOn": "2026-09-01",
        "notes": "Дзвінок з Оленою 1 вересня — розповіла про притулок, показала фото тварин на місці."
      },
      {
        "kind": "reference_contact",
        "name": "Притулок «Хвостатий дім» (сусідній, знає «Домівку» особисто)",
        "channel": { "kind": "phone", "e164": "+380671111111" },
        "relationship": "partner_organisation"
      },
      {
        "kind": "reference_contact",
        "name": "Ветклініка, з якою працює притулок",
        "channel": { "kind": "phone", "e164": "+380672222222" },
        "relationship": "veterinary_clinic"
      }
    ]
  },
  "animals": [
    {
      "idSeed": "domivka-brovary-lastivka",
      "name": "Ластівка",
      "species": "dog",
      "sex": "female",
      "size": "medium",
      "ageBucket": "adult",
      "descriptionUk": "Спокійна, любить дітей, вже привчена до повідка.",
      "photos": [
        { "localPath": "photos/lastivka-1.jpg" }
      ]
    }
  ]
}
```

`idSeed` values (one on the shelter, one per animal) must be unique and
**stable** — they're what makes re-running the script safe. Don't change
them between runs of the same shelter; do use a new one for a genuinely
different animal.

### Evidence — what's actually required, per legal shape

`packages/domain`'s own `DEFAULT_VERIFICATION_POLICY` decides this, not the
script — `buildShelter` checks against it and refuses to produce a
`verified` shelter (dry run included) if the evidence given falls short.

| Legal shape | Needs |
|---|---|
| `unregistered_initiative` (most volunteer groups) | 1× `site_visit`, 2× `reference_contact` |
| `registered_ngo` / `sole_proprietor` | 1× `edrpou_registration`, 1× `bank_account_holder`, 1× `reference_contact` |

A `reference_contact`'s `channel` must be someone **other than the shelter
itself** — a neighbouring shelter, a vet clinic they work with, anyone who
can independently confirm this is real. Pointing it at the shelter's own
phone number isn't evidence, it's the thing being verified restating
itself, and an earlier version of this script did exactly that by mistake
(caught on review, fixed before ever being used for real).

A `site_visit` doesn't require you to have physically gone anywhere — a
real phone call where you actually talked to someone and can say what you
learned counts; `notes` should say what actually happened, in your own
words, since this becomes a permanent part of the shelter's record.

**`visitedOn` is required** (`YYYY-MM-DD`): the day the visit or call
actually happened, not the day you're filling in this file. A date after
today is refused, because a visit that hasn't happened can't back a
verification. The script records you (its founder stand-in) as the person
who vouches for it; there's no field for that.

**An `edrpou_registration` needs `registeredName`**: the name exactly as ЄДР
shows it on the day you check the code. A reviewer compares it with the
shelter's own name and the bank holder's name, so copy it from the
registry, don't retype it from the shelter's message. Leave `documentKey`
out of `edrpou_registration` and `bank_account_holder`: the script refuses
one until the private evidence bucket exists, because a key typed here
points at nothing the system issued.

```json
{
  "kind": "edrpou_registration",
  "edrpou": "12345678",
  "registeredName": "ГРОМАДСЬКА ОРГАНІЗАЦІЯ «ДОМІВКА»"
}
```

(Changed 2026-10-07, H2: input files written before that need `visitedOn`
added to each `site_visit` and `registeredName` to each `edrpou_registration`.
The script refuses the old shape rather than guessing.)

### Photos

`localPath` (in each animal's `photos` array) points at a real file on your
own machine — relative paths resolve against **the input JSON's own
directory**, not wherever you happen to run the command from. Keep a
`photos/` folder next to the input file:

```
~/opika-shelters/
  domivka-brovary.json
  photos/
    lastivka-1.jpg
    lastivka-2.jpg
```

You don't supply width/height — the script reads the real file for its
actual dimensions, both in dry run and `--commit`. A missing file or one
sharp can't decode (wrong format, corrupted download) fails immediately,
before anything is uploaded or written, with the file path in the error.

Uploading only happens on `--commit` — the dry run validates that every
photo file exists and is readable, and nothing more. `--commit` generates
three real sizes per photo (thumbnail, gallery-card, detail-page) and
uploads each to R2; see "R2 credentials" below for what that step needs.

## Run it: dry run, then commit

```bash
# From the repo root. This run reads LOCATION_HMAC_SECRET from your own
# shell, the same as DATABASE_URL for migrations. (Vercel Production holds
# the same value since production sign-in, for the registry, RG-Q10; this
# script never reads Vercel's.)

LOCATION_HMAC_SECRET=<your secret> \
DATABASE_URL=<neon-direct-url> \
  pnpm --filter @opika/db run onboard:shelter -- ~/opika-shelters/domivka-brovary.json --prod
```

**`--prod` is required when `DATABASE_URL` is production** (since
2026-10-07, `packages/db/src/prod-guard.ts`). The script compares the
target's Neon compute with `PROD_NEON_ENDPOINT` (an endpoint id like
`ep-…`, never a URL; read from your environment or the root `.env.local`)
and refuses production without the flag, so you can't onboard into
production by habit. With `PROD_NEON_ENDPOINT` unset it refuses *every*
non-local target without `--prod`: it fails closed. The same rule applies to
`db:migrate` and `db:seed`.

This is a **dry run** — nothing is written. Read the printed output
carefully: it shows the *computed* public location (the fuzzed
coordinates), not the address you typed in — that's the actual proof
`productionLocationPolicy` ran with your secret before anything real was
at stake. Check the **offset line** specifically: `Offset from the real
address: 743m (radius: 1000m) — looks right`. At a 1km fuzz radius the
raw coordinates always share their first two decimal digits with the real
address — that's what the radius means, and eyeballing them tells you
nothing. The offset figure is the actual check: it should read "looks
right," a non-zero number inside the stated radius. If it says "CHECK
THIS" or reads suspiciously close to 0m, stop and check
`LOCATION_HMAC_SECRET` is set correctly — don't proceed to `--commit`.

Once it looks right, `--commit` additionally needs the R2 write
credentials (below):

```bash
LOCATION_HMAC_SECRET=<your secret> \
DATABASE_URL=<neon-direct-url> \
R2_ACCOUNT_ID=<your R2 account id> \
R2_ACCESS_KEY_ID=<your R2 access key id> \
R2_SECRET_ACCESS_KEY=<your R2 secret access key> \
R2_BUCKET_NAME=<your R2 bucket name> \
  pnpm --filter @opika/db run onboard:shelter -- ~/opika-shelters/domivka-brovary.json --commit --prod
```

If it fails partway through (network blip, a typo caught mid-run), just
run the exact same command again — each animal's existence is checked
*before* its photos are uploaded, so an already-inserted animal is
skipped entirely (no re-upload, no re-insert) and only the animals that
never made it through the first time do any work.

**A re-run does not update an existing animal, and the warning that catches
this only sees photo *count*, not content.** If you add or remove a photo
for an animal that already exists — changing how many it has — the script
warns loudly (`WARNING: ... already exists with N photo(s), but this
input now lists M`) and does nothing further: no upload, no insert, no
change. **If you replace a photo file one-for-one, the count doesn't
change and the script stays silent** — it has no way to tell the new file
apart from the one already recorded. There's no real update path yet —
treat an onboarded animal's photos as fixed once inserted. If you need to
correct a photo (not just add one), that has to be done by hand for now,
not by re-running this script.

## Where `LOCATION_HMAC_SECRET` comes from

Generate one once with `openssl rand -hex 32`. Keep it somewhere you can
find it again — the same value must be used every time you onboard a
shelter, or a shelter onboarded with a different secret would get a public
location fuzzed against a key nothing else remembers. Since the commit that
turns production sign-in on, Vercel Production holds the same value (the
registry fuzzes a shelter's location with it on create and on an address
change), and a production build fails and a production instance refuses to
boot without it (RG-Q10, WI-T2).
Never generate a new one for Vercel: `location:verify --prod` would then
report every shelter as a mismatch.

## R2 credentials

Four values, from Cloudflare's dashboard (R2 → your bucket → **Manage API
tokens**): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET_NAME`. **Local shell only, never in Vercel**: this script runs
from your own machine, and no request path of the deployed site writes to
R2. The deployed app needs a fifth, different value
instead — `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`, the bucket's *public* read URL
— set once in Vercel (Production and Preview), not per onboarding run; see
`docs/h1-decisions.md` for why that one's required at boot and what it
means if it's ever missing there.

⚠ **Not yet run against a real bucket.** The upload path (`packages/db/src/
image-pipeline`) is fully unit-tested against real image fixtures and a
mocked storage client, but the actual authenticated `PutObject` call, CORS,
content-type headers, and whether `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` +
a real key resolves over HTTP are all unverified until this runs once for
real. Treat the first real onboarding run as that verification, not as a
formality — watch the upload log lines closely and check the resulting
photo actually loads on the live detail page before trusting the rest.

## A shelter says the invitation never arrived

All kabinet email goes through Resend (EM-B10). While Resend is the provider, the registry's
blocked-addresses view answers "not checked" (EM-T26; a scan of Resend's suppression list is
follow-up EM-F1), so it can't tell you whether an address is blocked. The first step is Resend's
dashboard for that address: **Logs** (was the invite sent, delivered, bounced?), then
**Suppressions** (is the address on the suppression list, and why?). Only then resend the invite
from the registry, and tell the shelter personally (IN-E13). Oleksii's condition on EM-T26,
2026-10-15.

## Debugging sign-in: share a name and an email, never the response

`/api/auth/get-session` answers with the signed-in user **and the session itself, token
included**, in its JSON body. The app needs that; a person reading it while debugging doesn't. When
you report what a sign-in shows (to a helper, in a chat, in an issue), copy the user's **name and
email only**, never the whole response.

If a token does get out: sign out in the browser that holds that session. Signing out deletes its
`auth_session` row, so the token matches nothing from then on; then confirm `get-session` answers
`null` and sign in again. A bare token was never a working sign-in on its own, since the cookie
also carries a signature made with `BETTER_AUTH_SECRET` (next section), so no rotation is needed
for a token alone. This happened once, on 2026-10-15, with the operator's own session, and was
closed exactly this way (inbox RO-E1).

## The operator's own `/kabinet` answers 404

Signed in as the operator (super_admin) and outside support mode, `/kabinet` answers 404. That is
intended for now (inbox RO-D1): the kabinet shows one shelter's profile, and the operator account
belongs to no shelter. The operator works through the registry API instead. A minimal operator
landing (one line plus «Вийти») is a low-priority follow-up (RO-F1).

## Rotating `BETTER_AUTH_SECRET` (kabinet sign-in)

Better Auth stores kabinet session tokens in plain text in `auth_session`
(there is no supported hashing in 1.6.33; better-auth#11442 is open, recheck
at the next Better Auth upgrade), so what keeps a leaked table row from being
a working sign-in is the cookie's signature, made with `BETTER_AUTH_SECRET`.
That value lives only in Vercel's environment: never in the database, the
repo, a log or a local file. Rotate it on any suspected exposure (of the
secret itself, or of the `auth_session` table together with anything that
might have held the secret): generate a new value with `openssl rand -hex 32`,
replace it in Vercel's Production environment, and redeploy. Every cookie
signed with the old value stops verifying at once, so **every shelter admin
and the operator are signed out** and sign in again with a fresh link. The
old rows become unusable at once and are deleted by the daily auth clean-up
once their 7-day expiry passes (inbox KH-Q9, KH-Q10).

What rotation leaves alone, exactly. `CURSOR_HMAC_SECRET` and
`LOCATION_HMAC_SECRET` sign with their own keys, the pre-launch gate checks
its own `PRELAUNCH_GATE_SECRET`, and an adopter's anonymous device session is
a random token stored as its hash, with no key at all. None of them read
`BETTER_AUTH_SECRET`, so feed cursors, fuzzed locations, the gate cookie and
adopters' sessions all keep working.

What it also leaves alone, and this one matters: **a sign-in link sent in the
last 15 minutes still works after the rotation.** Links are stored in
`auth_verification` as a plain SHA-256 of the token, with no key, so the new
secret doesn't invalidate them, and following one creates a fresh session
signed with the new secret. If the exposure could include a link itself (a
mailbox, a log line carrying the verify URL), finish with one more step after
the redeploy: in Neon's SQL editor, on the production branch, run

```sql
DELETE FROM auth_verification;
```

The kabinet signs in by magic link only, so that table holds nothing but
links not yet used (a used link's row is deleted when it's followed). The
worst it does is make someone whose link was in flight ask for a new one.
