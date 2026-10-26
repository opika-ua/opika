import type { apiErrors, KabinetAnimalView } from "@opika/contracts";
import { type AnimalHistoryRow, kabinetAnimalRepo } from "@opika/db/repos";
import {
  type Animal,
  type AnimalId,
  type AnimalPhoto,
  isDiscoverable,
  isDraftAnimal,
  listingAfterPhotoChange,
  MAX_ANIMAL_PHOTOS,
} from "@opika/domain";
import type { ORPCErrorConstructorMap } from "@orpc/server";
import type { ShelterWriteScope } from "../access";
import type { KabinetContext } from "../context";
import { shelterUploadKey } from "../rate-limits";
import { actorOf, kabinetAnimalViewOf, type OwnErrors, owned } from "./animals";

export type PhotoDeps = Pick<KabinetContext, "db" | "now" | "newId" | "photoUploads">;

type CasErrors = OwnErrors & ORPCErrorConstructorMap<{ CONFLICT: typeof apiErrors.CONFLICT }>;

/**
 * Lost compare-and-set races before giving up. More than a form save's three
 * for `add`: by the time it writes, the photo is already stored, and each
 * retry is one cheap read and write, so a burst of uploads to one animal
 * should land rather than orphan a file.
 */
const MAX_ATTEMPTS = 5;

const keysOf = (photos: readonly AnimalPhoto[]) => photos.map((photo) => photo.storageKey);
const sameOrder = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((key, i) => key === b[i]);

/** Every photo change is an edit naming `photos` (P-Q3, K-Q7: field names only). */
const photosLine = (
  deps: PhotoDeps,
  scope: ShelterWriteScope,
  animal: Animal,
): AnimalHistoryRow<"animal_edited"> => ({
  id: deps.newId(),
  entry: {
    kind: "animal_edited",
    at: deps.now,
    actor: actorOf(scope),
    animalId: animal.id,
    animalName: animal.name,
    fields: ["photos"],
  },
});

/**
 * The animal as a photo write leaves it: the photos, the edit time and, on a
 * published or reserved card, the confirmation date moved to now (RH-B7,
 * Oleksii: "a photo add, reorder or remove moves «Оновлено»", D4 option (i)).
 * A draft, adopted or withdrawn card carries no such date and keeps its
 * listing as it was.
 */
const afterPhotoChange = (animal: Animal, photos: readonly AnimalPhoto[], now: Date): Animal => {
  if (isDraftAnimal(animal)) return { ...animal, photos, lastUpdatedAt: now };
  const listing = listingAfterPhotoChange(animal.listing, now);
  /* v8 ignore next -- `listingAfterPhotoChange` never changes the kind */
  if (listing.kind === "draft") throw new Error("A photo change made a listed animal a draft");
  return { ...animal, photos, lastUpdatedAt: now, listing };
};

/**
 * One compare-and-set photo write: the photo list and the listing as read
 * are both the token (P-Q3, K3-T7), so a publish, a «Ще шукає» or another
 * photo change landing in between makes this write nothing, and the caller
 * re-reads and re-plans. The listing written is `afterPhotoChange`'s.
 */
const writePhotos = (deps: PhotoDeps, scope: ShelterWriteScope, read: Animal, next: Animal) =>
  kabinetAnimalRepo(deps.db).writePhotosIf(
    read.id,
    { next: next.photos, expected: read.photos },
    { next: next.listing, expected: read.listing },
    deps.now,
    photosLine(deps, scope, read),
  );

/**
 * A file stored that no animal points at: logged so it can be found and
 * taken down by hand (P-Q2, P-Q14). Nothing deletes it in code (K-Q2).
 */
const logOrphan = (storageKey: string) => console.error({ event: "photo_orphaned", storageKey });

/**
 * The processing, or `over_budget` once `budgetMs` passes first. The work
 * itself isn't stopped (sharp can't be interrupted while it builds a
 * pipeline; its work is bounded by the input pixel ceiling together with
 * cropping before enlarging, `attentionCropBox`); what it
 * produces after the budget is dropped, so it never reaches storage.
 */
