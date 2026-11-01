import type { AnimalId, ShelterId } from "@opika/domain";

/**
 * Three sizes, not one per context. Every real render width in the app -
 * measured from the actual mock frames (`docs/design/Opika Registry
 * System.dc.html`'s B1/B2/B7, `Opika Registry Frames.dc.html`'s D1/D2), not
 * the README's prose summary - collapses into three tiers with 2x headroom:
 * thumb covers the 88px detail thumbnails, card covers the gallery card
 * (312/304px 1x) and the deck card (334px 1x) at 2x, detail covers the
 * detail page's main photo (560px 1x) at 2x. `object-fit: cover` is already
 * used everywhere a photo renders, so `detail`'s 4:5 shape safely fills
 * D2's non-4:5 mobile hero (360×380, ≈19:20) too - cover crops the small
 * excess rather than distorting it. Full reasoning: `docs/h1-decisions.md`.
 *
 * WebP output - broad support, a real compression win over JPEG, `sharp`
 * handles it natively. A default, not derived from the mock; worth revisiting
 * if there's a format preference.
 */
export const IMAGE_VARIANTS = {
  thumb: { width: 176, height: 176 },
  card: { width: 640, height: 800 },
  detail: { width: 1120, height: 1400 },
} as const;

export type ImageVariantName = keyof typeof IMAGE_VARIANTS;

export const IMAGE_VARIANT_NAMES = Object.keys(IMAGE_VARIANTS) as ImageVariantName[];

/**
 * A shelter logo's own two sizes (pet card PR 3a §C): 1x/2x for a 40px
 * display circle. A separate set from `IMAGE_VARIANTS`, not folded into it -
 * a logo is square, has no `detail`-sized rendering anywhere, and the two
 * namespaces (`animals/`, `shelters/…/logo/`) never collide on a variant
 * name, so `variantObjectKey` below accepts either set interchangeably.
 */
export const LOGO_VARIANTS = {
  small: { width: 80, height: 80 },
  large: { width: 160, height: 160 },
} as const;

export type LogoVariantName = keyof typeof LOGO_VARIANTS;

export const LOGO_VARIANT_NAMES = Object.keys(LOGO_VARIANTS) as LogoVariantName[];

/**
 * Where a shelter logo's storage key starts - `shelterLogoStorageKeyFor`
 * below follows this exactly: `shelters/<shelterId>/logo/<id>`. Shared
 * between the R2 clean-up job's bucket scan and its reference-set lookup,
 * which both need to tell a logo's key apart from an animal photo's to pick
 * the right variant set - defined once here rather than duplicated as a
 * literal in each.
 */
export const SHELTER_LOGO_PREFIX = "shelters/";

/**
 * The real key shape under `shelters/` this job is allowed to touch -
 * `shelters/<shelterId>/logo/<anything>`, never the whole `shelters/` tree.
 * R2's `ListObjectsV2` takes one literal prefix per call, and shelter ids
 * vary, so the bucket scan (`r2-cleanup-run.ts`) has to list the broader
 * `SHELTER_LOGO_PREFIX` and filter down to this shape before anything gets
 * tracked for deletion - otherwise verification evidence, a future cover
 * photo, or any other object someone puts under `shelters/` would look
 * "unreferenced" to this job and get permanently deleted after the grace
 * period (Tier 1 review, PR #220, finding 1 - the STOP this pattern fixes).
 */
export const SHELTER_LOGO_KEY_PATTERN = /^shelters\/[^/]+\/logo\//;

/** Every variant name this module ever writes, across both namespaces - `storageKeyFromObjectKey`'s own inverse needs the full set, not just one. */
const ALL_VARIANT_NAMES = [...IMAGE_VARIANT_NAMES, ...LOGO_VARIANT_NAMES];

/**
 * The smallest variant that covers a requested width, never upscaled past
 * the largest one - matches `next/image`'s own behaviour of asking a loader
 * for several candidate widths and accepting the closest one it gets back.
 * Generic over the variant set (pet card PR 3b: `image-loader.ts` needs this
 * for `LOGO_VARIANTS` too, not just `IMAGE_VARIANTS` - a logo asked for at
 * 40px must land on `small`/`large`, never `thumb`). `reduce`, not a
 * sorted-array lookup: both variant maps start non-empty by construction,
 * but expressing that to `noUncheckedIndexedAccess` via indexing needs a
 * cast either way - `reduce` seeded from the first entry avoids the cast
 * entirely.
 */
