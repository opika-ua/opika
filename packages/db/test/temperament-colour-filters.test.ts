import {
  type AnimalColour,
  type CityId,
  type CoatColour,
  DEFAULT_SEEN_SET_POLICY,
  EVERYONE_SCOPE,
  type FeedFilters,
  type ListedAnimal,
  NO_FILTERS,
  type Temperament,
  type TemperamentTrait,
} from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { feedRepo } from "../src/repos/feed-repo";
import { galleryRepo } from "../src/repos/gallery-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import {
  makeAnimal,
  makeCity,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";

/**
 * The temperament and colour filters (pet card redesign, PR 1b) at the
 * database: the shared predicate the deck, the gallery and the relaxation
 * counts all use. A temperament filter admits an animal with any of the chosen
 * presets; a colour filter admits the chosen presets. Neither ever admits an
 * animal whose shelter recorded nothing, or only its own words.
 *
 * Local Postgres through postgres-js. The SQL changed and the temperament
 * clause is the first array overlap in an adopter-facing query, so the same
 * filters run over neon-http in `neon-smoke.ts` step 44 before this is called
 * verified.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const NOW = new Date("2026-10-26T12:00:00.000Z");

const presets = (...traits: TemperamentTrait[]): Temperament =>
  traits.map((trait) => ({ kind: "preset" as const, trait }));
const preset = (colour: CoatColour): AnimalColour => ({ kind: "preset", colour });
const OWN_WORDS = { uk: "Димчасте", en: null };

type Corpus = Record<
  | "calmShy"
  | "playful"
  | "goodWithCats"
  | "customOnly"
  | "unrecorded"
  | "black"
  | "tabby"
  | "customColour",
  ListedAnimal
>;

/**
 * One animal per case, published, at distinct confirmation times. The
 * temperament cases carry no colour and the colour cases no temperament, so
 * each filter's result is read off one dimension at a time.
 */
async function seed(): Promise<Corpus> {
  const city = makeCity();
  await cityRepo(db).insert(city);
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
  });
  await shelterRepo(db).insert(shelter);

  let hour = 0;
  const make = (fields: Pick<ListedAnimal, "temperament" | "colour">): ListedAnimal => {
    hour += 1;
    const at = new Date(NOW.getTime() - hour * 3_600_000);
    return makeAnimal({
      shelterId: shelter.id,
      ...fields,
      listing: { kind: "published", publishedAt: at, confirmedAt: at, undoable: null },
    });
  };
  const corpus: Corpus = {
    calmShy: make({ temperament: presets("calm", "shy"), colour: null }),
    playful: make({ temperament: presets("playful"), colour: null }),
    goodWithCats: make({
      temperament: [
        ...presets("good_with_cats"),
        { kind: "custom", text: { uk: "Боїться грози", en: null } },
      ],
      colour: null,
    }),
    customOnly: make({
      temperament: [{ kind: "custom", text: { uk: "Любить сніг", en: null } }],
      colour: null,
    }),
    unrecorded: make({ temperament: [], colour: null }),
    black: make({ temperament: [], colour: preset("black") }),
    tabby: make({ temperament: [], colour: preset("tabby") }),
    customColour: make({ temperament: [], colour: { kind: "custom", text: OWN_WORDS } }),
  };
  await animalRepo(db).insertMany(
    Object.values(corpus).map((animal) => ({ animal, cityId: city.id as CityId })),
  );
  return corpus;
}

const byTemperament = (
  values: readonly [TemperamentTrait, ...TemperamentTrait[]],
): FeedFilters => ({
  ...NO_FILTERS,
  temperaments: { kind: "oneOf", values },
});
const byColour = (values: readonly [CoatColour, ...CoatColour[]]): FeedFilters => ({
  ...NO_FILTERS,
  colours: { kind: "oneOf", values },
});

const ids = (animals: readonly { id: string }[]): string[] => animals.map((a) => a.id).sort();

const galleryIds = async (filters: FeedFilters): Promise<string[]> =>
  ids(
    (
      await galleryRepo(db).list({
        filters,
        scope: EVERYONE_SCOPE,
        sort: "freshest",
        page: 1,
        pageSize: 24,
        now: NOW,
      })
    ).items,
  );

