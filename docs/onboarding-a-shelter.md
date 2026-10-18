# Onboarding a real shelter

Follow this while on the phone with a volunteer, in order. Don't improvise
the sequence — the dry run exists specifically so you see the computed
public location before anything touches the live database.

## PowerShell 5.1: reading a secret

Windows PowerShell 5.1 has no `Read-Host -MaskInput`. Every connection string in this runbook is
read with this helper, pasted once per shell (Oleksii, 2026-10-18, verbatim helper):

```powershell
function Read-Secret($p){ $s = Read-Host $p -AsSecureString; [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) }
```

A Neon endpoint id (`ep-…`, never a URL) is derived from the URL in the shell rather than typed:

```powershell
$ep = ([uri]$env:DATABASE_URL).Host.Split('.')[0] -replace '-pooler$',''
```

Smoke blocks keep deriving `$ep` from the child branch's URL; their protection is the smoke
script's own refusal of production, not `--expect`. Don't "fix" it. A production migration
types its endpoint id instead (see "Migrating production").

Never paste a connection string into a command line, a file or a chat.

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
  It is shown **word for word**: until K2, nothing fills in an animal's name,
  and nothing will ever fill in a date (inbox VH-Q1). So keep a specific date
  and any animal's name out of it: a
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
`db:migrate` and `db:seed`. `db:migrate` also needs `--expect ep-…` naming the target's exact
Neon compute for any non-local target (AW-F1), so a migration can't land on a database the shell
happens to point at.

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

## Migrating production (the gate block for a PR with a migration)

Every merge gate that applies a migration uses this block. Oleksii, 2026-10-18, verbatim: "From
now on every gate block uses db:migrate --prod --expect <ep>; update the runbook." An additive
migration is a gate *before* the merge: Vercel deploys the default branch as soon as it merges, so
the new schema has to be there first. A destructive one follows the rule below. Run it from the main checkout (its root `.env.local` provides
`PROD_NEON_ENDPOINT`) switched to the PR's head, in Windows PowerShell 5.1 with `Read-Secret` from
"PowerShell 5.1: reading a secret" pasted first.

**Which kind of migration it is decides the order.** Oleksii, 2026-10-18, verbatim: "Additive
changes (new columns, DROP NOT NULL, constraints existing rows pass) → migrate, then merge.
Destructive changes (DROP/RENAME a column or table, tightening a constraint) → expand/contract:
first merge code that no longer uses the old shape, then migrate in a later PR. If in doubt, it's
destructive: ask me." **Every migration PR says in its body which kind it is.** The block below
is the additive order: it runs before the merge.

Replace `<pr branch>` before running. `ep-dawn-pond-b1dz515g` is production's endpoint id, the
value to type for `--expect`:

```powershell
cd D:\Startup\opika
git fetch origin
git switch --detach origin/<pr branch>
pnpm i --frozen-lockfile --prefer-offline
$env:DATABASE_URL = Read-Secret "Production DIRECT connection string"
pnpm --filter @opika/db db:check-hashes
pnpm --filter @opika/db db:migrate --prod --expect ep-dawn-pond-b1dz515g
pnpm --filter @opika/db db:check-hashes
Remove-Item Env:DATABASE_URL
git switch main
```

Expected:

1. **`db:check-hashes`** (read-only): first line `Target: Neon endpoint ep-dawn-pond-b1dz515g (…)`,
   then `match` for every migration already applied and `not run` for the PR's new one; exit 0.
   **Stop if the endpoint differs.**
2. **`db:migrate`**: `WARNING: writing to PRODUCTION (--prod given).`, the same `Target:` line,
   then drizzle-kit applying exactly the new migration; exit 0. Without `--prod` it refuses
   production. Without `--expect`, or with one naming another compute, it refuses before
   anything runs, and prints neither the URL nor an endpoint.
3. **`db:check-hashes` again**: the same `Target:` line, `match` for every migration including
   the new one; exit 0.

Then the PR's own before/after queries, if it lists any, and its Neon smoke on a temporary child
branch, as its status gives them.

