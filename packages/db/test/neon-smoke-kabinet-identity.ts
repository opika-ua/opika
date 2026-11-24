import { randomUUID } from "node:crypto";
import type {
  AnimalId,
  CityId,
  PublicLocation,
  Shelter,
  ShelterAdminId,
  ShelterHistoryEntry,
} from "@opika/domain";
import { eq } from "drizzle-orm";
import type { Database } from "../src/client";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { funnelRepo } from "../src/repos/funnel-repo";
import { kabinetAnimalRepo } from "../src/repos/kabinet-animal-repo";
import { kabinetShelterRepo } from "../src/repos/kabinet-shelter-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { animals } from "../src/schema/animals";
import { cities } from "../src/schema/cities";
import { shelters } from "../src/schema/shelters";
import { makeAnimal, makeCity, makeDraftAnimal, makeShelter } from "../src/test-utils/index";

type Outcome = { name: string; ok: boolean; detail: string };

const NOW = new Date();
const ADMIN = randomUUID() as ShelterAdminId;
const actor = { kind: "shelter_admin", shelterAdminId: ADMIN } as const;

const cityAt = (cityId: CityId): PublicLocation => ({ precision: "city", cityId, district: null });

/**
 * The shelter's own name and city on Neon's driver (Agent 3): the audited write that moves the
 * animals following the shelter's city in its one statement, its compare-and-set, the funnel's
 * once-per-shelter insert, the draft cap's count and the history page with its cities. Fresh
 * fixtures only; rows stay on the child branch.
 */
