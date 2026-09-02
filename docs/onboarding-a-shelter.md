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
# From the repo root. LOCATION_HMAC_SECRET is never sent to Vercel for this
# — it only needs to exist in your own shell, the same as DATABASE_URL does
# for migrations (docs/build-plan.md Part 5 explains why).

LOCATION_HMAC_SECRET=<your secret> \
DATABASE_URL=<neon-direct-url> \
  pnpm --filter @opika/db run onboard:shelter -- ~/opika-shelters/domivka-brovary.json
```

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
  pnpm --filter @opika/db run onboard:shelter -- ~/opika-shelters/domivka-brovary.json --commit
```

If it fails partway through (network blip, a typo caught mid-run), just
run the exact same command again — each animal's existence is checked
*before* its photos are uploaded, so an already-inserted animal is
skipped entirely (no re-upload, no re-insert) and only the animals that
never made it through the first time do any work.

**A re-run does not update an existing animal** — if you edit a photo
list (add or replace a file) for an animal that already exists, the
script warns loudly (`WARNING: ... already exists with N photo(s), but
this input now lists M`) and does nothing further for that animal:
no upload, no insert, no change. There's no update path yet — treat an
onboarded animal's photos as fixed once inserted, or ask for this to be
built if you need to correct one.

## Where `LOCATION_HMAC_SECRET` comes from

Generate one once with `openssl rand -hex 32`. Keep it somewhere you can
find it again — the same value must be used every time you onboard a
shelter, or a shelter onboarded with a different secret would get a public
location fuzzed against a key nothing else remembers.

## R2 credentials

Four values, from Cloudflare's dashboard (R2 → your bucket → **Manage API
tokens**): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET_NAME`. **Local shell only, never in Vercel** — same reasoning as
`LOCATION_HMAC_SECRET`: this script runs from your own machine, never
through the deployed site. The deployed app needs a fifth, different value
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
