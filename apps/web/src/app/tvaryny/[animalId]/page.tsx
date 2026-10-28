import type { AnimalDetailView } from "@opika/contracts";
import { isRealPhotoKey, r2PublicUrl } from "@opika/db/image-pipeline";
import { textIn } from "@opika/domain";
import { speciesWordFor, uk } from "@opika/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { cache } from "react";
import { AnimalDetailScreen } from "../../../features/animal-detail/AnimalDetailScreen";
import {
  type AnimalPageLoad,
  loadAnimalPage,
} from "../../../features/animal-detail/animal-page-load";
import { speciesLabel } from "../../../features/animal-detail/detail-text";
import { kabinetSessionCookiePresent } from "../../../features/chrome/kabinet-signed-in";
import { RateLimitedScreen } from "../../../features/chrome/RateLimitedScreen";
import { JsonLd } from "../../../seo/json-ld";
import { animalBreadcrumbs } from "../../../seo/json-ld-builders";
import { REGISTRY_HAS_NO_REAL_SHELTERS } from "../../../seo-flags";
import { META_DESCRIPTION_MAX_LENGTH, trimAtWordBoundary } from "../../../seo-text";

/**
 * Same reasoning as `../page.tsx` and `../../page.tsx`: prerendering at
 * build time would need `DATABASE_URL` as a build-time secret and would
 * bake in a snapshot that goes stale the moment a shelter updates a
 * listing.
 */
export const dynamic = "force-dynamic";

/**
 * F1, `docs/design/README.md`'s addendum frames D1 (1920)/D2 (360) -
 * `AnimalDetailScreen`'s own comment has the rendering detail. The data
 * comes from `loadAnimalPage`, which the gallery's overlay
 * (`../@preview/(.)[animalId]`) also renders from (designer round 1, §2:
 * one component, one loader).
 *
 * Its three outcomes:
 * - `not_found` → `notFound()` (Next's 404, `not-found.tsx` in this
 *   segment): a malformed id, or an animal that doesn't exist, isn't
 *   discoverable or whose shelter isn't verified (`animals.byId` collapses
 *   all three to one `NOT_FOUND`).
 * - `rate_limited` → its own screen, his sentence (RL-F1). This used to be
 *   caught with everything else and shown as the 404, «Це не помилка —
 *   просто картки тут більше немає», which was false.
 * - any other error (a database failure) is thrown by the loader and lands
 *   on `/tvaryny/error.tsx`, the boundary the gallery already has. It is
 *   never the not-found copy either.
 */
export default async function Page({ params }: { params: Promise<{ animalId: string }> }) {
  const { animalId } = await params;
  const [load, kabinetSignedIn] = await Promise.all([
    loadAnimalPageOnce(animalId),
    kabinetSessionCookiePresent(),
  ]);
  return renderAnimalPage(load, kabinetSignedIn);
}

/** The page body for a load result; exported so a test can render each state. */
export function renderAnimalPage(load: AnimalPageLoad, kabinetSignedIn: boolean): ReactNode {
  switch (load.kind) {
    case "not_found":
      return notFound();
    case "rate_limited":
      return <RateLimitedScreen />;
    case "animal":
      return (
        <>
          <JsonLd data={animalBreadcrumbs(uk.feed.galleryTitle, load.view.animal)} />
          <AnimalDetailScreen {...load.view} kabinetSignedIn={kabinetSignedIn} />
        </>
      );
  }
}

/**
 * `cache()` because Next calls `generateMetadata` and the component in the
 * same request and both need the animal. Without it this route would issue
 * two identical sets of queries per view on a `force-dynamic` page; React
 * dedupes them for the lifetime of the request instead.
 */
const loadAnimalPageOnce = cache((animalId: string) => loadAnimalPage(animalId));

