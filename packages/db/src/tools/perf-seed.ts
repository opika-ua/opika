import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type AgeEstimate,
  type Animal,
  type AnimalColour,
  type AnimalId,
  type AnimalListingState,
  type AnimalSex,
  type AnimalSpecies,
  animalPublicLocationOf,
  type City,
  type CityId,
  COAT_COLOURS,
  type CoatLength,
  citySlugOf,
  type Edrpou,
  type ExactAddress,
  everServedAtAfter,
  type LocalizedText,
  publicLocationOf,
  type Shelter,
  type ShelterId,
  type ShelterVerification,
  type SizeBucket,
  TEMPERAMENT_TRAITS,
  type Temperament,
  testOnlyLocationPolicy,
  UNKNOWN_DOCUMENT_READINESS,
} from "@opika/domain";
import { count, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Database } from "../client";
import { REGION_BY_SLUG } from "../geography/regions-data";
import { databaseTargetLine } from "../prod-guard";
import { animals } from "../schema/animals";
import { cities } from "../schema/cities";
import * as schema from "../schema/index";
import { shelters } from "../schema/shelters";
import {
  buildCities,
  CAT_NAMES,
  CAT_NAMES_F,
  CUSTOM_COLOURS,
  CUSTOM_TEMPERAMENTS,
  DESCRIPTIONS_EN,
  DESCRIPTIONS_UK,
  DOG_NAMES,
  DOG_NAMES_F,
  insertSeedData,
  MEDICAL_NOTES,
  makePhotos,
  moderatorId,
  seededUuid,
} from "../seed";
import { SEED_LOCATION_POLICY_KEY, SEED_SHELTER_ID_PREFIX } from "../seed-ids";
import { perfTarget } from "./perf-support";

/**
 * `pnpm --filter @opika/db db:neon-perf-seed --expect ep-…`: a launch-sized, entirely fictional
 * corpus for the performance check: 30 shelters (three large, mid-sized ones, small ones, two
 * verified with none, one pending and one suspended), ~1,500 published animals plus reserved,
 * draft, adopted and withdrawn ones, over 20 cities, with photo counts 0-6, every species/size/age
 * mix, temperament traits, coat colours and a freshness spread from today to 90 days.
 *
 * Only on a local database or a Neon child branch that is not production (`perfTarget`; --prod is
 * refused). It ADDS to what is there and truncates nothing. Re-running: if every perf row is
 * already there it writes nothing and says so; if only some are (an interrupted run), it refuses
 * and says to recreate the branch (ids are fixed, so a half-seeded branch can't be topped up
 * safely). Cities are looked up by slug first, so a branch with the settlement import keeps its
 * own rows and the perf shelters point at them.
 */

export const PERF_PUBLISHED_ANIMALS = 1500;
const PERF_SHELTERS = 30;
const SHELTER_INDEX_BASE = 1000;
const ANIMAL_INDEX_BASE = 100_000;
const CITY_INDEX_BASE = 1000;
const DAY_MS = 86_400_000;

type PerfCity = { uk: string; en: string; region: string; lat: number; lng: number };

/** Twelve more places beside the base seed's eight. Public geography; no shelter data. */
const EXTRA_CITIES: readonly PerfCity[] = [
  { uk: "Львів", en: "Lviv", region: "lvivska", lat: 49.8397, lng: 24.0297 },
  { uk: "Одеса", en: "Odesa", region: "odeska", lat: 46.4825, lng: 30.7233 },
  { uk: "Харків", en: "Kharkiv", region: "kharkivska", lat: 49.9935, lng: 36.2304 },
  { uk: "Дніпро", en: "Dnipro", region: "dnipropetrovska", lat: 48.4647, lng: 35.0462 },
  { uk: "Запоріжжя", en: "Zaporizhzhia", region: "zaporizka", lat: 47.8388, lng: 35.1396 },
  { uk: "Вінниця", en: "Vinnytsia", region: "vinnytska", lat: 49.2328, lng: 28.4681 },
  { uk: "Полтава", en: "Poltava", region: "poltavska", lat: 49.5883, lng: 34.5514 },
  { uk: "Чернігів", en: "Chernihiv", region: "chernihivska", lat: 51.4982, lng: 31.2893 },
  { uk: "Житомир", en: "Zhytomyr", region: "zhytomyrska", lat: 50.2547, lng: 28.6587 },
  {
    uk: "Івано-Франківськ",
    en: "Ivano-Frankivsk",
    region: "ivano-frankivska",
    lat: 48.9226,
    lng: 24.7111,
  },
  { uk: "Черкаси", en: "Cherkasy", region: "cherkaska", lat: 49.4444, lng: 32.0598 },
  { uk: "Тернопіль", en: "Ternopil", region: "ternopilska", lat: 49.5535, lng: 25.5948 },
];

