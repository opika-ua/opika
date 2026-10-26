import { isDeepStrictEqual } from "node:util";
import type {
  AgeEstimateInput,
  AnimalPatchSchema,
  apiErrors,
  KabinetAnimalListFilter,
  KabinetAnimalRowView,
  KabinetAnimalView,
  KabinetCursor,
  KabinetListingEventInputSchema,
} from "@opika/contracts";
import {
  type ConditionalWrite,
  type KabinetAnimalFilter,
  kabinetAnimalRepo,
  type ListingMoveHistory,
  type ListingWriteGuard,
  shelterRepo,
} from "@opika/db/repos";
import {
  type AgeEstimate,
  ANIMAL_EDITED_FIELDS,
  type Animal,
  type AnimalEditedField,
  type AnimalId,
  type AnimalListingState,
  ageDateProblem,
  type CityId,
  DEFAULT_FRESHNESS_POLICY,
  type DraftAnimal,
  declaredAtOfCalendarDate,
  freshnessOf,
  instantOfCalendarDate,
  isDraftAnimal,
  isListedAnimal,
  kyivCalendarDateOf,
  type ListingEvent,
  type ListingKind,
  type LocalizedText,
  listingHistoryEventOf,
  type MedicalDeclarationInput,
  type PublishGap,
  publishGaps,
  publishReadinessOf,
  type ShelterActor,
  type ShelterId,
  type SpayNeuterStatus,
  transitionListing,
  UNDO_WINDOW_MS,
  UNKNOWN_ATTESTATION,
  type VaccinationStatus,
} from "@opika/domain";
import type { ORPCErrorConstructorMap } from "@orpc/server";
import type { z } from "zod";
import type { ShelterReadScope, ShelterWriteScope } from "../access";
import type { KabinetContext } from "../context";

export type AnimalDeps = Pick<KabinetContext, "db" | "now" | "newId">;

export type OwnErrors = ORPCErrorConstructorMap<{
  NOT_FOUND: typeof apiErrors.NOT_FOUND;
  FORBIDDEN: typeof apiErrors.FORBIDDEN;
}>;
type MoveErrors = OwnErrors &
  ORPCErrorConstructorMap<{ ILLEGAL_TRANSITION: typeof apiErrors.ILLEGAL_TRANSITION }>;

/** Freshness of what an adopter can see; a draft or a closed listing has none. */
const visibleConfirmation = (animal: Animal): Date | null =>
  animal.listing.kind === "published" || animal.listing.kind === "reserved"
    ? animal.listing.confirmedAt
    : null;

/**
 * K3: every field the edit form shows, listed explicitly (the view is
 * `pick`ed the same way). The two branches read alike on purpose: the facts
 * and the listing have to be taken from a narrowed half of the union for the
 * result to type-check as that half's view (F-B1), so a draft's nulls can
 * only ever reach the draft view.
 */
export function kabinetAnimalViewOf(animal: Animal): KabinetAnimalView {
  const core = {
    id: animal.id,
    name: animal.name,
    species: animal.species,
    sex: animal.sex,
    coatLength: animal.coatLength,
    photos: animal.photos,
    vaccination: animal.vaccination,
    spayNeuter: animal.spayNeuter,
    documentReadiness: animal.documentReadiness,
    publicLocation: animal.publicLocation,
    createdAt: animal.createdAt,
    lastUpdatedAt: animal.lastUpdatedAt,
    version: animal.version,
  };
  return isDraftAnimal(animal)
    ? {
        ...core,
        size: animal.size,
        age: animal.age,
        description: animal.description,
        listing: animal.listing,
      }
    : {
        ...core,
        size: animal.size,
        age: animal.age,
        description: animal.description,
        listing: animal.listing,
      };
}

/**
 * K2 row: inventory only, never engagement (commitment #2). Built from the
 * row alone, with no further read: the gaps come from the animal's own facts
 * (`publishGaps`), so a page of fifty is one query, not fifty-one.
 */
