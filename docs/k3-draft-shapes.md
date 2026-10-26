# K3 draft shapes (F-B1): a separate draft type, for review at PR 4's start

Contract-first (CLAUDE.md: "propose the type/union shapes for review before writing the
implementing code or tests"). Nothing here is built. Line numbers are as of `a92e8a1` (PR 3
merged).

**His words this answers** (verbatim; sources in brackets):
- F-B1: "F1: (a), a separate draft type (union on listing state); send the shapes at PR 4's
  start." (`docs/decisions-inbox/docs-k-future-decisions.md`)
- K-Q5: "K-Q5: yes, name + species to create; everything else and ≥1 photo to publish."
  (K-B1, `docs/decisions-inbox/feat-k-groundwork.md`)
- RH-B3: "Rule for PR 4: the form's version compare-and-set save never writes the photos column.
  Add one test: a form save from a stale read after a photo change keeps the new photo list."
  (`docs/decisions-inbox/docs-rehearsal-retire.md`, branch `docs/rehearsal-retire`)
- RH-B7: "RH-Q1: answered now, don't wait for K-Q14. Yes, a photo add, reorder or remove moves
  «Оновлено» (lastUpdatedAt), as it already does on prod. Animals.version stays unchanged (P-Q3).
  K-Q14 can reference this answer." (same file). **Flagged back there, mechanism unconfirmed:**
  «Оновлено» counts from `last_confirmed_at`, not `last_updated_at` (§7).