export function nearestVariant<T extends Record<string, { width: number; height: number }>>(
  variants: T,
  requestedWidth: number,
): keyof T {
  const entries = Object.entries(variants) as [keyof T, { width: number; height: number }][];
  const sufficient = entries.filter(([, variant]) => variant.width >= requestedWidth);
  if (sufficient.length > 0) {
    return sufficient.reduce((smallest, entry) =>
      entry[1].width < smallest[1].width ? entry : smallest,
    )[0];
  }
  // Nothing is big enough - the ceiling is the largest variant, not the
  // smallest, which the shared "pick the minimum" reduce above would have
  // returned if reused naively here.
  return entries.reduce((largest, entry) =>
    entry[1].width > largest[1].width ? entry : largest,
  )[0];
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * `AnimalPhoto.storageKey` (`packages/domain/src/animals/photo.ts`) is
 * documented as deliberately not a URL and not variant-specific - this is
 * the one function that's allowed to know the actual scheme:
 * `animals/{animalId}/{photoId}`, `photoId` a fresh random UUID per photo
 * (P-Q4, P-Q13).
 *
 * A random id, never the photo's position: a key derived from the index
 * named the same object for a different photo once photos could be removed
 * or reordered, and storing under it would overwrite the old file, which
 * K-Q2 forbids ("a new random key per photo; no code path that overwrites
 * or deletes an existing object"). Refusing anything but a v4 UUID keeps an
 * index, or any other reusable value, from being passed in by mistake.
 */
export function animalPhotoStorageKeyFor(animalId: AnimalId, photoId: string): string {
  if (!UUID_V4.test(photoId)) {
    throw new Error("A photo's storage key needs a fresh random (v4 UUID) photo id");
  }
  return `animals/${animalId}/${photoId}`;
}

/**
 * `ShelterLogo.storageKey`'s own scheme (pet card PR 3b):
 * `shelters/{shelterId}/logo/{logoId}`, `logoId` a fresh random UUID per
 * upload, the same "random id, never a reusable one" reasoning as
 * `animalPhotoStorageKeyFor` above - a new logo never overwrites the old
 * object, so the R2 clean-up job is still what reclaims it. Matches
 * `SHELTER_LOGO_KEY_PATTERN` by construction.
 */
export function shelterLogoStorageKeyFor(shelterId: ShelterId, logoId: string): string {
  if (!UUID_V4.test(logoId)) {
    throw new Error("A shelter logo's storage key needs a fresh random (v4 UUID) id");
  }
  return `shelters/${shelterId}/logo/${logoId}`;
}

/** The real R2 object key for one variant of one photo or logo - never stored, always derived. */
export function variantObjectKey(
  storageKey: string,
  variant: ImageVariantName | LogoVariantName,
): string {
  return `${storageKey}/${variant}.webp`;
}

const VARIANT_OBJECT_SUFFIX = new RegExp(`/(${ALL_VARIANT_NAMES.join("|")})\\.webp$`);

/**
 * The inverse of `variantObjectKey` - the R2 clean-up job's own need (GDPR
 * photo retention): given a real bucket object key, the `storageKey` it was
 * derived from, or `null` if the key doesn't match the one scheme this
 * module ever writes (so a stray or malformed key is skipped, never
 * mis-parsed into treating an unrelated object as one of ours).
 */
export function storageKeyFromObjectKey(objectKey: string): string | null {
  return VARIANT_OBJECT_SUFFIX.test(objectKey)
    ? objectKey.replace(VARIANT_OBJECT_SUFFIX, "")
    : null;
}

/**
 * A positive check, not a negative one - `packages/db/src/seed.ts` stores
 * `storageKey: "seed-photos/dog-1.jpg"` (no leading slash), so "does this
 * start with `/`" cannot tell a seed key apart from a real one; neither has
 * one. Real photos always start with `animals/`, per
 * `animalPhotoStorageKeyFor` above; a real logo matches
 * `SHELTER_LOGO_KEY_PATTERN` (pet card PR 3b) - never a bare `shelters/`
 * prefix, the same narrow-scope reasoning `r2-cleanup-run.ts`'s
 * `isKeyOwnedByThisJob` already applies to the bucket-scan side, so a
 * shelter's non-logo data (verification evidence, say) can't be mistaken
 * for a renderable image either. That's the only two namespaces this module
 * ever writes into - so these are the only strings that are actually safe to
 * key off of. Everything else (seed keys, and any other root-relative
 * `next/image` src the app already produces - static assets, `public/`
 * icons) falls through to the loader's existing normalize-to-root-relative
 * path, unchanged from before this phase.
 */
export function isRealPhotoKey(storageKey: string): boolean {
  return storageKey.startsWith("animals/") || SHELTER_LOGO_KEY_PATTERN.test(storageKey);
}

/** The public URL the browser actually fetches - `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` + the derived variant key. */
export function r2PublicUrl(
  publicBaseUrl: string,
  storageKey: string,
  variant: ImageVariantName | LogoVariantName,
): string {
  const base = publicBaseUrl.endsWith("/") ? publicBaseUrl.slice(0, -1) : publicBaseUrl;
  return `${base}/${variantObjectKey(storageKey, variant)}`;
}

/**
 * R2's S3-compatible API endpoint, derived from the account id - a string
 * derivation, not a network call, so round-1 review moved it out of
 * `r2-client.ts` (the one file in this module that's genuinely untestable
 * without a real bucket) into this pure, tested one.
 */
export function r2EndpointUrl(accountId: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com`;
}
