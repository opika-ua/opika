import { isRealPhotoKey, r2PublicUrl } from "@opika/db/image-pipeline";
import { ageWordFor, sizeLabel, uk } from "@opika/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { cache } from "react";
import { AnimalDetailScreen } from "../../../features/animal-detail/AnimalDetailScreen";
import { AnimalRateLimitedScreen } from "../../../features/animal-detail/AnimalPageStates";
import {
  type AnimalPageLoad,
  loadAnimalPage,
} from "../../../features/animal-detail/animal-page-load";
import { REGISTRY_HAS_NO_REAL_SHELTERS } from "../../../seo-flags";

/**
 * Same reasoning as `../page.tsx` and `../../page.tsx`: prerendering at
 * build time would need `DATABASE_URL` as a build-time secret and would
 * bake in a snapshot that goes stale the moment a shelter updates a
 * listing.
 */
export const dynamic = "force-dynamic";

/**
 * F1, `docs/design/README.md`'s addendum frames D1 (1920)/D2 (360) —
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
  return renderAnimalPage(await loadAnimalPageOnce(animalId));
}

/** The page body for a load result; exported so a test can render each state. */
export function renderAnimalPage(load: AnimalPageLoad): ReactNode {
  switch (load.kind) {
    case "not_found":
      return notFound();
    case "rate_limited":
      return <AnimalRateLimitedScreen />;
    case "animal":
      return <AnimalDetailScreen {...load.view} now={new Date()} />;
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
 * `/tvaryny/{id}` link — the exact URL shape the product is designed to be
 * passed around in, and the one `/prytulkam` tells shelters they can send to
 * Telegram — previewed under the root layout's title with no image and no
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
 * is a 1200x630 JPEG OG variant in `packages/db/src/image-pipeline` — a
 * pipeline addition, deliberately not pre-emptively built here. Decided by what
 * the phone shows, not by what the spec says should work.
 *
 * D-2: this route builds its own `description`/`openGraph.description` rather
 * than inheriting the root layout's — Next does not merge them, it overrides.
 * Without its own demo swap, `/tvaryny/{id}` would preview an animal's
 * age/size with no demo-data disclosure at all — exactly the shared link
 * `/prytulkam` tells shelters they can paste into Telegram, so this is one
 * of the routes the disclosure matters on most (see the root layout's own
 * comment for which routes deliberately don't carry it).
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
  const { animal } = load.view;

  const description = REGISTRY_HAS_NO_REAL_SHELTERS
    ? uk.demo.bannerNotice
    : [ageWordFor(animal.ageBucket, animal.sex), sizeLabel(animal.size)].join(" · ");
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
    title: animal.name,
    description,
    openGraph: {
      type: "article",
      title: animal.name,
      description,
      ...(images ? { images } : {}),
    },
  };
}
