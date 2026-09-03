import { isRealPhotoKey, r2PublicUrl } from "@opika/db/image-pipeline";
import { type AnimalId, AnimalIdSchema, textIn } from "@opika/domain";
import { ageBucketLabel, sizeLabel } from "@opika/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { anonymousRouterClient } from "../../../api/server-client";
import { AnimalDetailScreen } from "../../../features/animal-detail/AnimalDetailScreen";

/**
 * Same reasoning as `../page.tsx` and `../../page.tsx`: prerendering at
 * build time would need `DATABASE_URL` as a build-time secret and would
 * bake in a snapshot that goes stale the moment a shelter updates a
 * listing.
 */
export const dynamic = "force-dynamic";

/**
 * F1, `docs/design/README.md`'s addendum frames D1 (1920)/D2 (360) —
 * `AnimalDetailScreen`'s own comment has the rendering detail. This file
 * is the data-fetching shell: parse the route param, fetch, resolve the
 * city name, hand a fully-formed view to the presentational component.
 *
 * `notFound()` (Next's own 404 mechanism, `not-found.tsx` in this same
 * segment), not this route's inherited `error.tsx` — a malformed id or an
 * animal that genuinely doesn't exist (or isn't discoverable, or whose
 * shelter isn't verified — `animals.byId`'s own handler collapses all
 * three to one `NOT_FOUND`, deliberately not distinguishing a real id from
 * a guessed one) is a real 404, not a failure to recover from by retrying.
 * Any other error (a database failure, RATE_LIMITED) is not caught here
 * and falls through to `/tvaryny/error.tsx`, the same boundary the
 * gallery already has — consistent copy for "something failed on our
 * side" regardless of which route under `/tvaryny` hit it.
 */
export default async function Page({ params }: { params: Promise<{ animalId: string }> }) {
  const { animalId: rawAnimalId } = await params;
  const parsedId = AnimalIdSchema.safeParse(rawAnimalId);
  if (!parsedId.success) notFound();

  const client = anonymousRouterClient();
  const [animalResult, cities] = await Promise.all([
    safeById(parsedId.data),
    client.cities.list({}),
  ]);
  if (!animalResult) notFound();

  const shelter = await client.shelters.byId({ shelterId: animalResult.shelter.id });

  const cityId = animalResult.publicLocation
    ? animalResult.publicLocation.cityId
    : shelter.publicLocation.cityId;
  const cityLocalizedName = cities.find((city) => city.id === cityId)?.name ?? null;

  return (
    <AnimalDetailScreen
      animal={animalResult}
      shelter={shelter}
      now={new Date()}
      cityName={cityLocalizedName ? textIn(cityLocalizedName, "uk") : null}
    />
  );
}

/**
 * `animals.byId` throws `NOT_FOUND` (an `ORPCError`, not a plain rejected
 * promise) for both a missing id and a genuinely malformed one that still
 * happens to parse as a UUID — this narrows either case to `null` so the
 * caller can call `notFound()` once, rather than needing oRPC's own error
 * type at the call site.
 *
 * `cache()` because Next calls `generateMetadata` and the component in the same
 * request and both need the animal. Without it this route would issue two
 * identical queries per view on a `force-dynamic` page — React dedupes them for
 * the lifetime of the request instead.
 */
const safeById = cache(async (animalId: AnimalId) => {
  try {
    return await anonymousRouterClient().animals.byId({ animalId });
  } catch {
    return null;
  }
});

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
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ animalId: string }>;
}): Promise<Metadata> {
  const { animalId: rawAnimalId } = await params;
  const parsedId = AnimalIdSchema.safeParse(rawAnimalId);
  if (!parsedId.success) return {};

  const animal = await safeById(parsedId.data);
  if (!animal) return {};

  const description = [ageBucketLabel(animal.ageBucket), sizeLabel(animal.size)].join(" · ");
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