export function kabinetAnimalRowOf(animal: Animal, now: Date): KabinetAnimalRowView {
  const confirmedAt = visibleConfirmation(animal);
  const core = {
    id: animal.id,
    name: animal.name,
    species: animal.species,
    sex: animal.sex,
    lastUpdatedAt: animal.lastUpdatedAt,
    coverPhoto: animal.photos[0] ?? null,
    freshness:
      confirmedAt === null ? null : freshnessOf(confirmedAt, now, DEFAULT_FRESHNESS_POLICY),
    publishGaps: publishGaps(animal),
  };
  return isDraftAnimal(animal)
    ? { ...core, size: animal.size, age: animal.age, listing: animal.listing }
    : { ...core, size: animal.size, age: animal.age, listing: animal.listing };
}

/**
 * The ownership check every animal procedure starts with (S3-Q2, Oleksii): an
 * id that exists nowhere is NOT_FOUND; one that belongs to another shelter is
 * FORBIDDEN. The trade accepted there: FORBIDDEN confirms an id exists
 * elsewhere, but animal ids are public on every feed card and draft ids are
 * unguessable UUIDs.
 */
export async function owned(
  deps: AnimalDeps,
  scope: ShelterReadScope,
  animalId: AnimalId,
  errors: OwnErrors,
): Promise<{ animal: Animal; cityId: CityId; firstPublishedAt: Date | null }> {
  const found = await kabinetAnimalRepo(deps.db).findWithCity(animalId);
  if (found === null) throw errors.NOT_FOUND();
  if (found.animal.shelterId !== scope.shelterId) throw errors.FORBIDDEN();
  return found;
}

/**
 * A medical fact as the shelter declares it (proposal §1.7): `declaredAt`
 * moves only when the state actually changes, and a registry-confirmed fact
 * is never overwritten by a declaration. The form renders it read-only; this
 * is the server holding the same line.
 */
function declared<T extends VaccinationStatus | SpayNeuterStatus>(
  current: T,
  input: MedicalDeclarationInput | undefined,
  now: Date,
): T | "refused" {
  if (input === undefined) return current;
  if (current.source === "registry") return "refused";
  if (current.state === input.state) return current;
  return { source: "shelter_declared", state: input.state, declaredAt: now } as T;
}

/**
 * The age a form input stands for (D3, Oleksii, verbatim: "keep the chosen
 * «Станом на» date"): a birth date at day precision, or a bucket declared as
 * of the date the shelter chose, which `ageAnchorOf` then carries forward.
 * The date is the shelter's knowledge, not the save time: «Коли ви це
 * оцінили. Зазвичай - день, коли тварина потрапила до притулку.»
 */
const ageOfInput = (input: AgeEstimateInput, now: Date): AgeEstimate =>
  input.kind === "birth_date"
    ? { kind: "birth_date", date: instantOfCalendarDate(input.date), precision: "day" }
    : {
        kind: "declared_bucket",
        bucket: input.bucket,
        declaredAt: declaredAtOfCalendarDate(input.asOf, now),
      };

/**
 * Whether the input names exactly the stored age, compared as the form shows
 * it: the same kind, the same bucket and the same calendar date (Kyiv), the
 * way `declared` keeps a medical fact's `declaredAt`. A form that re-sends an
 * unchanged age must not restamp it: a legacy bucket stamped at save time, or
 * a birth date stored at month precision, would otherwise be rewritten by a
 * save that changed nothing, and record an age change nobody made.
 */
const sameAge = (current: AgeEstimate, input: AgeEstimateInput): boolean => {
  if (current.kind === "birth_date" && input.kind === "birth_date") {
    return kyivCalendarDateOf(current.date) === input.date;
  }
  if (current.kind === "declared_bucket" && input.kind === "declared_bucket") {
    return current.bucket === input.bucket && kyivCalendarDateOf(current.declaredAt) === input.asOf;
  }
  return false;
};

type AgeDateErrors = ORPCErrorConstructorMap<{
  AGE_DATE_OUT_OF_RANGE: typeof apiErrors.AGE_DATE_OUT_OF_RANGE;
}>;