export function perfCities(): City[] {
  const base = buildCities();
  const extra = EXTRA_CITIES.map((c, i): City => {
    const region = REGION_BY_SLUG.get(c.region as never);
    if (!region) throw new Error(`unknown region slug ${c.region}`);
    return {
      id: seededUuid("c1000000", CITY_INDEX_BASE + i) as CityId,
      slug: citySlugOf(c.en),
      name: { uk: c.uk, en: { text: c.en, provenance: "human" } },
      regionId: region.id,
      kind: "city",
      district: null,
      hromada: null,
      nameScope: "unique_in_ukraine",
      centroid: { kind: "recorded", coordinates: { lat: c.lat, lng: c.lng }, source: "manual" },
    };
  });
  return [...base, ...extra];
}

/** Published animals per shelter: a few large, a spread of mid-sized, small ones, two empty, two not verified. */
export function perfShelterPlan(): {
  published: number;
  verification: "verified" | "pending" | "suspended";
}[] {
  const plan = Array.from({ length: PERF_SHELTERS }, (_, i) => {
    const verification =
      i === 28 ? ("pending" as const) : i === 29 ? ("suspended" as const) : ("verified" as const);
    let published: number;
    if (i === 0) published = 300;
    else if (i === 1) published = 220;
    else if (i === 2) published = 160;
    else if (i <= 16) published = 40 + (i % 5) * 8;
    else if (i <= 25) published = 4 + (i % 6) * 2;
    else if (i <= 27) published = 0;
    else published = 15;
    return { published, verification };
  });
  // The first shelter takes the rounding so the verified total is exactly the stated one.
  const verifiedTotal = plan
    .filter((p) => p.verification === "verified")
    .reduce((n, p) => n + p.published, 0);
  plan[0]!.published += PERF_PUBLISHED_ANIMALS - verifiedTotal;
  return plan;
}

const shelterIdOf = (i: number) =>
  seededUuid(SEED_SHELTER_ID_PREFIX, SHELTER_INDEX_BASE + i) as ShelterId;
const animalIdOf = (g: number) => seededUuid("a0000000", ANIMAL_INDEX_BASE + g) as AnimalId;

const policy = testOnlyLocationPolicy(SEED_LOCATION_POLICY_KEY);

function pick<T>(arr: readonly T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length] as T;
}

export function buildPerfShelters(cityList: readonly City[], now: Date): Shelter[] {
  const daysAgo = (d: number) => new Date(now.getTime() - d * DAY_MS);
  const mod = moderatorId();
  return perfShelterPlan().map((planned, i) => {
    const id = shelterIdOf(i);
    // The three large shelters sit in the big cities; the rest cycle through all twenty.
    const city = cityList[i < 3 ? [0, 8, 10][i]! : i % cityList.length]!;
    if (city.centroid.kind !== "recorded") throw new Error("perf cities carry recorded centroids");
    const exactAddress: ExactAddress = {
      line1: `вул. Тестова, ${i + 1}`,
      line2: null,
      postalCode: null,
      cityId: city.id,
      district: null,
      coordinates: city.centroid.coordinates,
    };
    const evidence = { items: [], submittedAt: daysAgo(120) };
    const verification: ShelterVerification =
      planned.verification === "verified"
        ? { status: "verified", verifiedAt: daysAgo(90), verifiedBy: mod, evidence }
        : planned.verification === "pending"
          ? { status: "pending", submittedAt: daysAgo(5), evidence }
          : {
              status: "suspended",
              suspendedAt: daysAgo(10),
              suspendedBy: mod,
              reason: { code: "complaint_upheld", note: "Тестове призупинення" },
              priorState: { status: "verified", verifiedAt: daysAgo(90), verifiedBy: mod },
              evidence,
            };
    return {
      id,
      displayName: `Тестовий притулок №${i + 1}`,
      description: { uk: "Вигаданий притулок для перевірки продуктивності.", en: null },
      legalEntity: {
        kind: "registered_ngo",
        legalName: `Тестовий притулок №${i + 1}`,
        edrpou: `99${String(i).padStart(6, "0")}` as Edrpou,
        registeredAt: daysAgo(365 * 3),
      },
      publicLocation: publicLocationOf(id, exactAddress, policy),
      exactAddress,
      // `.invalid` can never resolve or deliver (RFC 2606); the phone is the all-zero demo number.
      contact: {
        primary: { kind: "email", address: `perf-${i + 1}@opika-perf.invalid` },
        additional: [{ kind: "phone", e164: "+380000000000" }],
      },
      donation: null,
      logo: null,
      pendingDonation: null,
      version: 0,
      freshnessSentence: null,
      verification,
      createdAt: daysAgo(120),
      lastUpdatedAt: daysAgo(1),
    };
  });
}

