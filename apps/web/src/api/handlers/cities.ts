import type { CityView } from "@opika/contracts";
import { cityRepo } from "@opika/db/repos";
import type { AppContext } from "../context.js";

export async function citiesList(
  _input: Record<string, never>,
  context: AppContext,
): Promise<readonly CityView[]> {
  const cities = cityRepo(context.db);
  const all = await cities.listAll();
  return all.map((c) => ({
    id: c.id,
    name: c.name,
    centroid: c.centroid,
  }));
}