/**
 * An edit's age: unchanged when the input is absent or names the stored age,
 * otherwise the input's age, refused when its date is after today in Kyiv or
 * more than thirty years back (D3). The check runs on the server's clock,
 * the one that decides; the form runs the same rule first.
 */
function editedAge(
  current: AgeEstimate | null,
  input: AgeEstimateInput | undefined,
  now: Date,
  errors: AgeDateErrors,
): AgeEstimate | null {
  if (input === undefined) return current;
  if (current !== null && sameAge(current, input)) return current;
  const problem = ageDateProblem(input.kind === "birth_date" ? input.date : input.asOf, now);
  if (problem !== null) throw errors.AGE_DATE_OUT_OF_RANGE({ data: { problem: problem.kind } });
  return ageOfInput(input, now);
}

/**
 * The description an edit stores (decision taken T5, by analogy with
 * Oleksii's K4-B1 answer 13 for the shelter's sentence, verbatim: "Clear
 * `en` when `uk` changes; a stale translation would be a false claim."). A
 * changed Ukrainian text stores no English, whatever the request carried; an
 * unchanged one keeps the English sent with it.
 */
export function descriptionAfterEdit(
  stored: LocalizedText | null,
  edited: LocalizedText,
): LocalizedText {
  if (stored !== null && stored.uk === edited.uk) return edited;
  return { uk: edited.uk, en: null };
}

const MAX_ATTEMPTS = 3;

/** Who a shelter's own write is recorded as: its admin, from the write scope (K-Q7). */
export const actorOf = (scope: ShelterWriteScope): ShelterActor => ({
  kind: "shelter_admin",
  shelterAdminId: scope.shelterAdminId,
});

/**
 * The fields an edit names in history: those whose stored value actually
 * changed, never the values themselves (K-Q7, Oleksii: "edits record field
 * names only"). Compared on the domain values after the patch is applied,
 * not on which keys the form sent: a form that sends every field would
 * otherwise tell the shelter all eight changed on every save (review
 * finding 4, inbox K-T6). Typed off `ANIMAL_EDITED_FIELDS`, so a history
 * literal the animal lacks fails to compile.
 */
const changedFields = (before: Animal, after: Animal): AnimalEditedField[] =>
  ANIMAL_EDITED_FIELDS.filter((field) => !isDeepStrictEqual(before[field], after[field]));

/** S1 (Oleksii: "no history for «Ще шукає» / undo"): the confirmation date is the record. */
const CONFIRMATION_NOT_RECORDED: ListingMoveHistory = {
  kind: "not_recorded",
  because: "confirmation",
};

/**
 * A single tap (publish, reserve, «Ще шукає», undo): planned on what's there
 * now, written compare-and-set, and re-planned after a lost race, so a move
 * that became illegal in between comes back ILLEGAL_TRANSITION rather than
 * overwriting the newer state.
 */
async function tap(
  deps: AnimalDeps,
  scope: ShelterWriteScope,
  animalId: AnimalId,
  errors: OwnErrors,
  plan: (animal: Animal) => Animal,
  history: ListingMoveHistory | ((animal: Animal, next: Animal) => ListingMoveHistory),
): Promise<Animal> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const { animal } = await owned(deps, scope, animalId, errors);
    const next = plan(animal);
    // A publish was planned on this read's facts and photos (K3-T7): it
    // writes only if neither changed since, so a lost race re-plans here and
    // answers PUBLISH_REQUIREMENTS_UNMET rather than publishing a card that
    // fails the check just made.
    const guard: ListingWriteGuard =
      isDraftAnimal(animal) && isListedAnimal(next)
        ? { kind: "publish", expectedVersion: animal.version }
        : { kind: "listing_only" };
    const result: ConditionalWrite = await kabinetAnimalRepo(deps.db).writeListingIf(
      animal.id,
      next.listing,
      animal.listing,
      deps.now,
      typeof history === "function" ? history(animal, next) : history,
      guard,
    );
    if (result.kind === "ok") return next;
  }
  throw new Error(`Animal ${animalId}: lost ${MAX_ATTEMPTS} races in a row`);
}

