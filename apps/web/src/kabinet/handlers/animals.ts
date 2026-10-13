import type {
  AnimalPatchSchema,
  apiErrors,
  KabinetAnimalRowView,
  KabinetAnimalView,
  KabinetCursor,
  KabinetListingEventInputSchema,
} from "@opika/contracts";
import { type ConditionalWrite, kabinetAnimalRepo, shelterRepo } from "@opika/db/repos";
import {
  type AgeEstimate,
  type Animal,
  type AnimalId,
  type CityId,
  DEFAULT_FRESHNESS_POLICY,
  freshnessOf,
  type ListingEvent,
  type ListingKind,
  type MedicalDeclarationInput,
  publishGaps,
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

type OwnErrors = ORPCErrorConstructorMap<{
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

/** K3: every field the edit form shows, listed explicitly (the view is `pick`ed the same way). */
export function kabinetAnimalViewOf(animal: Animal): KabinetAnimalView {
  return {
    id: animal.id,
    name: animal.name,
    species: animal.species,
    sex: animal.sex,
    size: animal.size,
    age: animal.age,
    description: animal.description,
    photos: animal.photos,
    vaccination: animal.vaccination,
    spayNeuter: animal.spayNeuter,
    documentReadiness: animal.documentReadiness,
    listing: animal.listing,
    publicLocation: animal.publicLocation,
    createdAt: animal.createdAt,
    lastUpdatedAt: animal.lastUpdatedAt,
  };
}

/** K2 row: inventory only, never engagement (commitment #2). */
export function kabinetAnimalRowOf(animal: Animal, now: Date): KabinetAnimalRowView {
  const confirmedAt = visibleConfirmation(animal);
  return {
    id: animal.id,
    name: animal.name,
    species: animal.species,
    sex: animal.sex,
    size: animal.size,
    listing: animal.listing,
    lastUpdatedAt: animal.lastUpdatedAt,
    coverPhoto: animal.photos[0] ?? null,
    freshness:
      confirmedAt === null ? null : freshnessOf(confirmedAt, now, DEFAULT_FRESHNESS_POLICY),
    publishGaps: publishGaps(animal),
  };
}

/**
 * The ownership check every animal procedure starts with (S3-Q2, Oleksii): an
 * id that exists nowhere is NOT_FOUND; one that belongs to another shelter is
 * FORBIDDEN. The trade accepted there: FORBIDDEN confirms an id exists
 * elsewhere, but animal ids are public on every feed card and draft ids are
 * unguessable UUIDs.
 */
async function owned(
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
 * A declared age bucket is anchored to when it was declared, and the server
 * is the one who knows when that is: a client clock could otherwise backdate
 * the anchor and make a young animal read older (or the reverse).
 */
const stampedAge = (age: AgeEstimate, now: Date): AgeEstimate =>
  age.kind === "declared_bucket" ? { ...age, declaredAt: now } : age;

const MAX_ATTEMPTS = 3;

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
): Promise<Animal> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const { animal } = await owned(deps, scope, animalId, errors);
    const next = plan(animal);
    const result: ConditionalWrite = await kabinetAnimalRepo(deps.db).writeListingIf(
      animal.id,
      next.listing,
      animal.listing,
    );
    if (result.kind === "ok") return next;
  }
  throw new Error(`Animal ${animalId}: lost ${MAX_ATTEMPTS} races in a row`);
}

/**
 * Applies a listing event, stamped now. It changes the listing only: never
 * `lastUpdatedAt`, which is edit time (HS-T8, Oleksii: "«Ще шукає» must NOT
 * touch last_updated_at"), and only publish and confirm move `confirmedAt`
 * (commitment #7). The write's compare-and-set token is the listing as read.
 */
