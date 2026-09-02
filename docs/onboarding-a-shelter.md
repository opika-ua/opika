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
- **Who you're talking to** — their name, for the verification record.
- **For each animal**: name, species, sex, size bucket, age bucket, a short
  description, and at least one photo already placed under
  `apps/web/public/seed-photos/` (or another path under `apps/web/public/`)
  — there is no upload pipeline yet, so photos are files you copy in by hand
  before running the script.

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
    "vettedByName": "Олексій Колотенко"
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
        { "storageKey": "/seed-photos/dog-3.jpg", "width": 1200, "height": 1500 }
      ]
    }
  ]
}
```

`idSeed` values (one on the shelter, one per animal) must be unique and
**stable** — they're what makes re-running the script safe. Don't change
them between runs of the same shelter; do use a new one for a genuinely
different animal.

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
coordinates), not the address you typed in. That's the actual proof
`productionLocationPolicy` ran with your secret before anything real was
at stake. If the printed coordinates look anything like the real address,
stop and check `LOCATION_HMAC_SECRET` is set correctly — don't proceed to
`--commit`.

Once it looks right:

```bash
LOCATION_HMAC_SECRET=<your secret> \
DATABASE_URL=<neon-direct-url> \
  pnpm --filter @opika/db run onboard:shelter -- ~/opika-shelters/domivka-brovary.json --commit
```

If it fails partway through (network blip, a typo caught mid-run), just
run the exact same command again — already-inserted rows are detected by
their stable id and skipped, not duplicated.

## Where `LOCATION_HMAC_SECRET` comes from

Generate one once with `openssl rand -hex 32`. Keep it somewhere you can
find it again — the same value must be used every time you onboard a
shelter, or a shelter onboarded with a different secret would get a public
location fuzzed against a key nothing else remembers.