/**
 * The animal with a new listing. Leaving a draft goes through
 * `publishReadinessOf` (F-B1): the facts it returns are what make the result
 * a `ListedAnimal`, so no publish can skip a field, and a draft that isn't
 * ready answers `unready` with every gap. Restoring to a draft keeps every
 * fact (a set value is a valid value of a nullable field).
 */
function withListing(
  animal: Animal,
  listing: AnimalListingState,
  unready: (gaps: readonly [PublishGap, ...PublishGap[]]) => Error,
): Animal {
  if (listing.kind === "draft") return { ...animal, listing };
  if (isDraftAnimal(animal)) {
    const readiness = publishReadinessOf(animal);
    if (readiness.kind === "gaps") throw unready(readiness.gaps);
    return { ...animal, ...readiness.facts, listing };
  }
  return { ...animal, listing };
}

/** Only a publish leaves a draft, and only `animalsTransition` publishes. */
const unreachableUnready = () => new Error("Only a publish leaves a draft");

/**
 * Applies a listing event, stamped now. It changes the listing only: never
 * `lastUpdatedAt`, which is edit time (HS-T8, Oleksii: "«Ще шукає» must NOT
 * touch last_updated_at"), and of the listing events only publish and
 * confirm move `confirmedAt` (commitment #7; a photo change on a visible card
 * does too, RH-B7, but that is `photos.ts`). The write's compare-and-set
 * token is the listing as read, plus the version and photos for a publish.
 */