function moved(
  animal: Animal,
  event: ListingEvent,
  errors: MoveErrors,
  onUndoExpired: () => Error = () => new Error("undo_expired outside undoConfirm"),
): Animal {
  const result = transitionListing(animal.listing, event);
  switch (result.kind) {
    case "ok":
      return { ...animal, listing: result.next };
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

export async function animalsList(
  deps: AnimalDeps,
  scope: ShelterReadScope,
  input: { listing: ListingKind | null; after: { at: Date; id: string } | null; limit: number },
  encodeCursor: (position: { at: Date; id: string }) => KabinetCursor,
): Promise<KabinetAnimalListResult> {
  const repo = kabinetAnimalRepo(deps.db);
  const [page, counts, staleCount] = await Promise.all([
    repo.listPage({ shelterId: scope.shelterId, ...input }),
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

export async function animalsCreateDraft(
  deps: AnimalDeps,
  scope: ShelterWriteScope,
  input: Pick<Animal, "name" | "species" | "sex" | "size" | "age" | "description">,
): Promise<KabinetAnimalView> {
  const shelter = await shelterRepo(deps.db).findById(scope.shelterId as ShelterId);
  if (shelter === null) throw new Error(`Scope names missing shelter ${scope.shelterId}`);
  const animal: Animal = {
    id: deps.newId() as AnimalId,
    shelterId: scope.shelterId,
    name: input.name,
    species: input.species,
    sex: input.sex,
    size: input.size,
    age: stampedAge(input.age, deps.now),
    description: input.description,
    photos: [],
    vaccination: UNKNOWN_ATTESTATION(deps.now),
    spayNeuter: UNKNOWN_ATTESTATION(deps.now),
    documentReadiness: { kind: "unknown" },
    listing: { kind: "draft" },
    publicLocation: null,
    createdAt: deps.now,
    lastUpdatedAt: deps.now,
  };
  // An animal at its shelter is discoverable in the shelter's city.
  await kabinetAnimalRepo(deps.db).insert(animal, shelter.publicLocation.cityId);
  return kabinetAnimalViewOf(animal);
}

/**
 * A K3 form save. Compare-and-set on the `lastUpdatedAt` the form read, so a
 * save never silently overwrites a newer edit. It writes the edited fields
 * only, never the listing, so a «Ще шукає» made while the form was open
 * neither conflicts nor gets undone. Moves `lastUpdatedAt`, never
 * `confirmedAt` (commitment #7).
 */
export async function animalsUpdate(
  deps: AnimalDeps,
  scope: ShelterWriteScope,
  input: {
    animalId: AnimalId;
    expectedLastUpdatedAt: Date;
    patch: z.infer<typeof AnimalPatchSchema>;
  },
  errors: OwnErrors &
    ORPCErrorConstructorMap<{
      CONFLICT: typeof apiErrors.CONFLICT;
      REGISTRY_CONFIRMED: typeof apiErrors.REGISTRY_CONFIRMED;
    }>,
): Promise<KabinetAnimalView> {
  const { animal, cityId } = await owned(deps, scope, input.animalId, errors);
  if (animal.lastUpdatedAt.getTime() !== input.expectedLastUpdatedAt.getTime()) {
    throw errors.CONFLICT();
  }
  const { patch } = input;
  const vaccination = declared(animal.vaccination, patch.vaccination, deps.now);
  const spayNeuter = declared(animal.spayNeuter, patch.spayNeuter, deps.now);
  if (vaccination === "refused" || spayNeuter === "refused") throw errors.REGISTRY_CONFIRMED();
  const next: Animal = {
    ...animal,
    name: patch.name ?? animal.name,
    species: patch.species ?? animal.species,
    sex: patch.sex ?? animal.sex,
    size: patch.size ?? animal.size,
    age: patch.age === undefined ? animal.age : stampedAge(patch.age, deps.now),
    description: patch.description ?? animal.description,
    vaccination,
    spayNeuter,
    lastUpdatedAt: deps.now,
  };
  const result = await kabinetAnimalRepo(deps.db).writeEditIf(next, cityId, animal.lastUpdatedAt);
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
  const next = await tap(deps, scope, input.animalId, errors, (animal) => {
    if (event.type === "publish") {
      const gaps = publishGaps(animal);
      if (gaps.length > 0 && animal.listing.kind === "draft") {
        throw errors.PUBLISH_REQUIREMENTS_UNMET({
          data: { gaps: [...gaps] as [never, ...never[]] },
        });
      }
    }
    return moved(animal, event, errors);
  });
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
  const next = await tap(deps, scope, input.animalId, errors, (animal) =>
    moved(animal, { type: "confirm", at: deps.now }, errors),
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
  const next = await tap(deps, scope, input.animalId, errors, (animal) =>
    moved(animal, { type: "undo_confirm", at: deps.now }, errors, () => errors.UNDO_EXPIRED()),
  );
  return kabinetAnimalViewOf(next);
}

/**
 * Only a draft that has never been public can be deleted (HS-Q9, Oleksii);
 * anything that ever was is withdrawn instead, because its URL and possibly
 * adopters' swipes and reveals still point at it. Compare-and-set like every
 * write: an edit landing in between means re-reading and deciding again.
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
    if (firstPublishedAt !== null)
      throw errors.WAS_PUBLISHED({ data: { reason: "was_published" } });
    const result = await kabinetAnimalRepo(deps.db).deleteDraftIf(animal.id, animal.lastUpdatedAt);
    if (result.kind === "ok") return {};
    // A swipe or reveal references it. Activity, not proof it was published
    // (HS-T10): a draft id can be swiped without the draft ever being public.
    if (result.kind === "referenced")
      throw errors.WAS_PUBLISHED({ data: { reason: "has_activity" } });
  }
  throw new Error(`Animal ${input.animalId}: lost ${MAX_ATTEMPTS} races in a row`);
}