async function withinBudget<T>(
  work: Promise<T>,
  budgetMs: number,
): Promise<{ kind: "done"; value: T } | { kind: "over_budget" }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<{ kind: "over_budget" }>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "over_budget" }), budgetMs);
  });
  try {
    return await Promise.race([work.then((value) => ({ kind: "done" as const, value })), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `shelter.photos.add`, one step (P-Q2), in this order:
 *
 * 1. uploads must be on for this deployment (P-Q10), or `PHOTO_UPLOADS_UNAVAILABLE`;
 * 2. the shelter's hourly and daily allowances are charged (P-Q12), before the
 *    file is read, so a refused file still counts;
 * 3. the animal must be this shelter's and have room (K-Q11);
 * 4. the bytes are checked and re-encoded (`prepareUploadedPhoto`: magic bytes,
 *    2000 px, every piece of metadata stripped), within the deployment's
 *    processing budget: past it, the upload fails as any unexpected failure
 *    does (a 500, «Не завантажилось» on the screen), logged without the file,
 *    its name or any key, and nothing is stored;
 * 5. the three variants are stored under a fresh random key (P-Q4);
 * 6. the photo is appended, compare-and-set on the photo list as re-read, so
 *    two uploads at once both land or the eleventh is refused, never lost.
 *
 * Steps 5-6 can leave a stored file no animal points at (the animal deleted,
 * filled to ten meanwhile, or a failure in between): logged as
 * `photo_orphaned`, never deleted.
 *
 * sharp and the S3 client load here, on the first upload, through a dynamic
 * import, so neither is in any bundle `next build` evaluates or any request
 * that isn't an upload pays for.
 */
export async function photosAdd(
  deps: PhotoDeps,
  scope: ShelterWriteScope,
  input: { animalId: AnimalId; file: File },
  errors: OwnErrors &
    ORPCErrorConstructorMap<{
      RATE_LIMITED: typeof apiErrors.RATE_LIMITED;
      PHOTO_UPLOADS_UNAVAILABLE: typeof apiErrors.PHOTO_UPLOADS_UNAVAILABLE;
      PHOTO_REJECTED: typeof apiErrors.PHOTO_REJECTED;
      PHOTO_LIMIT_REACHED: typeof apiErrors.PHOTO_LIMIT_REACHED;
    }>,
): Promise<KabinetAnimalView> {
  const uploads = deps.photoUploads;
  if (uploads.kind === "off") throw errors.PHOTO_UPLOADS_UNAVAILABLE();

  const allowanceKey = shelterUploadKey(scope.shelterId);
  if (!(await uploads.limiters.perHour.check(allowanceKey, deps.now))) throw errors.RATE_LIMITED();
  if (!(await uploads.limiters.perDay.check(allowanceKey, deps.now))) throw errors.RATE_LIMITED();

  const limitReached = () => errors.PHOTO_LIMIT_REACHED({ data: { max: MAX_ANIMAL_PHOTOS } });
  const { animal } = await owned(deps, scope, input.animalId, errors);
  if (animal.photos.length >= MAX_ANIMAL_PHOTOS) throw limitReached();

  const pipeline = await import("@opika/db/image-pipeline/server");
  const bytes = Buffer.from(await input.file.arrayBuffer());
  const processed = await withinBudget(
    pipeline.prepareUploadedPhoto(bytes),
    uploads.processingBudgetMs,
  );
  if (processed.kind === "over_budget") {
    console.error({ event: "photo_processing_over_budget", budgetMs: uploads.processingBudgetMs });
    throw new Error("Photo processing ran past its budget");
  }
  const prepared = processed.value;
  if (prepared.kind === "rejected") {
    throw errors.PHOTO_REJECTED({ data: { reason: prepared.reason } });
  }

  const storageKey = pipeline.animalPhotoStorageKeyFor(animal.id, deps.newId());
  const photo: AnimalPhoto = {
    storageKey,
    width: prepared.width,
    height: prepared.height,
    alt: null,
  };
  try {
    await pipeline.storePhotoVariants(uploads.storage, storageKey, prepared.variants);
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const current = attempt === 1 ? animal : (await owned(deps, scope, animal.id, errors)).animal;
      if (current.photos.length >= MAX_ANIMAL_PHOTOS) throw limitReached();
      const next = afterPhotoChange(current, [...current.photos, photo], deps.now);
      const result = await writePhotos(deps, scope, current, next);
      if (result.kind === "ok") return kabinetAnimalViewOf(next);
    }
    throw new Error(`Animal ${animal.id}: lost ${MAX_ATTEMPTS} photo races in a row`);
  } catch (error) {
    logOrphan(storageKey);
    throw error;
  }
}

/**
 * Reads the animal, checks the screen's photo list is still the stored one
 * (`expectedPhotoKeys`, P-Q3: CONFLICT otherwise, so a reorder or removal
 * planned on an old list never applies to a new one), and writes `plan`'s
 * result compare-and-set on the photo list and the listing. A lost race
 * re-reads: a changed photo list answers CONFLICT; a changed listing alone (a
 * publish, a «Ще шукає») is re-planned on the new listing, so a last-photo
 * removal planned on a draft that has since been published answers
 * PHOTOS_REQUIRED_WHILE_VISIBLE instead of emptying a public card (K3-T7).
 */
async function rewritePhotos(
  deps: PhotoDeps,
  scope: ShelterWriteScope,
  animalId: AnimalId,
  expectedPhotoKeys: readonly string[],
  errors: CasErrors,
  plan: (animal: Animal) => readonly AnimalPhoto[],
): Promise<KabinetAnimalView> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const { animal } = await owned(deps, scope, animalId, errors);
    if (!sameOrder(keysOf(animal.photos), expectedPhotoKeys)) throw errors.CONFLICT();
    const photos = plan(animal);
    // Nothing changed (a reorder into the same order): nothing written, no
    // edit time, no date, no history line, the rule a form save follows.
    if (sameOrder(keysOf(photos), keysOf(animal.photos))) return kabinetAnimalViewOf(animal);
    const next = afterPhotoChange(animal, photos, deps.now);
    const result = await writePhotos(deps, scope, animal, next);
    if (result.kind === "ok") return kabinetAnimalViewOf(next);
  }
  throw new Error(`Animal ${animalId}: lost ${MAX_ATTEMPTS} photo races in a row`);
}