**Type the endpoint id, never derive it** (Oleksii, 2026-10-18: "Endpoint typed in, never
derived."). `$ep` in "PowerShell 5.1: reading a secret" is read out of `$env:DATABASE_URL`, so
`--expect $ep` would always agree with the very URL it is there to check, and catch nothing. For
production, `--expect` states the compute you mean to migrate, written independently of the
shell: `ep-dawn-pond-b1dz515g`, the value of `PROD_NEON_ENDPOINT`.

## Removing the demo corpus (once, after the first real shelter)

The seeded demo shelters (ids `51000000-…`) go when the first real shelter is in
(RG-Q11). `db:seed` can't do it: it truncates every table. `demo:remove` deletes
only the demo shelters and what hangs off them (inbox DR-B1): their animals,
swipes and reveals on those animals, shelter history, each
demo shelter's organization with its invitations (a member is a refusal), and users
whose only link was an invitation to a demo shelter (not super_admin). Cities
and every other shelter stay.

```bash
# --expect is the target's Neon endpoint id (ep-…), as for the smoke scripts.
DATABASE_URL=<neon-direct-url> \
  pnpm --filter @opika/db demo:remove --expect ep-… --prod             # dry run
DATABASE_URL=<neon-direct-url> \
  pnpm --filter @opika/db demo:remove --expect ep-… --prod --commit    # deletes
```

`--prod` only when the target is production. The dry run prints the target line,
the demo shelters by id and name, how many other shelters stay (never their
names), and one count per table. It refuses, deleting nothing, when no other
shelter exists (the site would be empty), when a demo shelter still has a member
(remove them with `registry/admins/remove` first), when a demo shelter has a
support session (those are never deleted, RS-Q0; with a non-zero count Oleksii
decides again, DR-Q1), when a non-demo shelter is on
the seed's test-only location key, when a reveal links a demo animal to a
non-demo shelter or a demo shelter to a non-demo animal, or under
`NODE_ENV=production`. The dry run also shows what goes by cascade
(`invitation_created_users`, and the deleted users' sessions and accounts).
`--commit` deletes in one transaction and rolls back if any table's count
differs from its plan; a visitor swiping a demo card during the run can cause
that, and then the same command simply runs again. **Run the dry run again afterwards: every
count must be 0.** Then `location:verify --prod` reports `demo 0`.

### Removing your own test shelters (`--shelter`)

Test shelters you onboarded yourself (real location key, ids outside `51000000-…`)
go the same way, by id (inbox DR-F2, answered in DR-B3). Same moment as the demo
corpus: after the first real shelter is onboarded, before its invite (DR-Q2).

**First remove each test shelter's admins with `registry/admins/remove`**, so the
loss of access is recorded in that shelter's history. A shelter that still has a
member is refused.

```bash
DATABASE_URL=<neon-direct-url> \
  pnpm --filter @opika/db demo:remove --expect ep-… --prod \
    --shelter <id> --shelter <id>                                      # dry run
DATABASE_URL=<neon-direct-url> \
  pnpm --filter @opika/db demo:remove --expect ep-… --prod \
    --shelter <id> --shelter <id> --commit                             # deletes
```

`--shelter` is repeatable; a run with it removes exactly those shelters and never
touches the demo corpus (run the two separately). The dry run prints each target's
id and name (check them before `--commit`), how many other shelters stay (demo
shelters included, never named), the same per-table and cascade counts as above,
and the R2 keys of the target animals' photos (every variant, `animals/…/thumb.webp`
and so on). **Photos stay in R2, unlinked**: the script never deletes R2 objects
(K-Q2); delete those keys by hand in Cloudflare if you want them gone (a dedicated
script is follow-up DR-F3). `--commit` prints the keys again.

Besides every refusal above (member, support session, test-only key, crossing
reveal, `NODE_ENV=production`, `--expect`, `--prod`), it refuses an id that isn't a
UUID, an id given twice, an id in the demo range, an id no shelter has, `--shelter`
with no id after it, `--shelter=<id>` (write it with a space), any argument it doesn't
take (a typo such as `--shelters` is refused, never read as "no `--shelter`", which
would target the demo corpus), and any removal that would leave no shelter at all. **Afterwards run the same dry run again: every count
is 0 and it refuses with "no shelter has id …" for each id**, which is the
confirmation they are gone.

## Retiring the rehearsal shelter (at launch, before the first real invite)

The rehearsal shelter «Притулок «Репетиція»» (`c00c73ac-b27f-535e-b629-ac8cd2c69123`, onboarded 2026-10-17
for the K4/photo rehearsal) is a test shelter on the real location key. It goes in the launch
order below, after the first real shelter is onboarded. Every step is Oleksii's to run.

1. **In the operator screens (R-UI 3): remove every admin, then suspend.** Oleksii, 2026-10-18
   (N8, verbatim): "option A. No new deletion code: remove every admin and suspend in the UI (R-UI
   3), then demo:remove from my machine as before."
   - On `/kabinet/prytulky`, open «Притулок «Репетиція»»; under «Адміністратори», «Прибрати» each
     admin and each invitation, and confirm. Each removal ends that admin's sessions at once and
     is recorded in the shelter's history (DR-B3, answer 1: `demo:remove` refuses while a member
     remains).
   - Then «Призупинити…» with a reason code and a note. Its animals leave the feed and the gallery
     at once.
   - The DevTools `rpc` path (`registry/admins/remove`) still works as a back-up if the screens
     are unavailable.