const PHOTO_COUNTS = [0, 1, 1, 2, 2, 3, 3, 3, 4, 4, 5, 6] as const;

/** Days since the last confirmation: half fresh (0-7), 30% ageing (8-30), 20% stale (31-90). */
function freshnessDays(g: number): number {
  const roll = g % 10;
  if (roll < 5) return (g * 7) % 8;
  if (roll < 8) return 8 + ((g * 11) % 23);
  return 31 + ((g * 13) % 60);
}

export function buildPerfAnimals(
  shelterList: readonly Shelter[],
  cityList: readonly City[],
  now: Date,
): { animal: Animal; cityId: CityId }[] {
  const daysAgo = (d: number) => new Date(now.getTime() - d * DAY_MS);
  const plan = perfShelterPlan();
  const out: { animal: Animal; cityId: CityId }[] = [];
  let g = 0;
  shelterList.forEach((shelter, s) => {
    const published = plan[s]!.published;
    // Per shelter, on top of the published ones: reserved ~8%, draft ~4%, adopted ~4%, withdrawn ~2%.
    const kinds: AnimalListingState["kind"][] = [
      ...Array<AnimalListingState["kind"]>(published).fill("published"),
      ...Array<AnimalListingState["kind"]>(Math.ceil(published * 0.08)).fill("reserved"),
      ...Array<AnimalListingState["kind"]>(Math.round(published * 0.04)).fill("draft"),
      ...Array<AnimalListingState["kind"]>(Math.round(published * 0.04)).fill("adopted"),
      ...Array<AnimalListingState["kind"]>(Math.round(published * 0.02)).fill("withdrawn"),
    ];
    const shelterCityId = shelter.publicLocation.cityId;
    for (const kind of kinds) {
      const i = g++;
      const species: AnimalSpecies = i % 5 < 3 ? "dog" : "cat";
      const sex: AnimalSex = i % 7 === 0 ? "unknown" : i % 2 === 0 ? "male" : "female";
      const name =
        species === "dog"
          ? sex === "female"
            ? pick(DOG_NAMES_F, i * 7 + 3)
            : pick(DOG_NAMES, i * 13 + 1)
          : sex === "female"
            ? pick(CAT_NAMES_F, i * 11 + 5)
            : pick(CAT_NAMES, i * 17 + 2);
      const size: SizeBucket =
        species === "cat"
          ? i % 2 === 0
            ? "small"
            : "medium"
          : (["small", "medium", "large"] as const)[i % 3]!;
      const coatLength: CoatLength | null = i % 7 < 3 ? "short" : i % 7 < 5 ? "long" : null;
      const temperamentCount = i % 6 === 5 ? 0 : 1 + (i % 3);
      const temperament: Temperament = [
        ...Array.from({ length: temperamentCount }, (_, k) => ({
          kind: "preset" as const,
          trait: pick(TEMPERAMENT_TRAITS, i + k * 4),
        })),
        ...(i % 11 === 4 ? [{ kind: "custom" as const, text: pick(CUSTOM_TEMPERAMENTS, i) }] : []),
      ];
      const colourRoll = i % 12;
      const colour: AnimalColour | null =
        colourRoll < COAT_COLOURS.length
          ? { kind: "preset", colour: pick(COAT_COLOURS, colourRoll) }
          : colourRoll === COAT_COLOURS.length
            ? { kind: "custom", text: pick(CUSTOM_COLOURS, i) }
            : null;
      const age: AgeEstimate =
        i % 3 === 0
          ? {
              kind: "declared_bucket",
              bucket: pick(["baby", "young", "adult", "senior"] as const, i * 23),
              declaredAt: daysAgo((i * 37) % 60),
            }
          : {
              kind: "birth_date",
              date: new Date(now.getTime() - (0.3 + ((i * 41) % 100) / 10) * 365.25 * DAY_MS),
              precision: pick(["day", "month", "year"] as const, i * 31),
            };
      const declared = (
        state: "confirmed" | "in_progress" | "unknown",
        d: number,
      ): { source: "shelter_declared"; state: typeof state; declaredAt: Date } => ({
        source: "shelter_declared",
        state,
        declaredAt: daysAgo(d),
      });
      const stale = freshnessDays(i);
      const at = daysAgo(stale);
      const listing: AnimalListingState =
        kind === "published"
          ? { kind, publishedAt: at, confirmedAt: at, undoable: null }
          : kind === "reserved"
            ? {
                kind,
                since: daysAgo(3),
                publishedAt: daysAgo(stale + 7),
                confirmedAt: at,
                undoable: null,
              }
            : kind === "draft"
              ? { kind }
              : kind === "adopted"
                ? { kind, adoptedAt: daysAgo(7) }
                : {
                    kind: "withdrawn",
                    withdrawnAt: daysAgo(14),
                    reason: { code: "adopted_elsewhere", note: null },
                  };
      const photoCount = kind === "draft" ? 0 : pick(PHOTO_COUNTS, i);
      // About one animal in ten is fostered in another city.
      const fostered = i % 10 === 3;
      const fosterCity = fostered ? cityList[(i * 3 + 1) % cityList.length]! : null;
      const cityId = fosterCity && fosterCity.id !== shelterCityId ? fosterCity.id : shelterCityId;
      const medicalNotes: LocalizedText | null = i % 4 === 1 ? pick(MEDICAL_NOTES, i) : null;
      const fields = {
        id: animalIdOf(i),
        shelterId: shelter.id,
        name,
        species,
        sex,
        coatLength,
        size,
        age,
        description: {
          uk: pick(DESCRIPTIONS_UK, i),
          en: i % 5 < 3 ? (pick(DESCRIPTIONS_EN, i) as LocalizedText["en"]) : null,
        },
        photos: makePhotos(species, i, photoCount),
        vaccination: declared(
          i % 10 < 5 ? "confirmed" : i % 10 < 7 ? "in_progress" : "unknown",
          30,
        ),
        spayNeuter: declared(i % 10 < 4 ? "confirmed" : i % 10 < 6 ? "in_progress" : "unknown", 30),
        documentReadiness: UNKNOWN_DOCUMENT_READINESS,
        temperament,
        colour,
        medicalNotes,
        publicLocation: cityId === shelterCityId ? null : animalPublicLocationOf(cityId, null),
        everServedAt: everServedAtAfter(null, listing, shelter.verification, at),
        createdAt: daysAgo(stale + 7),
        lastUpdatedAt: at,
        version: 0,
      };
      const animal: Animal =
        listing.kind === "draft" ? { ...fields, listing } : { ...fields, listing };
      out.push({ animal, cityId });
    }
  });
  return out;
}