const deckIds = async (filters: FeedFilters): Promise<string[]> =>
  ids(
    (
      await feedRepo(db).list({
        filters,
        cursor: null,
        limit: 20,
        adopterId: null,
        now: NOW,
        seenSetPolicy: DEFAULT_SEEN_SET_POLICY,
      })
    ).items,
  );

describe("the temperament filter in the shared predicate", () => {
  it("one trait: the gallery and the deck list exactly the animals that have it", async () => {
    const c = await seed();
    for (const list of [galleryIds, deckIds]) {
      expect(await list(byTemperament(["shy"]))).toEqual(ids([c.calmShy]));
      expect(await list(byTemperament(["good_with_cats"]))).toEqual(ids([c.goodWithCats]));
    }
  });

  it("several traits widen the list: an animal with any of them matches, not only one with all", async () => {
    const c = await seed();
    for (const list of [galleryIds, deckIds]) {
      // `calmShy` has «shy» and not «playful»; `playful` the other way round.
      expect(await list(byTemperament(["shy", "playful"]))).toEqual(ids([c.calmShy, c.playful]));
      expect(await list(byTemperament(["calm", "shy", "playful", "good_with_cats"]))).toEqual(
        ids([c.calmShy, c.playful, c.goodWithCats]),
      );
    }
  });

  it("never lists an animal with no presets, whether nothing is recorded or only the shelter's words", async () => {
    const c = await seed();
    const listed = await galleryIds(byTemperament(["calm", "playful", "good_with_cats", "shy"]));
    expect(listed).not.toContain(c.customOnly.id);
    expect(listed).not.toContain(c.unrecorded.id);
    // A trait nobody has is an empty list, not an error.
    expect(await galleryIds(byTemperament(["independent"]))).toEqual([]);
  });

  it("the relaxation is the unfiltered count minus the filtered one", async () => {
    await seed();
    const counts = await galleryRepo(db).relaxationCounts({
      filters: byTemperament(["shy", "playful"]),
      now: NOW,
    });
    expect(counts.current).toBe(2);
    expect(counts.relaxations).toEqual([{ dimension: "temperaments", additional: 8 - 2 }]);
  });
});

describe("the colour filter in the shared predicate", () => {
  it("lists exactly the chosen colours, in the gallery and the deck", async () => {
    const c = await seed();
    for (const list of [galleryIds, deckIds]) {
      expect(await list(byColour(["black"]))).toEqual(ids([c.black]));
      expect(await list(byColour(["black", "tabby"]))).toEqual(ids([c.black, c.tabby]));
    }
  });

  it("never lists a custom colour or an unrecorded one", async () => {
    const c = await seed();
    const everyPreset = await galleryIds(
      byColour([
        "black",
        "white",
        "grey",
        "ginger",
        "brown",
        "cream",
        "black_white",
        "tricolour",
        "tabby",
      ]),
    );
    expect(everyPreset).toEqual(ids([c.black, c.tabby]));
    expect(everyPreset).not.toContain(c.customColour.id);
    expect(everyPreset).not.toContain(c.unrecorded.id);
  });

  it("the relaxation is the unfiltered count minus the filtered one", async () => {
    await seed();
    const counts = await galleryRepo(db).relaxationCounts({
      filters: byColour(["tabby"]),
      now: NOW,
    });
    expect(counts.current).toBe(1);
    expect(counts.relaxations).toEqual([{ dimension: "colours", additional: 8 - 1 }]);
  });
});

describe("temperament and colour together", () => {
  it("intersect, and each relaxation comes from the same predicate", async () => {
    await seed();
    const filters: FeedFilters = {
      ...byTemperament(["shy"]),
      colours: { kind: "oneOf", values: ["black"] },
    };
    // No fixture is both shy and black: dropping colour finds the shy one,
    // dropping temperament the black one.
    expect(await galleryIds(filters)).toEqual([]);
    const counts = await galleryRepo(db).relaxationCounts({ filters, now: NOW });
    expect(counts.current).toBe(0);
    expect(new Map(counts.relaxations.map((r) => [r.dimension, r.additional]))).toEqual(
      new Map([
        ["temperaments", 1],
        ["colours", 1],
      ]),
    );
  });
});