2. **Check for support sessions.** If you ever entered support mode on this shelter,
   `demo:remove` refuses: support sessions are never deleted (RS-Q0, DR-Q1 (b)). The dry run
   prints the count. With a non-zero count, you decide again with the number in front of you.
3. **Dry run, then commit**, from the main checkout (its root `.env.local` provides
   `PROD_NEON_ENDPOINT`), with the production direct URL in your shell
   (`$env:DATABASE_URL = Read-Secret "Production direct URL"`, with the helper from "PowerShell 5.1:
   reading a secret"):
   ```powershell
   pnpm --filter @opika/db demo:remove --expect <production ep- id> --prod --shelter c00c73ac-b27f-535e-b629-ac8cd2c69123
   pnpm --filter @opika/db demo:remove --expect <production ep- id> --prod --shelter c00c73ac-b27f-535e-b629-ac8cd2c69123 --commit
   ```
   The dry run names the shelter and prints the R2 keys of its animals' photos, including the
   ones uploaded from the kabinet. **Add those keys to the DR-F3 takedown list.** Nothing
   deletes R2 objects; DR-F3's operator-run script, or the Cloudflare dashboard by hand, does
   it later. Run the dry run again afterwards: every count is 0, and it refuses with «no
   shelter has id …», which confirms the shelter is gone.
4. **`KABINET_WRITE_ALLOWLIST`**: PR 6 has merged by then: delete `KABINET_WRITE_ALLOWLIST`,
   then redeploy (environment changes apply only to new deployments). Oleksii, 2026-10-17,
   verbatim: "Runbook step 4: reword to "PR 6 has merged by then: delete KABINET_WRITE_ALLOWLIST,
   then redeploy."" It replaces RH-B6's "before PR 6" branch, which commitment #6 rules out (a
   real shelter's id in the allowlist falsifies it) and which can't arise, since PR 6 merges
   before the first real shelter's invite (F-B6, verbatim: "F6: PR 6 merges BEFORE the first real
   shelter's invite.").
5. **`location:verify --prod`**, expected after the retirement: `match` = the number of real
   shelters (1 at launch), `MISMATCH 0`, no `PRIVACY` line, and `demo` = **2** if the demo corpus
   is still there or **0** once `demo:remove` has run (the next launch step).

## Dress rehearsal (UI only), before any public posting

The launch gate after PR 6 and the operator screens (RU-B4). **UI only:** no console rpc, no
scripts, no `KABINET_WRITE_ALLOWLIST`. The pre-launch gate cookie is the only non-UI piece
(RU-B1). Three people, three browsers: Oleksii as the operator in his own screens, a test shelter
as the client, and a third browser as the adopter. His script, verbatim (RU-B5) except step 2,
which he reworded on 2026-10-17 (RU-Q6, verbatim: "Reword rehearsal step 2 to "resend, or invite
a second address""), because creating a shelter already invites its first admin:

1. He creates «Притулок «Генеральна»» in his screens and verifies it. (The create form requires
   the first admin, so this is where `oleksii.kolotenko+shelter2@gmail.com` is entered and
   invited.)
2. From the shelter page: resend, or invite a second address.
3. The shelter admin signs in on a phone, fills the profile, adds 2–3 animals with photos taken
   on the phone, and publishes.
4. The adopter (a separate browser plus the gate cookie) finds them in the deck and the gallery,
   reveals contacts, and messages the shelter.
5. The shelter marks one adopted and hides one. He approves a donation link, then suspends and
   reinstates the shelter, and checks that the history shows all of it.
6. Both test shelters are retired afterwards, each the same way (N8, option A): in his screens,
   remove every admin and suspend; then `demo:remove --shelter <id>` from his machine, per
   "Retiring the rehearsal shelter" above. The existing rehearsal shelter first, then «Генеральна».
   (This step reworded on 2026-10-18 per his N8 answer; the rest of the script is verbatim RU-B5.)

Until then the current rehearsal shelter (`c00c73ac-…`) stays as the dev test bed, and
`KABINET_WRITE_ALLOWLIST` serves only that interim; it goes away with PR 6.

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
`R2_BUCKET_NAME`. **This token stays in your local shell, never in Vercel**:
this script runs from your own machine. Since K milestone PR 3 the deployed
site writes to R2 too (shelters upload photos from the kabinet, K-Q2), but
through a *different* token: `R2_UPLOAD_ACCESS_KEY_ID` /
`R2_UPLOAD_SECRET_ACCESS_KEY`, scoped to the photo bucket with the narrowest
permission that can write objects, set in Vercel **Production only** together with `R2_ACCOUNT_ID` and
`R2_BUCKET_NAME` (never Preview: uploads are off there, P-Q10). A production
build fails without all four. The deployed app also needs
`NEXT_PUBLIC_R2_PUBLIC_BASE_URL`, the bucket's *public* read URL — set once
in Vercel (Production and Preview), not per onboarding run; see
`docs/h1-decisions.md` for why that one's required at boot and what it
means if it's ever missing there.

Photos are stored under a fresh random key each (`animals/{animalId}/{uuid}`),
so re-running after a failed upload stores the photos again under new keys
rather than overwriting anything; the earlier files stay unreferenced and
harmless (see "Taking a photo down" below if one must go).

⚠ **Not yet run against a real bucket.** The upload path (`packages/db/src/
image-pipeline`) is fully unit-tested against real image fixtures and a
mocked storage client, but the actual authenticated `PutObject` call, CORS,
content-type headers, and whether `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` +
a real key resolves over HTTP are all unverified until this runs once for
real. Treat the first real onboarding run as that verification, not as a
formality — watch the upload log lines closely and check the resulting
photo actually loads on the live detail page before trusting the rest.

## Taking a photo down (P-Q14)

Removing a photo in the kabinet (`shelter.photos.remove`) only takes it off
the animal: its three files stay in the bucket and stay reachable by their URL
(no code path deletes an object, K-Q2). Nothing links to them any more, but
anyone who saved the URL can still open it. When a photo must actually go (a
shelter asks, or it shows something it shouldn't), delete it by hand in
Cloudflare's dashboard.

**Where the key comes from: the bucket, not the database.** A removed photo's
key has already left `animals.photos`, and the animal's history records only
which fields changed (`fields: ["photos"]`, K-Q7), never a key. So list the
animal's prefix in the bucket: R2 → the photo bucket → Objects → prefix
`animals/{animalId}/` (the animal's id is still in the database and the
kabinet). Each photo is one folder, `animals/{animalId}/{uuid}/`, holding
`thumb.webp`, `card.webp` and `detail.webp`. The folders whose key is still in
the animal's `photos` are on the card; any other folder is a removed or orphaned
photo. Open its `card.webp` to confirm it is the one, then delete all three
files and purge those three URLs from the CDN cache.

A takedown script (DR-F3) will replace this; until then it is a manual, logged
step. The same applies to a file logged as `{event:"photo_orphaned",
storageKey}` (an upload stored but never attached): harmless, delete it the
same way if it matters; that log line is the one place a key outside the
bucket listing is recorded.

## One-off check: R2 refuses to overwrite (P-Q11)

Every put carries `IfNoneMatch: "*"`, so R2 should refuse (HTTP 412) to write
to a key that already holds an object. That is asserted in code, not yet
observed against R2.

**When: before uploads open to any shelter**, the allowlisted test shelter
included (`KABINET_WRITE_ALLOWLIST`, K-Q4/K-Q17). Until it has passed, no
shelter's kabinet may store a photo.

**Who and with what:** the operator, by hand, from his own shell, with the
**onboarding token** (`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`, the one in
his local environment), never Vercel's upload token. A kabinet upload cannot
run this check: every upload gets a fresh random key, so it never puts to a key
that already exists (and production refuses shelter writes anyway). The
behaviour under test belongs to the bucket, not the token, so the onboarding
token answers it.

The two puts write one object to the production bucket: Oleksii's OK first.

1. Pick one fixed key for the whole check: `_probe/<uuid>`, with a fresh UUID
   (e.g. `node -e "console.log(crypto.randomUUID())"`), so it cannot collide
   with a photo (`animals/…`) or with an earlier probe.
2. Put a small file there with the precondition. The aws CLI reads its own
   variable names and needs a region, so pass the onboarding token through them:
   `AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
   AWS_DEFAULT_REGION=auto aws s3api put-object --endpoint-url
   https://<account>.r2.cloudflarestorage.com --bucket <bucket> --key _probe/<uuid>
   --body probe.txt --if-none-match '*'`. Expected: success, with an ETag.
3. Repeat the exact same put, same key. Expected: refused, `412 Precondition
   Failed`, and the object's ETag and Last-Modified unchanged
   (`aws s3api head-object … --key _probe/<uuid>`).
4. Record the result in the PR or the inbox.
5. No cleanup: the few bytes under `_probe/` stay. They harm nothing, and
   leaving them avoids any R2 deletion ("no R2 deletes", working mode WM-B1).

If the second put succeeds, R2 ignored the header: report it, and do not open
uploads to any shelter. No permanent bucket lock replaces this (Oleksii: it
would also block the DR-F3 takedown script; if one is ever added, a short
retention only).

## A shelter says the invitation never arrived

All kabinet email goes through Resend (EM-B10). While Resend is the provider, the registry's
blocked-addresses view answers "not checked" (EM-T26; a scan of Resend's suppression list is
follow-up EM-F1), so it can't tell you whether an address is blocked. Check, in this order:

1. **Logs, a TLS bounce first.** Since 2026-10-19 Resend sends with TLS **Enforced**: a
   receiving server that can't take TLS gets a bounce, never a plaintext copy, because auth emails
   carry bearer links. In Resend → **Logs**, filter on the address. Look first for a bounce whose
   reason is TLS: if it is one, the shelter's mail host is refusing TLS, so ask them for another
   address. (The builder's recommendation, not his rule: keep TLS Enforced rather than switching
   back to Opportunistic for one host.) Then check whether the invite was sent, delivered, or
   bounced for another reason. Oleksii, 2026-10-19, verbatim: "I switched Resend TLS from Opportunistic to Enforced (auth emails carry bearer links). Record it in the stack notes; runbook "email didn't arrive" checklist: check Resend logs for a TLS bounce first."
2. **Suppressions:** is the address on the suppression list, and why? Only then resend the invite
from the registry, and tell the shelter personally (IN-E13). Oleksii's condition on EM-T26,
2026-10-15.

## DMARC: raising the policy (launch gate, Oleksii's step)

Before the first real shelter (`docs/build-plan.md` Part 5), he reviews the DMARC aggregate
reports that arrive at `dmarc@`, then raises the apex policy in Cloudflare DNS. Oleksii,
2026-10-19, verbatim: "review DMARC aggregate reports at dmarc@, then raise _dmarc.opika.org.ua
from p=none to p=quarantine (later p=reject). My step in Cloudflare DNS; note the current record
and the change in the runbook." (The earlier plan, IN-E3, went straight to `p=reject`. This one
goes through `p=quarantine` first.)

- **The current records** (public DNS, read 2026-10-19). There are two, and they cover
  different senders:
  - `_dmarc.opika.org.ua` (the apex: anything that sends as `@opika.org.ua`, e.g. `hello@`):
    `v=DMARC1; p=none; rua=mailto:dmarc@opika.org.ua`
  - `_dmarc.mail.opika.org.ua` (the sending subdomain, the auth emails' From address, Resend):
    `v=DMARC1; p=none; rua=mailto:dmarc@opika.org.ua`

  **The subdomain's own record decides the auth emails' policy, not the apex's**, so the step
  raises both together. Oleksii, 2026-10-19, verbatim (EA-Q1): "option (b). The launch-gate step
  raises both _dmarc.opika.org.ua and _dmarc.mail.opika.org.ua together. They go to p=quarantine
  first, then later to p=reject, and keep the same rua."
- **Before changing anything:** the reports at `dmarc@` show nothing legitimate failing:
  everything sending as `@opika.org.ua` (e.g. `hello@`), and Resend for `mail.opika.org.ua`.
- **The step, in this order** (his order, verbatim in substance: "Write the order into the step"):
  1. **Remove the Brevo DNS records** (the `brevo2` DKIM, and any Brevo SPF include or
     verification TXT, e.g. `brevo1._domainkey.mail`, `brevo2._domainkey.mail` and the `mail`
     TXT `brevo-code`), before raising or in the same step.
  2. **Raise both records** to `p=quarantine`, keeping the same
     `rua=mailto:dmarc@opika.org.ua`:
     - `_dmarc.opika.org.ua`: `v=DMARC1; p=quarantine; rua=mailto:dmarc@opika.org.ua`
     - `_dmarc.mail.opika.org.ua`: `v=DMARC1; p=quarantine; rua=mailto:dmarc@opika.org.ua`
  3. **Run a delivery test** of a sign-in email and an invite (`email:delivery-test`) and confirm
     both arrive in the inbox.
  4. **Check the next DMARC reports** for anything failing **before** going to `p=reject` (both
     records, the same `rua`).
- **All DNS changes are his** ("I make all DNS changes myself").

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
old rows become unusable at once and are deleted by the auth clean-up (every
6 hours) once their 7-day expiry passes (inbox KH-Q9, KH-Q10, KH-Q12).

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