/**
 * Phase T. Before this the route had no metadata at all, so a shared
 * `/tvaryny/{id}` link - the exact URL shape the product is designed to be
 * passed around in, and the one `/prytulkam` tells shelters they can send to
 * Telegram - previewed under the root layout's title with no image and no
 * description.
 *
 * The image is only emitted for a real uploaded photo. `isRealPhotoKey` is
 * false for the seeded corpus's `seed-photos/*.jpg` placeholders, which have no
 * absolute URL to give a link-preview crawler; a card with a correct title and
 * no image is honest, and pointing a crawler at a relative path is not.
 *
 * ⚠ **Unverified against real clients, and that is the acceptance test, not a
 * metadata assertion.** Two known risks, both of which only a real preview can
 * settle:
 * - The variants are **WebP**. The well-trodden OG path is JPEG/PNG, client
 *   support for WebP previews is uneven, and Telegram caches a first bad fetch
 *   aggressively enough that retrying the same URL will not clear it.
 * - `detail` is **4:5 portrait** (1120x1400). Several clients crop a preview to
 *   landscape, which is where heads get cut.
 *
 * If a real paste into Telegram, Viber and an Instagram DM looks wrong, the fix
 * is a 1200x630 JPEG OG variant in `packages/db/src/image-pipeline` - a
 * pipeline addition, deliberately not pre-emptively built here. Decided by what
 * the phone shows, not by what the spec says should work.
 *
 * D-2: this route builds its own `description`/`openGraph.description` rather
 * than inheriting the root layout's - Next does not merge them, it overrides.
 * Without its own demo swap, `/tvaryny/{id}` would preview an animal's
 * age/size with no demo-data disclosure at all - exactly the shared link
 * `/prytulkam` tells shelters they can paste into Telegram, so this is one
 * of the routes the disclosure matters on most (see the root layout's own
 * comment for which routes deliberately don't carry it).
 *
 * `title`/`description`, PR B (the SEO review of page titles), owner-approved:
 * - `title`: `{name}, {species}, {city}` (`city` omitted when the animal's own
 *   location doesn't resolve to a known city - `filter(Boolean)`, not a guess).
 *   The age bucket and the reserved/adopted state are both deliberately absent -
 *   neither belongs in a title a search index can keep stale, and the state was
 *   never in it to begin with.
 * - `description`: built by `animalMetaDescription`, below - see its own doc comment
 *   for the exact format, the sex-aware species word and the 160-character budget.
 *
 * `openGraph.title` is omitted, not duplicated: Next resolves a missing
 * `openGraph.title` from the page's own already-templated `title` (same
 * pattern `/prytulkam`'s and `/pro`'s own metadata already use), which is how
 * "og:title matches the page's title" (owner) holds without hand-typing the
 * brand suffix here too.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ animalId: string }>;
}): Promise<Metadata> {
  const { animalId } = await params;
  const load = await loadAnimalPageOnce(animalId);
  // A refusal says nothing about the animal; a search engine that met it
  // must not keep it as this URL's page (RL-F1).
  if (load.kind === "rate_limited") return { robots: { index: false, follow: false } };
  if (load.kind !== "animal") return {};
  const { animal, shelter, cityName } = load.view;

  const title = [animal.name, speciesLabel(animal.species), cityName].filter(Boolean).join(", ");
  const description = REGISTRY_HAS_NO_REAL_SHELTERS
    ? uk.demo.bannerNotice
    : animalMetaDescription(animal, shelter.displayName, cityName);
  const photo = animal.photos[0];
  const publicBaseUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;

  const images =
    photo && publicBaseUrl && isRealPhotoKey(photo.storageKey)
      ? [
          {
            url: r2PublicUrl(publicBaseUrl, photo.storageKey, "detail"),
            width: 1120,
            height: 1400,
            alt: animal.name,
          },
        ]
      : undefined;

  return {
    title,
    description,
    // Always the animal's own validated id, no query string - the pet-card work
    // (owner, PR B) adds gallery-context params to this same URL, and this canonical
    // must never vary with them. `animal.id`, not the raw route param: `AnimalIdSchema`
    // accepts a UUID in any case, so a request that happened to use uppercase would
    // otherwise get a canonical that disagrees with the lowercase form every other
    // link on the site actually uses.
    alternates: { canonical: `/tvaryny/${animal.id}` },
    openGraph: {
      type: "article",
      description,
      ...(images ? { images } : {}),
    },
    ...(images ? { twitter: { card: "summary_large_image" as const } } : {}),
  };
}

/** A body sentence shorter than this reads as a cut-off word, not a useful fragment -
 * omitted entirely rather than shown truncated (found on review: an unusually long
 * shelter name could leave almost no room for it). */
const MIN_USEFUL_BODY_LENGTH = 20;

/**
 * `{species word} {name} · {city} · {shelterName}. {animal's own description, trimmed}.`
 * - owner's exact wording, replacing an earlier draft ("з притулку «...», м. ..."):
 * no "з притулку", no "м.", and no quotes around the shelter name, because a shelter's
 * own display name may already contain "притулок" or quotes of its own. The species
 * word is sex-aware (`speciesWordFor`, `@opika/i18n`) - distinct from the title's own
 * `speciesLabel`, which stays sex-neutral. Exported for its own test; `cityName` is
 * `null` whenever the animal's location doesn't resolve to a known city (`loadAnimalPage`'s
 * own fallback), dropped from the sentence entirely rather than rendered as an empty
 * " · ".
 *
 * The shelter name itself is trimmed to whatever budget is left after the fixed
 * surrounding segments - found on review: an unusually long shelter name could
 * otherwise make the prefix alone exceed `META_DESCRIPTION_MAX_LENGTH`, which
 * `trimAtWordBoundary`'s own 160-character ceiling is supposed to guarantee never
 * happens to the description as a whole.
 */
export function animalMetaDescription(
  animal: Pick<AnimalDetailView, "name" | "species" | "sex" | "description">,
  shelterName: string,
  cityName: string | null,
): string {
  const speciesWord = speciesWordFor(animal.species, animal.sex);
  const fixedPrefix = [`${speciesWord} ${animal.name}`, cityName].filter(Boolean).join(" · ");
  // " · " before the shelter name (3 characters), "." after it (1 character).
  const shelterBudget = Math.max(0, META_DESCRIPTION_MAX_LENGTH - fixedPrefix.length - 3 - 1);
  const safeShelterName = trimAtWordBoundary(shelterName, shelterBudget);
  const prefix = `${fixedPrefix} · ${safeShelterName}.`;

  const bodyBudget = META_DESCRIPTION_MAX_LENGTH - prefix.length - 1;
  const body =
    bodyBudget >= MIN_USEFUL_BODY_LENGTH
      ? trimAtWordBoundary(textIn(animal.description, "uk"), bodyBudget)
      : "";
  return body ? `${prefix} ${body}` : prefix;
}