export type PerfSeedResult =
  | { kind: "seeded"; cities: number; shelters: number; animals: number }
  | { kind: "already_seeded"; shelters: number; animals: number };

/** Writes the corpus, or reports it is already there; refuses a partial one. */
export async function seedPerf(db: Database, now = new Date()): Promise<PerfSeedResult> {
  const wanted = perfCities();
  const present = await db
    .select({ id: cities.id, slug: cities.slug })
    .from(cities)
    .where(
      inArray(
        cities.slug,
        wanted.map((c) => c.slug),
      ),
    );
  const idBySlug = new Map(present.map((r) => [r.slug, r.id]));
  // A branch that already has the settlement import keeps its own rows; the corpus points at them.
  const cityList = wanted.map((c) => ({ ...c, id: idBySlug.get(c.slug) ?? c.id }));
  const missing = wanted.filter((c) => !idBySlug.has(c.slug));

  const shelterList = buildPerfShelters(cityList, now);
  const animalList = buildPerfAnimals(shelterList, cityList, now);
  const shelterIds = shelterList.map((s) => s.id);
  const [shelterRow] = await db
    .select({ n: count() })
    .from(shelters)
    .where(inArray(shelters.id, shelterIds));
  const [animalRow] = await db
    .select({ n: count() })
    .from(animals)
    .where(inArray(animals.shelterId, shelterIds));
  const haveShelters = Number(shelterRow?.n ?? 0);
  const haveAnimals = Number(animalRow?.n ?? 0);
  if (haveShelters === shelterList.length && haveAnimals === animalList.length) {
    return { kind: "already_seeded", shelters: haveShelters, animals: haveAnimals };
  }
  if (haveShelters > 0 || haveAnimals > 0) {
    throw new Error(
      `the perf corpus is partly there (${haveShelters} of ${shelterList.length} shelters, ${haveAnimals} of ${animalList.length} animals). Recreate the branch and seed again`,
    );
  }
  await insertSeedData(
    db,
    { cities: missing, shelters: shelterList, animals: animalList },
    { moderatorId: moderatorId(), now },
  );
  return {
    kind: "seeded",
    cities: missing.length,
    shelters: shelterList.length,
    animals: animalList.length,
  };
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }
  const target = perfTarget(url, process.argv.slice(2));
  if (target.kind === "refused") {
    console.error(`REFUSED: ${target.reason}. Nothing was run.`);
    process.exit(1);
  }
  console.log(databaseTargetLine(url));
  const client = postgres(url, { max: 1 });
  try {
    const result = await seedPerf(drizzle(client, { schema }));
    console.log(
      result.kind === "already_seeded"
        ? `Already seeded: ${result.shelters} shelters, ${result.animals} animals. Nothing written.`
        : `Seeded: ${result.shelters} shelters, ${result.animals} animals, ${result.cities} new cities.`,
    );
  } catch (error) {
    console.error(`Perf seed failed: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
  process.exit(process.exitCode ?? 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