/** A new order (P-Q9: the first photo is the cover, so "make cover" is this). */
export function photosReorder(
  deps: PhotoDeps,
  scope: ShelterWriteScope,
  input: {
    animalId: AnimalId;
    expectedPhotoKeys: readonly string[];
    nextPhotoKeys: readonly string[];
  },
  errors: CasErrors,
): Promise<KabinetAnimalView> {
  return rewritePhotos(deps, scope, input.animalId, input.expectedPhotoKeys, errors, (animal) =>
    input.nextPhotoKeys.map((key) => {
      const photo = animal.photos.find((candidate) => candidate.storageKey === key);
      // The contract makes `nextPhotoKeys` a permutation of the expected
      // keys, and the stored keys were just checked equal to those.
      if (photo === undefined) throw new Error(`Reorder names ${key}, which the animal lacks`);
      return photo;
    }),
  );
}

/**
 * Takes one photo off the animal (its stored files stay: P-Q14). The last
 * photo of a published or reserved animal stays (P-Q8): adopters can see that
 * card, and a card without a photo is exactly what publishing refuses.
 */
export function photosRemove(
  deps: PhotoDeps,
  scope: ShelterWriteScope,
  input: { animalId: AnimalId; expectedPhotoKeys: readonly string[]; storageKey: string },
  errors: CasErrors &
    ORPCErrorConstructorMap<{
      PHOTOS_REQUIRED_WHILE_VISIBLE: typeof apiErrors.PHOTOS_REQUIRED_WHILE_VISIBLE;
    }>,
): Promise<KabinetAnimalView> {
  return rewritePhotos(deps, scope, input.animalId, input.expectedPhotoKeys, errors, (animal) => {
    const next = animal.photos.filter((photo) => photo.storageKey !== input.storageKey);
    if (next.length === 0 && isDiscoverable(animal.listing)) {
      throw errors.PHOTOS_REQUIRED_WHILE_VISIBLE();
    }
    return next;
  });
}
