import { AnimalIdSchema, textIn } from "@opika/domain";
import { notFound } from "next/navigation";
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
    safeById(client, parsedId.data),
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
 */
async function safeById(
  client: ReturnType<typeof anonymousRouterClient>,
  animalId: Parameters<typeof client.animals.byId>[0]["animalId"],
) {
  try {
    return await client.animals.byId({ animalId });
  } catch {
    return null;
  }
}