export async function runKabinetIdentitySmoke(db: Database): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });
  const repo = kabinetShelterRepo(db);

  const newCity = () =>
    makeCity({ id: randomUUID() as CityId, slug: `smoke-${randomUUID()}` as never });
  const [from, to, foster] = [newCity(), newCity(), newCity()];
  await cityRepo(db).insertMissing([from, to, foster]);

  const shelterIn = async (city: CityId): Promise<Shelter> => {
    const fixture = makeShelter({
      displayName: `Смоук місто ${randomUUID().slice(0, 6)}`,
      verification: {
        status: "pending",
        submittedAt: NOW,
        evidence: { items: [], submittedAt: NOW },
      },
    });
    const shelter: Shelter = {
      ...fixture,
      legalEntity: null,
      premises: { kind: "not_recorded" },
      publicLocation: cityAt(city),
    };
    await shelterRepo(db).insert(shelter);
    return shelter;
  };
  const cityOf = async (animalId: AnimalId) =>
    (await db.select({ cityId: animals.cityId }).from(animals).where(eq(animals.id, animalId)))[0]
      ?.cityId;

  // (1) A name and a city in one audited write.
  const shelter = await shelterIn(from.id);
  const atShelter = makeAnimal({ shelterId: shelter.id });
  const fostered = makeAnimal({
    shelterId: shelter.id,
    publicLocation: cityAt(foster.id),
  } as never);
  await animalRepo(db).insert(atShelter, from.id);
  await animalRepo(db).insert(fostered, foster.id);
  const entries: { id: string; entry: ShelterHistoryEntry }[] = [
    {
      id: randomUUID(),
      entry: {
        kind: "display_name_changed",
        at: NOW,
        actor,
        from: shelter.displayName,
        to: "Смоук нова назва",
      },
    },
    { id: randomUUID(), entry: { kind: "city_changed", at: NOW, actor, from: from.id, to: to.id } },
  ];
  const written = await repo.applyAuditedMany({
    shelterId: shelter.id,
    expectedVersion: shelter.version,
    changes: [
      { kind: "display_name", displayName: "Смоук нова назва" },
      { kind: "city", publicLocation: cityAt(to.id) },
    ],
    entries,
    now: NOW,
  });
  const [row] = await db.select().from(shelters).where(eq(shelters.id, shelter.id));
  const history = await repo.historyOf(shelter.id);
  check(
    "identity: a name and a city land as one write, one version bump, two history rows",
    written.kind === "ok" &&
      row?.version === shelter.version + 1 &&
      row.displayName === "Смоук нова назва" &&
      history.length === 2,
    `${written.kind}, version ${row?.version}, ${history.length} rows`,
  );
  check(
    "identity: shelters.city_id equals the new public location's city",
    row?.cityId === to.id && (row.publicLocation as PublicLocation).cityId === to.id,
    `${row?.cityId}`,
  );
  const [movedCity, fosterCity] = [await cityOf(atShelter.id), await cityOf(fostered.id)];
  check(
    "identity: the animal at the shelter moved, the fostered one kept its own city",
    movedCity === to.id && fosterCity === foster.id,
    `${movedCity === to.id}, ${fosterCity === foster.id}`,
  );
  const cityLine = history.find((entry) => entry.kind === "city_changed");
  check(
    "identity: the history rows read back whole",
    cityLine?.kind === "city_changed" &&
      cityLine.from === from.id &&
      cityLine.to === to.id &&
      history.some((entry) => entry.kind === "display_name_changed"),
    history.map((entry) => entry.kind).join(","),
  );

  // (2) A stale version writes nothing.
  const stale = await shelterIn(from.id);
  const staying = makeAnimal({ shelterId: stale.id });
  await animalRepo(db).insert(staying, from.id);
  const lost = await repo.applyAuditedMany({
    shelterId: stale.id,
    expectedVersion: stale.version + 1,
    changes: [{ kind: "city", publicLocation: cityAt(to.id) }],
    entries: [
      {
        id: randomUUID(),
        entry: { kind: "city_changed", at: NOW, actor, from: from.id, to: to.id },
      },
    ],
    now: NOW,
  });
  const [staleRow] = await db.select().from(shelters).where(eq(shelters.id, stale.id));
  check(
    "identity: a stale-version city change writes nothing",
    lost.kind === "conflict" &&
      staleRow?.cityId === from.id &&
      staleRow.version === stale.version &&
      (await cityOf(staying.id)) === from.id &&
      (await repo.historyOf(stale.id)).length === 0,
    `${lost.kind}, ${staleRow?.cityId === from.id}`,
  );

  // (3) The funnel's two shelter steps, each once.
  const funnel = funnelRepo(db);
  const steps = [];
  for (const kind of [
    "first_draft",
    "first_draft",
    "first_published",
    "first_published",
  ] as const) {
    steps.push(await funnel.record(kind, stale.id, NOW));
  }
  check(
    "funnel: first_draft and first_published record once, the repeat is already_recorded",
    steps.join(",") === "recorded,already_recorded,recorded,already_recorded",
    steps.join(","),
  );

  // (4) The draft cap's count.
  const capped = await shelterIn(from.id);
  for (let n = 0; n < 30; n += 1) {
    await animalRepo(db).insert(makeDraftAnimal({ shelterId: capped.id }), from.id);
  }
  const counts = await kabinetAnimalRepo(db).countsByKind(capped.id);
  check(
    "draft cap: countsByKind returns numbers and sees 30 drafts",
    typeof counts.draft === "number" && counts.draft === 30 && counts.published === 0,
    JSON.stringify(counts),
  );

  // (5) The history page with its cities, the old city retired since (fixture rows only).
  await db.update(cities).set({ retiredInEdition: "smoke" }).where(eq(cities.id, from.id));
  const page = await repo.historyPage({ shelterId: shelter.id, after: null, limit: 10 });
  const ids = page.items.flatMap((entry) =>
    entry.kind === "city_changed" ? [entry.from, entry.to] : [],
  );
  const named = Object.fromEntries(
    (await cityRepo(db).findByIds(ids)).map((city) => [city.id, city.name.uk]),
  );
  check(
    "history page: a city_changed row's cities are named, the retired one included",
    typeof named[from.id] === "string" && typeof named[to.id] === "string",
    `${Object.keys(named).length} named`,
  );
  return out;
}