function moved(
  animal: Animal,
  event: ListingEvent,
  errors: MoveErrors,
  onUndoExpired: () => Error = () => new Error("undo_expired outside undoConfirm"),
  unready: (gaps: readonly [PublishGap, ...PublishGap[]]) => Error = unreachableUnready,
): Animal {
  const result = transitionListing(animal.listing, event);
  switch (result.kind) {
    case "ok":
      return withListing(animal, result.next, unready);
    case "illegal":
      throw errors.ILLEGAL_TRANSITION({
        data: { machine: "listing", from: result.from, event: result.event },
      });
    case "undo_expired":
      throw onUndoExpired();
    case "non_monotonic":
      // The server stamps `at`, so this is its own clock behind the last
      // write's: a deployment fault, not something the shelter did.
      throw new Error(
        `Listing event at ${result.eventTimestamp.toISOString()} precedes state at ${result.stateTimestamp.toISOString()}`,
      );
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
}

type UndoErrors = ORPCErrorConstructorMap<{ UNDO_EXPIRED: typeof apiErrors.UNDO_EXPIRED }>;

export type KabinetAnimalListResult = {
  items: KabinetAnimalRowView[];
  nextCursor: KabinetCursor | null;
  counts: Record<ListingKind, number>;
  staleCount: number;
};

/**
 * The instant a confirmation goes stale: N5's strip counts what the pips
 * call stale (`ageDays > agingMaxDays`), derived from the same policy so the
 * two can't disagree.
 */
export const staleBefore = (now: Date): Date =>
  new Date(now.getTime() - (DEFAULT_FRESHNESS_POLICY.agingMaxDays + 1) * 24 * 60 * 60 * 1000);

/** The repository's filter for a K2 one: «Показати ці N» is the strip's own cut-off, taken now. */
const repoFilterOf = (filter: KabinetAnimalListFilter, now: Date): KabinetAnimalFilter =>
  filter.kind === "stale" ? { kind: "stale", staleBefore: staleBefore(now) } : filter;

/**
 * K2's page plus the chip counts and the strip's count: three statements
 * whatever the page size (no per-row read). The counts ignore the filter, as
 * the chips show the whole inventory while one of them is active.
 */
export async function animalsList(
  deps: AnimalDeps,
  scope: ShelterReadScope,
  input: {
    filter: KabinetAnimalListFilter;
    after: { at: Date; id: string } | null;
    limit: number;
  },
  encodeCursor: (position: { at: Date; id: string }) => KabinetCursor,
): Promise<KabinetAnimalListResult> {
  const repo = kabinetAnimalRepo(deps.db);
  const [page, counts, staleCount] = await Promise.all([
    repo.listPage({
      shelterId: scope.shelterId,
      filter: repoFilterOf(input.filter, deps.now),
      after: input.after,
      limit: input.limit,
    }),
    repo.countsByKind(scope.shelterId),
    repo.staleCount(scope.shelterId, staleBefore(deps.now)),
  ]);
  return {
    items: page.items.map((animal) => kabinetAnimalRowOf(animal, deps.now)),
    nextCursor: page.next === null ? null : encodeCursor(page.next),
    counts,
    staleCount,
  };
}

export async function animalsById(
  deps: AnimalDeps,
  scope: ShelterReadScope,
  input: { animalId: AnimalId },
  errors: OwnErrors,
): Promise<KabinetAnimalView> {
  return kabinetAnimalViewOf((await owned(deps, scope, input.animalId, errors)).animal);
}

/**
 * A new draft from a name and a species (K-Q5, Oleksii: "name + species to
 * create"). Sex starts «Не записано» (D2, verbatim: "sex defaults to
 * "unknown""), the medical facts and fur unknown, no size, age, description
 * or photo: what the shelter hasn't told yet stays unanswered, never invented.
 */
export async function animalsCreateDraft(
  deps: AnimalDeps,
  scope: ShelterWriteScope,
  input: Pick<DraftAnimal, "name" | "species">,
): Promise<KabinetAnimalView> {
  const shelter = await shelterRepo(deps.db).findById(scope.shelterId as ShelterId);
  if (shelter === null) throw new Error(`Scope names missing shelter ${scope.shelterId}`);
  const animal: DraftAnimal = {
    id: deps.newId() as AnimalId,
    shelterId: scope.shelterId,
    name: input.name,
    species: input.species,
    sex: "unknown",
    coatLength: null,
    size: null,
    age: null,
    description: null,
    photos: [],
    everServedAt: null,
    vaccination: UNKNOWN_ATTESTATION(deps.now),
    spayNeuter: UNKNOWN_ATTESTATION(deps.now),
    documentReadiness: { kind: "unknown" },
    listing: { kind: "draft" },
    publicLocation: null,
    createdAt: deps.now,
    lastUpdatedAt: deps.now,
    version: 0,
  };
  // An animal at its shelter is discoverable in the shelter's city.
  await kabinetAnimalRepo(deps.db).insert(animal, shelter.publicLocation.cityId, {
    id: deps.newId(),
    entry: {
      kind: "animal_created",
      at: deps.now,
      actor: actorOf(scope),
      animalId: animal.id,
      animalName: animal.name,
    },
  });
  return kabinetAnimalViewOf(animal);
}

/**
 * A K3 form save. Compare-and-set on the `version` the form read (S3-T6), so a
 * save never silently overwrites a newer edit. It writes the edited fields
 * only, never the listing or the photos, so a «Ще шукає» or a photo change
 * made while the form was open neither conflicts nor gets undone (HS-T8,
 * RH-B3). Moves `lastUpdatedAt`, never `confirmedAt` (commitment #7).
 *
 * Clearing the description (null) is for a draft only (F-B1): a listed
 * animal answers `LISTING_FACT_REQUIRED`, and a draft published between the
 * read and the write makes the write a conflict (the repository's draft-only
 * condition), never an incomplete public card.
 *
 * A save that changes nothing writes nothing: no version bump, no
 * `lastUpdatedAt`, no history line. It answers with the animal as stored.
 */
export async function animalsUpdate(
  deps: AnimalDeps,
  scope: ShelterWriteScope,
  input: {
    animalId: AnimalId;
    expectedVersion: number;
    patch: z.infer<typeof AnimalPatchSchema>;
  },
  errors: OwnErrors &
    AgeDateErrors &
    ORPCErrorConstructorMap<{
      CONFLICT: typeof apiErrors.CONFLICT;
      REGISTRY_CONFIRMED: typeof apiErrors.REGISTRY_CONFIRMED;
      LISTING_FACT_REQUIRED: typeof apiErrors.LISTING_FACT_REQUIRED;
    }>,
): Promise<KabinetAnimalView> {
  const { animal, cityId } = await owned(deps, scope, input.animalId, errors);
  if (animal.version !== input.expectedVersion) throw errors.CONFLICT();
  const { patch } = input;
  const vaccination = declared(animal.vaccination, patch.vaccination, deps.now);
  const spayNeuter = declared(animal.spayNeuter, patch.spayNeuter, deps.now);
  if (vaccination === "refused" || spayNeuter === "refused") throw errors.REGISTRY_CONFIRMED();
  const common = {
    name: patch.name ?? animal.name,
    species: patch.species ?? animal.species,
    sex: patch.sex ?? animal.sex,
    // `?? ` would turn a cleared fur (null) back into the stored one.
    coatLength: patch.coatLength === undefined ? animal.coatLength : patch.coatLength,
    vaccination,
    spayNeuter,
  };
  const description = (stored: LocalizedText | null): LocalizedText | null =>
    patch.description === undefined
      ? stored
      : patch.description === null
        ? null
        : descriptionAfterEdit(stored, patch.description);
  let edited: Animal;
  if (isDraftAnimal(animal)) {
    edited = {
      ...animal,
      ...common,
      size: patch.size ?? animal.size,
      age: editedAge(animal.age, patch.age, deps.now, errors),
      description: description(animal.description),
    };
  } else {
    // Spreading a null onto a listed animal doesn't type-check, which is what
    // forces this refusal (shapes doc §5.2).
    const kept = description(animal.description);
    if (kept === null) throw errors.LISTING_FACT_REQUIRED({ data: { field: "description" } });
    const age = editedAge(animal.age, patch.age, deps.now, errors);
    /* v8 ignore next -- the patch can't clear an age (`age: null` is BAD_REQUEST) */
    if (age === null) throw errors.LISTING_FACT_REQUIRED({ data: { field: "age" } });
    edited = { ...animal, ...common, size: patch.size ?? animal.size, age, description: kept };
  }
  const [first, ...rest] = changedFields(animal, edited);
  if (first === undefined) return kabinetAnimalViewOf(animal);
  const next = { ...edited, lastUpdatedAt: deps.now, version: animal.version + 1 };
  const result = await kabinetAnimalRepo(deps.db).writeEditIf(next, cityId, animal.version, {
    id: deps.newId(),
    entry: {
      kind: "animal_edited",
      at: deps.now,
      actor: actorOf(scope),
      animalId: animal.id,
      animalName: next.name,
      fields: [first, ...rest],
    },
  });
  if (result.kind === "conflict") throw errors.CONFLICT();
  return kabinetAnimalViewOf(next);
}

/** Publish, reserve, release, adopt, withdraw, back to draft: the server stamps `at`. */
export async function animalsTransition(
  deps: AnimalDeps,
  scope: ShelterWriteScope,
  input: { animalId: AnimalId; event: z.infer<typeof KabinetListingEventInputSchema> },
  errors: MoveErrors &
    ORPCErrorConstructorMap<{
      PUBLISH_REQUIREMENTS_UNMET: typeof apiErrors.PUBLISH_REQUIREMENTS_UNMET;
    }>,
): Promise<KabinetAnimalView> {
  const event = { ...input.event, at: deps.now } as ListingEvent;
  const next = await tap(
    deps,
    scope,
    input.animalId,
    errors,
    // A publish from a draft goes through readiness (`withListing`): every
    // gap at once, in form order (K-Q5). On anything but a draft, publish is
    // ILLEGAL_TRANSITION, decided by the table before readiness is asked.
    (animal) =>
      moved(animal, event, errors, undefined, (gaps) =>
        errors.PUBLISH_REQUIREMENTS_UNMET({ data: { gaps } }),
      ),
    // Every one of these moves is recorded (K-Q7), a withdrawal with its
    // reason code and never its note (K-Q18).
    (animal, after) => ({
      kind: "recorded",
      row: {
        id: deps.newId(),
        entry: {
          kind: "animal_listing_changed",
          at: deps.now,
          actor: actorOf(scope),
          animalId: animal.id,
          animalName: animal.name,
          event: listingHistoryEventOf(input.event),
          from: animal.listing.kind,
          to: after.listing.kind,
        },
      },
    }),
  );
  return kabinetAnimalViewOf(next);
}

/**
 * «Ще шукає» / «Ще домовляються» (N4): one animal per call, never bulk. The
 * response carries when the undo window closes, measured on the server's
 * clock from this confirmation.
 */
export async function animalsConfirm(
  deps: AnimalDeps,
  scope: ShelterWriteScope,
  input: { animalId: AnimalId },
  errors: MoveErrors,
): Promise<{ animal: KabinetAnimalView; undoUntil: Date }> {
  const next = await tap(
    deps,
    scope,
    input.animalId,
    errors,
    (animal) => moved(animal, { type: "confirm", at: deps.now }, errors),
    CONFIRMATION_NOT_RECORDED,
  );
  return {
    animal: kabinetAnimalViewOf(next),
    undoUntil: new Date(deps.now.getTime() + UNDO_WINDOW_MS),
  };
}

export async function animalsUndoConfirm(
  deps: AnimalDeps,
  scope: ShelterWriteScope,
  input: { animalId: AnimalId },
  errors: MoveErrors & UndoErrors,
): Promise<KabinetAnimalView> {
  const next = await tap(
    deps,
    scope,
    input.animalId,
    errors,
    (animal) =>
      moved(animal, { type: "undo_confirm", at: deps.now }, errors, () => errors.UNDO_EXPIRED()),
    CONFIRMATION_NOT_RECORDED,
  );
  return kabinetAnimalViewOf(next);
}

/**
 * Only a draft that has never been public can be deleted (HS-Q9, Oleksii);
 * anything that ever was is withdrawn instead, because its URL and possibly
 * adopters' swipes and reveals still point at it. Compare-and-set like every
 * write: an edit landing in between means re-reading and deciding again.
 *
 * Both refusals are one answer, with nothing to tell them apart (K-Q9,
 * Oleksii: "one refusal for both cases"). A separate "has activity" answer
 * would tell the shelter that an adopter swiped or revealed the animal,
 * which commitment #2 says it is never told. One answer is also truthful:
 * activity implies the animal was public, since swipes and reveals refuse a
 * non-discoverable animal (DR-F1).
 */
export async function animalsDeleteDraft(
  deps: AnimalDeps,
  scope: ShelterWriteScope,
  input: { animalId: AnimalId },
  errors: MoveErrors & ORPCErrorConstructorMap<{ WAS_PUBLISHED: typeof apiErrors.WAS_PUBLISHED }>,
): Promise<Record<string, never>> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const { animal, firstPublishedAt } = await owned(deps, scope, input.animalId, errors);
    if (animal.listing.kind !== "draft") {
      throw errors.ILLEGAL_TRANSITION({
        data: { machine: "listing", from: animal.listing.kind, event: "delete_draft" },
      });
    }
    if (firstPublishedAt !== null) throw errors.WAS_PUBLISHED();
    const result = await kabinetAnimalRepo(deps.db).deleteDraftIf(animal.id, animal.version, {
      id: deps.newId(),
      entry: {
        kind: "animal_deleted",
        at: deps.now,
        actor: actorOf(scope),
        animalId: animal.id,
        animalName: animal.name,
      },
    });
    if (result.kind === "ok") return {};
    if (result.kind === "referenced") throw errors.WAS_PUBLISHED();
  }
  throw new Error(`Animal ${input.animalId}: lost ${MAX_ATTEMPTS} races in a row`);
}
