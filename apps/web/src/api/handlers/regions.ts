import type { RegionView } from "@opika/contracts";
import { REGION_BY_SLUG, REGIONS } from "@opika/db";
import type { AppContext } from "../context";

/** The 27 first-level units, straight from the constant (no query). Field by field, like every view. */
export async function regionsList(
  _input: Record<string, never>,
  _context: AppContext,
): Promise<readonly RegionView[]> {
  return REGIONS.map((region) => ({
    id: region.id,
    slug: region.slug,
    label: region.name.ukLabel,
    short: region.name.ukShort,
    neighbours: region.neighbours.flatMap((slug) => {
      const neighbour = REGION_BY_SLUG.get(slug);
      return neighbour ? [neighbour.id] : [];
    }),
  }));
}