**Tiers** (the 2026-10-17 working mode):
- §2's migration is a production write: **Tier 1**.
- §7 (RH-B7) changes what a public date means (commitment #7) and SQL: **Tier 1**.
- The rest is ordinary review.

---

## 0. The proposal in brief

- **The domain type.** `Animal` becomes `DraftAnimal | ListedAnimal`, split on `listing.kind`.
  - A draft may lack `size`, `age` and `description` (null).
  - Every other listing state requires all three.
  - `name` and `species` are required always.
  - `sex` defaults to `unknown` («Не записано») at creation, the way the medical facts already
    default to unknown, so it is never missing (D2).
  - A withdrawn animal restored to a draft keeps every field.
- **Storage.** Four columns become nullable: `size`, `age`, `age_anchor_at`, `description_uk`.
  Three CHECK constraints make a non-draft row with a missing fact unrepresentable in the
  database too. This is one production migration (D1).
- **Public views** pick from `ListedAnimalSchema` and are built only from a `DiscoverableAnimal`.
  A draft can't reach them through the query, the types, the output validation or the database.
- **`publishReadinessOf`** turns a draft into the facts a listing needs, or the list of gaps.
  This makes "publish an incomplete draft" a compile error rather than a forgotten check.
- **Inputs.**
  - `createDraft` takes exactly `{ name, species }`.
  - The update patch may clear a draft's description (null).
  - Clearing it on a listed animal is a new typed refusal.
- **RH-B3** holds by construction; one test pins it.
- **RH-B7.**
  - Proposed shape: a photo change on a visible card also sets the confirmation date, under a
    compare-and-set on the listing.
  - That compare-and-set also closes a race found in PR 3 (§7.5).

---

## 1. Domain types (`packages/domain`)

### 1.1 `listing.ts`: name the two halves of the listing union

The `AnimalListingStateSchema` shape is unchanged (listing.ts:64-85). Its variants get names so
the animal union can refer to them:

```ts
export const DraftListingSchema = z.object({ kind: z.literal("draft") });
const PublishedListingSchema = z.object({ kind: z.literal("published"), publishedAt, confirmedAt, undoable });
const ReservedListingSchema  = z.object({ kind: z.literal("reserved"), since, publishedAt, confirmedAt, undoable });
const AdoptedListingSchema   = z.object({ kind: z.literal("adopted"), adoptedAt });
const WithdrawnListingSchema = z.object({ kind: z.literal("withdrawn"), withdrawnAt, reason });

/** Every state a listing reaches only through `publish`: what makes an animal "listed". */
export const NonDraftListingSchema = z.discriminatedUnion("kind", [
  PublishedListingSchema, ReservedListingSchema, AdoptedListingSchema, WithdrawnListingSchema,
]);
export const AnimalListingStateSchema = z.discriminatedUnion("kind", [
  DraftListingSchema, PublishedListingSchema, ReservedListingSchema, AdoptedListingSchema, WithdrawnListingSchema,
]); // same five variants as today

export type DiscoverableListing = Extract<AnimalListingState, { kind: "published" | "reserved" }>;
```

### 1.2 `animal.ts`: the union

```ts
/** What every animal has from the moment it exists (K-Q5: a name and a species create it). */
const animalCoreShape = {
  id: AnimalIdSchema,
  shelterId: ShelterIdSchema,
  name: z.string().min(1),
  species: AnimalSpeciesSchema,
  /** Defaults to "unknown" at creation, as the medical facts default to unknown (D2). */
  sex: AnimalSexSchema,
  photos: z.array(AnimalPhotoSchema).max(MAX_ANIMAL_PHOTOS).readonly(),
  vaccination: VaccinationStatusSchema,
  spayNeuter: SpayNeuterStatusSchema,
  documentReadiness: DocumentReadinessSchema,
  publicLocation: PublicLocationSchema.nullable(),
  createdAt: z.date(),
  lastUpdatedAt: z.date(),
  version: z.int().nonnegative(),
};

/**
 * What a listing must carry before anyone can see it (K-Q5: "everything else ... to publish").
 * Medical facts are not here: «Не записано» is a complete answer (standing product rule), so
 * the unknown default a draft starts with is publishable as it stands.
 */
export const ListingFactsSchema = z.object({
  size: SizeBucketSchema,
  age: AgeEstimateSchema,
  description: LocalizedTextSchema,
});
export type ListingFacts = z.infer<typeof ListingFactsSchema>;

/** Nullable, not optional: the absence survives a JSON round trip (LocalizedText's own rule). */
export const DraftAnimalSchema = z.object({
  ...animalCoreShape,
  size: SizeBucketSchema.nullable(),
  age: AgeEstimateSchema.nullable(),
  description: LocalizedTextSchema.nullable(),
  listing: DraftListingSchema,
});

/** Published, reserved, adopted or withdrawn: every one was published once, so it is complete. */
export const ListedAnimalSchema = z.object({
  ...animalCoreShape,
  ...ListingFactsSchema.shape,
  listing: NonDraftListingSchema,
});

export const AnimalSchema = z.union([DraftAnimalSchema, ListedAnimalSchema]);
export type DraftAnimal = z.infer<typeof DraftAnimalSchema>;
export type ListedAnimal = z.infer<typeof ListedAnimalSchema>;
export type Animal = DraftAnimal | ListedAnimal;
/** What an adopter can be shown: listed, and in a visible state. */
export type DiscoverableAnimal = ListedAnimal & { listing: DiscoverableListing };

export const isDraftAnimal = (animal: Animal): animal is DraftAnimal => animal.listing.kind === "draft";
export const isListedAnimal = (animal: Animal): animal is ListedAnimal => animal.listing.kind !== "draft";
export const isDiscoverableAnimal = (animal: Animal): animal is DiscoverableAnimal =>
  isDiscoverable(animal.listing);
```

**Why guards and not `switch (animal.listing.kind)`.** TypeScript narrows a union only by a
discriminant on the object itself. `animal.listing.kind === "draft"` narrows `animal.listing` and
leaves `animal` a union (microsoft/TypeScript#18758). So the narrowing is three named guards.

**Rejected alternative: a top-level `stage: "draft" | "listed"` field.** It would duplicate
`listing.kind` as a second stored fact that can disagree with the first. Zod can't use a nested
key as a `discriminatedUnion` discriminator either, so the schema is `z.union`. Parsing tries the
draft option, then the listed one, and its errors name both.

**Restored to draft.** `restore_to_draft` turns a `ListedAnimal` into a `DraftAnimal` whose
`size`/`age`/`description` are still set. A non-null value is a valid value of a nullable field,
so nothing is dropped. Publishing it again is "ready" as soon as it has a photo.

---

## 2. Storage

### 2.1 Today

Every one of these columns is NOT NULL (`packages/db/src/schema/animals.ts`):

| Column | Line | Needed nullable? |
|---|---|---|
| `sex` | :35-37 | no, if D2 is taken as recommended (default `unknown`); yes otherwise |
| `size` | :38-40 | yes |
| `age` (jsonb) | :42 | yes |
| `age_anchor_at` | :48 | yes (derived from `age`; null exactly when `age` is null) |
| `description_uk` | :96 | yes (`description_en_text`/`_provenance` are already nullable, :97-100) |
| `name`, `species` | :31, :32-34 | no (K-Q5) |

So K-Q5 can't be stored without a schema change, or without values standing in for "not
answered yet".

### 2.2 Options

| | What | Cost | Verdict |
|---|---|---|---|
| **A** | Four columns nullable, plus CHECK constraints tying "not null" to `listing_kind <> 'draft'` | One production migration. Rollback is clean only until the first incomplete draft exists (§2.5) | **Recommended.** Same pattern as `adopters_identity_check` (`schema/adopters.ts:29`, migration 0000): the database refuses the row the type refuses |
| B | Keep NOT NULL; drafts store sentinel values (`size 'medium'`, a made-up age, `''` description), plus a new column recording which are real | Still a migration (the marker column). Every raw-SQL reader, count or future report sees invented sizes and ages | Rejected. It records fabricated facts, which `age.ts` (comment above `AgeEstimateSchema`) calls worse data than an honest coarse one. It also makes "is this answered?" depend on a second column every query must remember |
| C | Drafts in their own table, moved into `animals` on publish | New table, a move on publish and back on restore_to_draft, ids and history to carry across, and swipe and reveal FKs to keep pointing at the right row | Rejected: far more moving parts for the same guarantee |
| D | Keep NOT NULL and require every field at creation | None | Not available: K-Q5 says name + species |

### 2.3 Migration (option A): `packages/db/drizzle/0012_<generated>.sql`

The schema edit drops `.notNull()` on the four columns and adds three `check(...)` entries to the
table callback (animals.ts:141). `pnpm drizzle-kit generate` then writes the file below, with the
leading comment added by hand as in 0010/0011.

```sql
-- K milestone PR 4 (K3), F-B1 / K-Q5 (Oleksii: "name + species to create; everything else
-- and ≥1 photo to publish"). A draft may lack its size, age and description; a listing that
-- was ever published may not. The three CHECKs make the database refuse what the domain union
-- refuses. Every existing row already has all four values (they were NOT NULL), so there is
-- no backfill and each CHECK validates as it is added.
ALTER TABLE "animals" ALTER COLUMN "size" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "animals" ALTER COLUMN "age" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "animals" ALTER COLUMN "age_anchor_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "animals" ALTER COLUMN "description_uk" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_listing_facts_check" CHECK ("animals"."listing_kind" = 'draft' OR ("animals"."size" IS NOT NULL AND "animals"."age" IS NOT NULL AND "animals"."description_uk" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_age_anchor_check" CHECK (("animals"."age" IS NULL) = ("animals"."age_anchor_at" IS NULL));--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_description_en_check" CHECK ("animals"."description_uk" IS NOT NULL OR ("animals"."description_en_text" IS NULL AND "animals"."description_en_provenance" IS NULL));
```

If D2 makes sex nullable, add `ALTER TABLE "animals" ALTER COLUMN "sex" DROP NOT NULL;` and
`AND "animals"."sex" IS NOT NULL` inside the first CHECK.

**Locks.**
- `DROP NOT NULL` is a catalogue change.
- `ADD CONSTRAINT … CHECK` scans the table once under an exclusive lock. At a few hundred rows
  that takes milliseconds, so `NOT VALID` + `VALIDATE CONSTRAINT` isn't worth the extra step.
- Drizzle's migrator applies the file in one transaction.

### 2.4 Backfill

None. All four columns were NOT NULL, so every row holds values and each CHECK passes as it is
added. A wrong assumption fails the migration rather than leaving bad rows, because the CHECKs
validate on add.

Queries for his run (read-only), before and after the migration:

```sql
SELECT listing_kind, count(*) FROM animals GROUP BY 1 ORDER BY 1;          -- same before and after
SELECT column_name, is_nullable FROM information_schema.columns
 WHERE table_name = 'animals' AND column_name IN ('sex','size','age','age_anchor_at','description_uk');
                                                                            -- after: YES for the four, NO for sex
SELECT conname FROM pg_constraint WHERE conrelid = 'animals'::regclass AND contype = 'c' ORDER BY 1;
                                                                            -- after: the three names
```

### 2.5 Rollback

```sql
-- Possible only while this returns 0:
SELECT count(*) FROM "animals"
 WHERE "size" IS NULL OR "age" IS NULL OR "age_anchor_at" IS NULL OR "description_uk" IS NULL;

ALTER TABLE "animals" DROP CONSTRAINT "animals_description_en_check";
ALTER TABLE "animals" DROP CONSTRAINT "animals_age_anchor_check";
ALTER TABLE "animals" DROP CONSTRAINT "animals_listing_facts_check";
ALTER TABLE "animals" ALTER COLUMN "description_uk" SET NOT NULL;
ALTER TABLE "animals" ALTER COLUMN "age_anchor_at" SET NOT NULL;
ALTER TABLE "animals" ALTER COLUMN "age" SET NOT NULL;
ALTER TABLE "animals" ALTER COLUMN "size" SET NOT NULL;
-- and remove 0012's row from drizzle.__drizzle_migrations, or a later re-apply is skipped.
```

**Once a single name-and-species draft exists, the rollback is not clean.** `SET NOT NULL`
fails on that row. Getting past it means one of two things:
- deleting those drafts: a data deletion, so Tier 1; their stored photos stay in R2, since
  nothing deletes objects;
- writing invented values into them: what option B was rejected for.

So after the first incomplete draft, the remedy for a defect is to roll forward.

**Reverting only the code, with the schema kept:**
- Safe for every public surface, because drafts are never served.
- The old code would read a null-holding draft into a type that says non-null. The kabinet
  view's output validation would then refuse it: the allowlisted shelter's animal list and that
  draft's page answer 500 until the draft is completed or the code returns.

### 2.6 Deploy order

**Migrate first, then merge PR 4.**
- The old code works on the new schema. It always writes all four fields, and every row it
  publishes is complete, so the CHECKs never fire for it.
- The new code on the old schema would fail `createDraft` on NOT NULL.
- Vercel deploys on merge, so his production run comes before the merge.

### 2.7 Real-Neon verification (required: the change touches SQL and the driver path)

The migration is not rehearsed on a branch: production holds only test data until launch and is
the test environment (Oleksii, 2026-10-15: "No more Neon rehearsal branches or test buckets for
this"). The smoke run is different. It writes rows of its own, and its script refuses production
by design, so it runs on a temporary child branch of migrated production, deleted afterwards. His
round 2 answer 1, verbatim: "Smoke runs: yes, on a temporary child branch of migrated production,
guard untouched. Delete the branch afterwards. "No rehearsal branches" meant practising
migrations, not smoke runs." The guards stay as they are. Steps 1–5 are his, before PR 4 merges;
the migration (with the §2.4 queries) and the smoke are both merge gates, as P-B5's were for
PR 3. The exact command list, with every connection string typed into `Read-Host`, is in the PR's
status.

1. **Prove the target**, read-only, against production `main`:
   `pnpm --filter @opika/db db:check-hashes`. Its first line names the target
   (`Target: Neon endpoint <prod ep> (…)`), then `match` for 0000-0011 and
   `not run 0012_glorious_warpath`. Stop if the endpoint differs. Run the §2.4 queries.
2. **Migrate production**: `pnpm --filter @opika/db db:migrate --prod`, against the same target.
   `db:migrate` takes no `--expect`: `migrate.ts` passes every argument but `--prod` through to
   `drizzle-kit migrate`, which refuses an unknown option and migrates nothing. Step 1's target
   line is the endpoint check (his round 2b answer 2, verbatim: "N1: accepted. The gate list is
   db:check-hashes (read-only, prints the target) → db:migrate --prod. Follow-up, not now: a
   real --expect on db:migrate (Tier 1, its own small PR later)."; follow-up AW-F1). Then
   `db:check-hashes` again (13/13 `match`) and the §2.4 queries again.
   *Since #124 (AW-F1), `db:migrate` takes `--expect`, and every later gate uses the block in
   `docs/onboarding-a-shelter.md`, "Migrating production". This step is the record of how
   0012 was applied, before that.*
3. **Branch**: a temporary child branch of migrated production `main` (from its head, with a
   read-write compute). Note the child's endpoint id, `<child ep>`.
4. **Smoke on the child**, from the PR 4 branch, with `PROD_NEON_ENDPOINT` set:
   `pnpm --filter @opika/db db:neon-smoke --expect <child ep>`. `smokeTarget` refuses the
   production endpoint outright and any endpoint other than `--expect`. New steps after PR 3's
   25 and R-UI 1's 26 (the S1 row's admin counts and donationPending, which reaches the default
   branch first; PR 4 was rebased onto the R-UI stack, so its steps moved from 26-30 to 27-31):
   - **27.** A name-and-species draft goes in through the insert CTE with null size, age,
     anchor and description. It reads back through neon-http with those nulls, and the mapper
     gives a `DraftAnimal`.
   - **28.** The listing-facts CHECK refuses publishing that row. `writeListingIf` throws, and
     SQLSTATE `23514` is found in the error's `cause` chain on neon-http. This is the
     `isForeignKeyViolation` pattern (`kabinet-animal-repo.ts:52-67`), extended.
   - **29.** A save that writes a null (clearing a description) applies only while
     `listing_kind = 'draft'`. Against a published row it writes nothing.
   - **30.** Publishing compare-and-sets on listing, `version` and a non-empty photo list. A
     stale version writes nothing (§7.5).
   - **31.** RH-B7 (D4, option (i)): `writePhotosIf` on a published row moves `photos`,
     `listing.confirmedAt` and `last_confirmed_at` together under the photo and listing
     compare-and-set. A stale listing writes nothing. On a draft, `last_confirmed_at` stays null.

   Expected: **31 passed, 0 failed** (30 before the rebase onto the R-UI stack added R-UI 1's
   step 26 beneath PR 4's five).
5. **Delete the child branch.** Its smoke rows go with it.

---

## 3. Public views stay unaffected

Four independent layers, each enough on its own:

1. **The query.**
   - The feed and the gallery select `listing_kind IN ('published','reserved')`
     (`feed-predicate.ts:45`).
   - `animals.byId`, `swipes.record` and `animals.reveal` refuse any non-discoverable animal
     (`api/handlers/animals.ts:32`, `swipes.ts:53`, `reveal.ts:62`).
   - Unchanged.
2. **The types.**
   - `FeedCardViewSchema` and `AnimalDetailViewSchema` pick from `ListedAnimalSchema` instead of
     `AnimalSchema` (`contracts/src/views/animal.ts:51, 67`), so their `size` and `description`
     stay required.
   - The feed and gallery repos return `readonly DiscoverableAnimal[]`, through a mapper that
     throws if the predicate ever handed it anything else.
   - `animals.byId` narrows with `isDiscoverableAnimal` instead of `isDiscoverable(listing)`.
   - From there a `DraftAnimal` cannot compile into a public view: `ageBucketOf(animal.age, now)`
     refuses `AgeEstimate | null`, and `size: animal.size` refuses null.
3. **The output validation.** oRPC validates every public response against those schemas. A null
   fails the response (500) and leaks nothing: fail closed.
4. **The database.** `animals_listing_facts_check` makes a published or reserved row with a
   missing fact impossible to write.

Tests (§11): an incomplete draft is NOT_FOUND on `byId`, absent from the feed and the gallery,
refused by swipes and reveals. The two public output schemas refuse a null `size`, `age` or
`description`.

---

## 4. Publish readiness and `publishGaps`

`listing-transition.ts:236-251` today:
- `PublishGapSchema = z.object({ kind: z.literal("photo") })`;
- `publishGaps(Pick<Animal,"photos">)`.

Proposed:

```ts
/** In form order, so a list of gaps reads in the order the shelter fills them in. */
export const PUBLISH_GAP_KINDS = ["size", "age", "description", "photo"] as const; // + "sex" first if D2 = null
export const PublishGapSchema = z.object({ kind: z.enum(PUBLISH_GAP_KINDS) });
export type PublishGap = z.infer<typeof PublishGapSchema>;

export type PublishReadiness =
  | { kind: "ready"; facts: ListingFacts }
  | { kind: "gaps"; gaps: readonly [PublishGap, ...PublishGap[]] };

/** The only way a draft's facts become a listing's: no publish path can skip a field. */
export const publishReadinessOf = (draft: DraftAnimal): PublishReadiness => { /* each null field, then photos.length === 0 */ };

/**
 * K2's row and K3's footer. A listed animal is complete by type, so it can only lack a photo.
 * That's today's answer for a photo-less listed row, kept.
 */
export const publishGaps = (animal: Animal): readonly PublishGap[] =>
  isDraftAnimal(animal)
    ? (r => r.kind === "gaps" ? r.gaps : [])(publishReadinessOf(animal))
    : animal.photos.length === 0 ? [{ kind: "photo" }] : [];
```

**The publish handler.** Today: `apps/web/src/kabinet/handlers/animals.ts:418-426`, then
`moved(…)` at :226-254, which spreads a new listing onto the animal. Under the union, spreading a
published listing onto a `DraftAnimal` matches neither variant, so it stops compiling. That is
the point. Publish becomes:
1. `isDraftAnimal` (otherwise `transitionListing` answers `illegal`, as today);
2. `publishReadinessOf(draft)`, where `gaps` answers `PUBLISH_REQUIREMENTS_UNMET` with every gap;
3. `{ ...draft, ...facts, listing: next }`, which TypeScript checks as a `ListedAnimal`.

`PUBLISH_REQUIREMENTS_UNMET`'s `data.gaps` widens with the enum (`contracts/src/errors.ts:140-144`)
and stays backward-compatible: `photo` is still a member.

---

## 5. Contract changes (`packages/contracts/src/kabinet/procedures.ts`)

### 5.1 `createDraft` (:345-356): name + species only

```ts
createDraft: animalWrite
  .input(z.strictObject({ name: AnimalNameInputSchema, species: AnimalSpeciesSchema }))
  .errors(shelterScopedErrors),
```

The handler (`animals.ts:302-340`) builds a `DraftAnimal`:
- `sex: "unknown"`;
- `size`, `age` and `description` null;
- medical facts `UNKNOWN_ATTESTATION(now)`, `documentReadiness` unknown, `photos: []`;
- `listing: { kind: "draft" }`.

`animal_created` is unchanged. Strict input: a `sex` sent here is BAD_REQUEST. The form creates
on the first save that has a name and a species, and everything after goes through `update`.

### 5.2 The update patch (:287-299)

```ts
export const AnimalPatchSchema = z
  .strictObject({
    name: AnimalNameInputSchema,
    species: AnimalSpeciesSchema,
    sex: AnimalSexSchema,
    size: SizeBucketSchema,
    age: AgeEstimateInputSchema,                          // see 5.4
    /** null clears it: a draft only (a listed animal answers LISTING_FACT_REQUIRED). */
    description: AnimalDescriptionInputSchema.nullable(),
    vaccination: MedicalDeclarationInputSchema,
    spayNeuter: MedicalDeclarationInputSchema,
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: "Empty patch" });
```

- Only the description can be cleared. A segmented control (size, age bucket) has no
  "unselected" once chosen, so `size: null` and `age: null` stay BAD_REQUEST.
- On a draft, `description: null` stores null.
- On a listed animal it is refused. The handler's spread `{ ...animal, description: null }` on a
  `ListedAnimal` doesn't type-check, which forces the refusal branch.
- New error on `update`:

```ts
LISTING_FACT_REQUIRED: {
  status: 422,
  message: "A listing that was published must keep this field.",
  data: z.object({ field: z.enum(["size", "age", "description"]) }),
},
```

**The race.** A draft's clearing save can race a publish. The update handler read a draft, but
the row is published by the time it writes. So `writeEditIf`
(`kabinet-animal-repo.ts:150-177`) adds `AND listing_kind = 'draft'` to its WHERE **only when the
row it writes carries a null**:
- the lost race comes back as `CONFLICT` (re-read: it's listed now), never as a 500;
- `animals_listing_facts_check` stays as the backstop;
- a save that writes no null keeps today's condition (`version` only), so an open form and a
  listing move still never conflict (HS-T8).

**English description.** When the Ukrainian text changes, the stored English is cleared. This is
his K4-B1 answer 13 for the shelter sentence ("Clear `en` when `uk` changes; a stale translation
would be a false claim"), applied by analogy (decision taken, T5).

### 5.3 What `update` writes

`writeEditIf` writes these columns and nothing else: name, species, sex, size, age,
age_anchor_at, description_*, vaccination, spay_neuter, last_updated_at, `version + 1`
(`kabinet-animal-repo.ts:159-173`). **Never `photos`** (RH-B3, §6), and **never `listing` or
`last_confirmed_at`** (commitment #7).

### 5.4 Age input and «Станом на» (D3)

**Today.**
- The patch takes `AgeEstimateSchema`, whose `declared_bucket` carries `declaredAt`.
- `stampedAge` (`animals.ts:140-141`) overwrites that with the server's now.
- K3's «Станом на» date ("defaults to today; hint: usually the intake day", KAB:189) is
  therefore discarded today.

**Proposed** (if D3 = keep the chosen date):

```ts
/** A calendar date in Kyiv, no time: what a date input yields. */
const CalendarDateSchema = z.iso.date();
export const AgeEstimateInputSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("birth_date"), date: CalendarDateSchema }),          // precision "day"
  z.strictObject({ kind: z.literal("declared_bucket"), bucket: AgeBucketSchema, asOf: CalendarDateSchema }),
]);
```

- The server refuses a date after today in Kyiv, or earlier than 30 years ago (the floor is a
  decision taken, T11), and stores `declaredAt` as that date.
- `editedAge`'s "same bucket keeps its anchor" rule (`animals.ts:150-164`) then compares the
  pair: same bucket **and** same `asOf`.
- A draft's first age has no current value to compare with (`current` is null).
- If D3 = drop the field instead: no date input, the bucket means "as of today", `stampedAge`
  stays, and the copy loses `age.asOfLabel`/`asOfHint`.

---

## 6. RH-B3: the form save never writes the photos column

**True today by construction.** `writeEditIf`'s `.set({...})` names no `photos`
(`kabinet-animal-repo.ts:159-173`). Photo writes leave `version` alone (P-Q3, asserted in
`apps/web/src/kabinet/photos.test.ts:213, 540`). So a stale form save after a photo change is
neither a conflict nor a photo overwrite. PR 4 adds the one test he asked for, at handler level
on the local database:

> read the animal (version v, photos [A]) → `photos.add` B (photos [A, B], version still v) →
> `animals.update` with `expectedVersion: v` and a description change → succeeds, and the stored
> photos are [A, B] in that order.

The mutation that proves it: add `photos: row.photos` to `writeEditIf`'s `.set`, and the test
goes red naming [A] against [A, B]. With RH-B7 the same test also asserts that the confirmation
date the photo write set survives the form save. The form save writes no listing, so a mutation
writing `listing: row.listing` in `writeEditIf` turns it red too.

---

## 7. RH-B7: a photo change moves «Оновлено» (proposed; mechanism to confirm)

### 7.1 What is true on production today

A photo write moves `last_updated_at` (edit time) and nothing else (`writePhotosIf`,
`kabinet-animal-repo.ts:237-256`; P-T6). «Оновлено {days}» is computed from the listing's
`confirmedAt` (column `last_confirmed_at`), set only by publish and «Ще шукає». So a new photo
does **not** move «Оновлено» today. His words assume it does.

### 7.2 Proposed mechanism: a photo change on a visible card sets the confirmation date

**Option (i), recommended.**
- A photo add, reorder or remove on a published or reserved animal also sets
  `listing.confirmedAt = now` (and so `last_confirmed_at`).
- On a draft, adopted or withdrawn animal it changes nothing about confirmation; there is none.
- «Оновлено» keeps meaning "the last time the shelter touched what the card claims about the
  animal being there", and a typo fix still doesn't move it.

**Option (ii), not recommended.** Switch «Оновлено» to `last_updated_at`. Then every text edit
moves it as well, which is exactly what commitment #7 and decision #10's 2026-10-07 revision
exist to prevent.

Domain (`listing-transition.ts`, beside `transitionListing`, so listing states are still built
in one file):

```ts
/**
 * RH-B7 (Oleksii): adding, reordering or removing a photo on a card people can see counts as the
 * shelter confirming it, so «Оновлено» moves. Not a listing event: no state change, no listing
 * history line (S1: confirmations aren't recorded), nothing to undo. A pending «Ще шукає» undo
 * expires, as after any newer write. Never moves the date backwards. Draft, adopted and withdrawn
 * listings carry no confirmation and come back unchanged.
 */
export const listingAfterPhotoChange = (listing: AnimalListingState, at: Date): AnimalListingState => {
  switch (listing.kind) {
    case "published":
    case "reserved":
      return {
        ...listing,
        confirmedAt: at > listing.confirmedAt ? at : listing.confirmedAt,
        undoable: null,
      };
    case "draft":
    case "adopted":
    case "withdrawn":
      return listing;
    /* exhaustive */
  }
};
```

Repository (`writePhotosIf`, `kabinet-animal-repo.ts:237-256`):

```ts
async writePhotosIf(
  animalId: AnimalId,
  photos: { next: readonly AnimalPhoto[]; expected: readonly AnimalPhoto[] },
  listing: { next: AnimalListingState; expected: AnimalListingState },
  lastUpdatedAt: Date,
  history: AnimalHistoryRow<"animal_edited">,
): Promise<ConditionalWrite>
// SET photos = next, last_updated_at, listing = listing.next, last_confirmed_at = confirmationAnchorOf(listing.next)
// WHERE id AND photos = expected::jsonb AND listing = listing.expected::jsonb
```

- `listing_kind`, `wait_anchor_at` and `first_published_at` are untouched: kind and
  `publishedAt` don't change.
- `version` is untouched (P-Q3, "Animals.version stays unchanged").
- Handlers (`photos.ts:121-133` add, `:148-173` `rewritePhotos`): pass
  `listingAfterPhotoChange(read.listing, now)` and the read listing.
- `withPhotos` (`:50-54`) returns the new listing too, so the response shows the new freshness.
- A lost race already re-reads (add: 5 attempts; `rewritePhotos`: retries while the photo list
  still matches).
- So a «Ще шукає» landing in between costs one retry, never a CONFLICT for the shelter.

### 7.3 Commitment #7: what changes in `docs/standing-constraints.md:358` (his to approve)

- **"Edits never move it."** → "Form edits never move it. A photo add, reorder or removal on a
  card people can see does (RH-B7, Oleksii, 2026-10-17); on a draft, adopted or withdrawn card it
  doesn't, since those carry no date."
- **"Falsified by: any write path that moves `confirmedAt` without a shelter's explicit
  confirmation (an edit bumping it…)".**
  - "An edit" narrows to "a form edit".
  - Photo changes are now one of the shelter's own confirmations, by his decision.
  - New falsifiers: a photo write by anyone but the shelter (none exists: the onboarding script
    creates animals with their photos at publish, P-T9); a bulk photo operation across animals;
    B1's copy omitting photo changes from what moves the date.
- **B1 (`forShelters.whyThatSentence`) and B2 (`freshness.updatedAgo`)** are his copy, due by
  PR 6. The fact they now describe: the date moves on publish, «Ще шукає» / «Ще домовляються»,
  and any photo change on a visible card, never on a text edit. «оновлювали» reads closer to true
  with photos counting. It still goes false the day K3 ships text edits, because a description
  edit doesn't move it. B1 keeps blocking PR 6.
- **Commitment #1 is unaffected.** The ordering input is still the date. A reorder bumps a card
  exactly as «Ще шукає» already can: one animal per action, no bulk. «Найдовше чекають»
  (`wait_anchor_at`) doesn't move.
- **K2's undo** (PR 5): a photo change inside a «Ще шукає»'s 8-second window makes its undo
  answer `UNDO_EXPIRED`. Its copy must allow for that.

### 7.4 Tests

- **Domain table.**
  - Published and reserved: `confirmedAt = at`, `undoable` null, `publishedAt`/`since`
    unchanged.
  - Draft, adopted, withdrawn: identical object back.
  - `at` earlier than `confirmedAt`: date kept.
  - `transitionListing(after, undo_confirm)` → `undo_expired`.
- **Repository** (local and step 31 on Neon).
  - Published: `last_confirmed_at` and `listing->>'confirmedAt'` both equal now.
  - Draft: `last_confirmed_at` null.
  - A listing changed since the read: nothing written, no history line.
- **Handler.**
  - `photos.add` / `reorder` / `remove` on a published animal → `freshness.kind = "fresh"`,
    0 days.
  - On a draft → no confirmation.
  - The RH-B3 test above also keeps the new date.
- **Mutations.**
  - Drop the listing condition from `writePhotosIf`: the race tests in 7.5 go red.
  - Return `listing` unchanged for `published`: the handler test goes red, naming the old date.

### 7.5 A race found while checking this (PR 3, live today, narrow)

Both directions need two tabs or two people:
- **Publish, then remove.** `photos.remove` decides "may remove the last photo" from the
  listing it read (draft: allowed, `photos.ts:211-217`). It then compare-and-sets on the photo
  list only. A publish landing in between leaves a published card with no photo.
- **Remove, then publish.** `animals.transition` checks `publishGaps` on the photos it read
  (`animals.ts:418-424`), then compare-and-sets on the listing only (`writeListingIf`, :190-223).
  A last-photo removal landing in between publishes a card with no photo.

Fix, folded into this PR:
- `writePhotosIf` compare-and-sets on the listing as read (7.2 does it anyway).
- `writeListingIf` for the `publish` event also requires `version = <read version>` and
  `jsonb_array_length(photos) > 0`.
- A lost race re-plans (`tap` re-reads and recomputes the gaps), so the shelter sees an accurate
  `PUBLISH_REQUIREMENTS_UNMET` or `PHOTOS_REQUIRED_WHILE_VISIBLE`, never a photo-less public card.
- Requiring `version` only on publish keeps HS-T8 intact for every other move.

A CHECK that a visible row has at least one photo was considered and not proposed:
- the seed publishes a photo-less animal on purpose (`ZERO_PHOTO_PUBLISHED_INDEX`,
  `seed.ts:1313-1320`), and the public `photoMissing` placeholder exists for such cards;
- so the CHECK would need a production count query first;
- the compare-and-set closes the race without it.

---

## 8. History

- `animal_edited.fields` stays the `ANIMAL_EDITED_FIELDS` list (`domain/src/shelters/history.ts:26-36`);
  no new kind or field.
- `changedFields` deep-compares the domain values (`animals.ts:183-184`), so a draft's first
  `size` (null → `"small"`) records `"size"`, and a cleared description records `"description"`.
  Values are never recorded (K-Q7).
- `animal_created` stays name-only (`animals.ts:329-338`).
- A photo change records one `animal_edited` with `["photos"]`, as today. Under RH-B7, the
  confirmation it implies records nothing (S1: "no history for «Ще шукає» / undo").
- **Volume.** Autosave every 10 s while someone types a description would write a line per save
  (K-Q7 records every edit). Decision taken (T6): autosave runs 10 s after the last change and on
  blur, not on a fixed 10 s clock, and a save that changes nothing writes nothing (already so,
  K-T6). That makes a typing session a few lines, not dozens. Reversible; his to overturn.

---

## 9. Scoring and completeness

- **`scoreAnimal`** (`domain/src/discovery/scoring.ts:110-128`):
  - reads `photos`, `description.uk` (completeness, :57-68), `species`, `size` and `age`
    (preference, :78-93);
  - its parameter becomes `DiscoverableAnimal`. The deck scores only discoverable animals
    (`api/handlers/feed.ts:122`), so a draft can't reach it by type, and the four facts are
    non-null there.
- **Card completeness** (`completenessOf`): photos, a description of 40+ characters, vaccination
  known. Its meaning is unchanged. A listed animal always has a description, so nothing it scores
  changes. Commitment #1's inputs are unchanged.
- **The gallery** doesn't score (`gallery.ts`, the comment above its list handler). Unaffected.
- **K2 rows** show `publishGaps` (§4) and no completeness score. Unaffected beyond the wider gap
  list.

---

## 10. Ripple sites

**Domain**
- `packages/domain/src/animals/animal.ts:26-71` - the union, the guards, `ListingFactsSchema`;
  `:73` `primaryPhoto` unchanged.
- `packages/domain/src/animals/listing.ts:64-85` - named variants; `:100-106` unchanged, used by
  `isDiscoverableAnimal`.
- `packages/domain/src/animals/listing-transition.ts:236-251` - gaps and readiness; new
  `listingAfterPhotoChange` (RH-B7).
- `packages/domain/src/discovery/scoring.ts:57, 78, 110-116` - `Animal` → `DiscoverableAnimal`.
- `packages/domain/src/animals/photo.test.ts:20` - `AnimalSchema.shape.photos`; a union has no
  `.shape`.

**Contracts**
- `packages/contracts/src/kabinet/procedures.ts:287-299` (patch), `:345-356` (createDraft),
  `:357-370` (update: new error), `:371-376` (transition: wider gaps), `:430-437` (the photos
  comment's "never `confirmedAt`" becomes false under RH-B7).
- `packages/contracts/src/kabinet/views.ts:25-37, 41-58` - `AnimalSchema.pick` doesn't exist on a
  union. Proposed: `z.union([DraftAnimalSchema.pick(F), ListedAnimalSchema.pick(F)])` with the
  same field list `F`, so the K3 form gets the typed union and `pick` stays the only builder
  (standing rule).
- `packages/contracts/src/views/animal.ts:51-64, 67-83` - pick from `ListedAnimalSchema`.
- `packages/contracts/src/errors.ts:140-144` (gap enum), new `LISTING_FACT_REQUIRED`.
- `packages/contracts/src/kabinet/contract.test.ts:697` - the edited-fields pin (unchanged list,
  re-check).

**Database**
- `packages/db/src/schema/animals.ts:38-40, 42, 48, 96` - drop `.notNull()`; `:141` - three
  `check(...)`; (`:35-37` only if D2 = null).
- `packages/db/drizzle/0012_*.sql` plus `meta/` snapshot and journal (generated).
- `packages/db/src/repos/mappers.ts`:
  - `:161-190`: a null `age` gives a null `age_anchor_at`; a null description gives three null
    columns.
  - `:192-215` `rowToAnimal`: returns the union, and throws on a non-draft row missing a fact,
    which the CHECK makes unreachable.
- `packages/db/src/repos/kabinet-animal-repo.ts`:
  - `:150-177` `writeEditIf`: null guard;
  - `:190-223` `writeListingIf`: publish compare-and-set;
  - `:237-256` `writePhotosIf`: listing compare-and-set, RH-B7;
  - `:52-67`: detect `23514` like `23503`;
  - `:82-83`: doc comment.
- `packages/db/src/repos/feed-repo.ts:16, 80`; `gallery-repo.ts:24, 134, 161` - return
  `DiscoverableAnimal` through an asserting mapper.
- `packages/db/src/repos/animal-repo.ts:9-38` - union-typed; no logic change.
- `packages/db/src/seed.ts:1372-1389` - `const animal: Animal = { …, listing, … }` with a
  union-typed `listing` matches neither variant; build per variant.
- `packages/db/src/onboard-shelter.ts:362-391` - returns a `ListedAnimal` (its listing is
  published).
- `packages/db/src/test-utils/fixtures.ts:116-137` - `makeAnimal(Partial<Animal>)` becomes
  `makeListedAnimal` and `makeDraftAnimal` (a `Partial` of a union is unusable as an override
  type).
- `packages/db/test/neon-smoke.ts` (steps 27-31); `seed-corpus.test.ts:51` and
  `seed-profiles.test.ts:154` keep `AnimalSchema.parse` (now the union).

**apps/web**
- `apps/web/src/kabinet/handlers/animals.ts`:
  - `:54-57` `visibleConfirmation`;
  - `:60-79` / `:82-97` view and row builders;
  - `:140-164` age (D3);
  - `:198-218` `tap`;
  - `:226-254` `moved` (publish through readiness);
  - `:302-340` createDraft;
  - `:352-399` update (clearing, `LISTING_FACT_REQUIRED`, `en` cleared);
  - `:402-448` transition (all gaps; publish compare-and-set).
- `apps/web/src/kabinet/handlers/photos.ts:49-54, 119-133, 148-173, 202-218` - RH-B7 and the race
  fix.
- `apps/web/src/kabinet/router.ts:188-192` - createDraft and update wiring (input types).
- `apps/web/src/api/handlers/animals.ts:32` (guard), `:44-63`; `feed.ts:96-123`;
  `gallery.ts:55-75` - typed by `DiscoverableAnimal`.
- `apps/web/src/kabinet/photos.test.ts:213, 540` - P-B7's "version unchanged" stays. Any
  assertion that `confirmedAt` doesn't move on a photo write flips under RH-B7.

**Docs**
- `docs/standing-constraints.md:358` - commitment #7 (§7.3).

---

## 11. Tests to add

They test logic, not looks (CLAUDE.md). Each new guard gets its mutation in the commit message.

**Domain**
- Schema tables:
  - `DraftAnimalSchema` accepts name + species with null size, age and description.
  - `ListedAnimalSchema` refuses each null fact for each of the four non-draft kinds (3 × 4).
  - `AnimalSchema` refuses a published animal missing a fact, and accepts a draft with every fact
    (the restored-to-draft case).
- `publishReadinessOf`:
  - each gap alone, all gaps in form order;
  - `ready` carries exactly the draft's facts;
  - mutation: drop one field's check, and its row goes red.
- `publishGaps` on a listed animal: `[]`, or `[photo]` with no photos.
- `listingAfterPhotoChange` table (§7.4).
- Type tests (`// @ts-expect-error`):
  - `scoreAnimal(draft, …)`;
  - building a `FeedCardView` from a `DraftAnimal`;
  - spreading a published listing onto a draft without readiness.

**Contracts**
- `createDraft`: name + species pass; a missing species fails; an extra `sex` key fails (strict).
- Patch: `description: null` passes; `size: null` and `age: null` fail.
- Public output schemas refuse a null `size`, `age` or `description`. The kabinet view accepts a
  draft with nulls, and refuses a published animal with one.
- D3 (if taken): an `asOf` after today or before the floor fails.

**Database** (local; Neon steps 27-31)
- Each CHECK refuses its row with `23514`:
  - a published row with a null size;
  - an age without an anchor;
  - an English description without the Ukrainian.
- `rowToAnimal`: a draft with nulls gives a `DraftAnimal`. A fabricated non-draft row with a null
  throws (unit test on the mapper; the database can't hold one).
- `writeEditIf` writing a null against a row published meanwhile: nothing written, no history
  line.
- Publish compare-and-set: a publish planned before a description-clearing save, or before a
  last-photo removal, writes nothing.
- `writePhotosIf` (RH-B7): see §7.4.

**Handlers**
- createDraft (name + species) → a draft with nulls, `sex: "unknown"`, one `animal_created` line.
- Publish of a draft missing each fact → `PUBLISH_REQUIREMENTS_UNMET`, with exactly the missing
  gaps (and `photo`).
- RH-B3's test, verbatim scenario (§6).
- Clearing the description: on a published animal → `LISTING_FACT_REQUIRED`; on a draft → null
  stored and one `animal_edited` `["description"]`.
- An `uk` description change clears `en`.
- An incomplete draft:
  - NOT_FOUND on `animals.byId`;
  - absent from `feed.list` and `gallery.list`;
  - refused by `swipes.record` and `animals.reveal`.

  These back F-B2's footer sentence.
- The race (§7.5), both orders.

**Harness** (flows by role, label and text)
- `/nova`: name + species saves a draft. «Опублікувати» is disabled, with the gap list written
  next to it.
- A photo is added. The gaps shrink.
- P-T14's compression check: a 4000 px file in gives at most 2000 px and is under the limit out.

---

## 12. Decisions

### For Oleksii (irreversible, a production write, or a public claim). Each has a recommendation.

**D1. Storage for the draft type.**
- Recommend **A**: four nullable columns plus three CHECKs, one production migration (§2.3).
- You run it on production (the test environment until launch), then the smoke run from the
  PR 4 branch against a temporary child branch of migrated production (§2.7), both **before**
  PR 4 merges.
- Rollback is clean only until the first name-and-species draft exists; after that, roll forward
  (§2.5).
- Sentinels (B) record invented facts. A separate table (C) is much more machinery for the same
  guarantee.

**D2. A new animal's sex.**
- **Recommend defaulting to `unknown`** («Не записано», already a selectable answer) rather than
  null:
  - the medical facts already work this way;
  - the mock's own note says "Поля без відповіді мають варіант «Не записано», а не порожнечу"
    (MOCK:30);
  - no public surface shows sex today, so a publish gap for it would block on a field adopters
    never see;
  - one column fewer to make nullable.
- The other reading of K-Q5 ("everything else to publish" includes an explicit sex choice) makes
  `sex` nullable and adds a `sex` gap (§2.3, §4 show the delta).

**D3. «Станом на».**
- Today the server discards the date the shelter picks and stamps the save time
  (`stampedAge`). So «Коли ви це оцінили. Зазвичай — день прийому.» would be false.
- **Recommend keeping the chosen date**: a calendar date, not after today (Kyiv), with a floor,
  stored as `declaredAt`. "The stored value is what the user actually knows" (KAB:188).
- The other choice drops the field and keeps "as of today". It loses what a shelter entering an
  animal months after intake actually knows.

**D4. RH-B7's mechanism.**
- Confirm **(i)**: a photo add, reorder or remove on a published or reserved card sets the
  confirmation date (`last_confirmed_at`). Recommended.
- The alternative is (ii): «Оновлено» switches to `last_updated_at`. Not recommended: every
  typo fix would then move it.
- With (i) come:
  - a reorder counts too (your words: "add, reorder or remove");
  - a pending «Ще шукає» undo expires after a photo change;
  - commitment #7 is reworded as §7.3;
  - B1/B2 must name photo changes.

### Taken (reversible; listed under "Decisions taken" in the PR, one inbox line each)

- **T1.** Names `DraftAnimal` / `ListedAnimal` / `DiscoverableAnimal`; narrowing by guards, no
  duplicated top-level discriminant (§1.2).
- **T2.** Kabinet views as a union of two `pick`s, not one flat view with nullable fields.
- **T3.** `createDraft` takes exactly name + species; the rest goes through `update`.
- **T4.** Only the description can be cleared on a draft. Clearing it on a listed animal is the
  new `LISTING_FACT_REQUIRED` (422).
- **T5.** Changing the Ukrainian description clears the English (K4-B1 answer 13, by analogy).
- **T6.** Autosave 10 s after the last change and on blur, to keep `animal_edited` lines few
  (§8).
- **T7.** The race fix (§7.5): publish compare-and-sets on version and a non-empty photo list;
  photo writes compare-and-set on the listing.
- **T8.** A listed animal's form saves explicitly, with no autosave (copy sheet §10).
- **T9.** One message for every `PHOTO_REJECTED` reason (copy sheet §8).
- **T10.** No visible-needs-a-photo CHECK (§7.5).
- **T11.** If D3 keeps the date: the floor is 30 years before today.
