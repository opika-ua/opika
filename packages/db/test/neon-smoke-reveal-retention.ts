import { randomUUID } from "node:crypto";
import type { AdopterId, AnimalId, CityId, RevealId, ShelterId } from "@opika/domain";
import { count, inArray, lt, sql } from "drizzle-orm";
import type { Database } from "../src/client";
import { executeRows } from "../src/raw-rows";
import { adopterRepo } from "../src/repos/adopter-repo";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { revealRepo } from "../src/repos/reveal-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { reveals } from "../src/schema/reveals";
import {
  makeAdopter,
  makeAnimal,
  makeCity,
  makeReveal,
  makeShelter,
} from "../src/test-utils/index";

type Outcome = { name: string; ok: boolean; detail: string };

const DAY = 86_400_000;

/**
 * Migration 0031 and the 90-day reveal clean-up on Neon's driver. A production copy holds old
 * reveals of its own that the drain also takes, so totals are compared with a count taken just
 * before and this run's rows are checked by id.
 */
export async function runRevealRetentionSmoke(db: Database): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });
  const now = new Date();
  const ago = (ms: number) => new Date(now.getTime() - ms);

  const [index] = await executeRows<{ definition: string }>(
    db,
    sql`SELECT indexdef AS definition FROM pg_indexes
        WHERE tablename = 'reveals' AND indexname = 'reveals_revealed_at_idx'`,
  );
  check(
    "0031: reveals_revealed_at_idx exists, on revealed_at alone",
    index !== undefined && /\(revealed_at\)$/.test(index.definition),
    index?.definition ?? "missing",
  );

  const city = makeCity({ id: randomUUID() as CityId, slug: `smoke-${randomUUID()}` as never });
  await cityRepo(db).insert(city);
  const shelter = makeShelter({
    id: randomUUID() as ShelterId,
    premises: { kind: "address", address: { ...makeShelter().premises.address, cityId: city.id } },
  });
  await shelterRepo(db).insert(shelter);
  const animals: AnimalId[] = [];
  for (let i = 0; i < 2; i++) {
    const animal = makeAnimal({ id: randomUUID() as never, shelterId: shelter.id });
    await animalRepo(db).insert(animal, city.id);
    animals.push(animal.id);
  }
  // No sessions: as the 30-day cap leaves them, only the reveals hold these adopters.
  const adopter = async (createdAt: Date) => {
    const row = makeAdopter({ id: randomUUID() as AdopterId, createdAt });
    await adopterRepo(db).insert(row);
    return row.id;
  };
  const fixture = {
    past: { adopter: await adopter(ago(120 * DAY)), at: ago(90 * DAY + 1) },
    atLimit: { adopter: await adopter(ago(100 * DAY)), at: ago(90 * DAY) },
    young: { adopter: await adopter(ago(120 * DAY)), at: ago(DAY) },
  };
  const revealIds: Record<string, RevealId> = {};
  for (const [label, { adopter: adopterId, at }] of Object.entries(fixture)) {
    const reveal = makeReveal({
      id: randomUUID() as never,
      adopterId,
      animalId: animals[label === "young" ? 1 : 0] as AnimalId,
      shelterId: shelter.id,
      revealedAt: at,
    });
    await revealRepo(db).insert(reveal);
    revealIds[label] = reveal.id;
  }

  const [due] = await db
    .select({ n: count() })
    .from(reveals)
    .where(lt(reveals.revealedAt, ago(90 * DAY)));
  let deleted = 0;
  const runs: number[] = [];
  for (let i = 0; i < 100; i++) {
    const n = await revealRepo(db).deleteExpired(now);
    runs.push(n);
    deleted += n;
    if (n === 0) break;
  }
  const left = (
    await db
      .select({ id: reveals.id })
      .from(reveals)
      .where(inArray(reveals.id, Object.values(revealIds)))
  ).map((r) => r.id);
  const keptLabels = Object.keys(revealIds)
    .filter((label) => left.includes(revealIds[label] as RevealId))
    .sort();
  check(
    "reveal clean-up: every reveal past 90 days deleted (batched), exactly 90 days and younger kept",
    deleted >= 1 && deleted === Number(due?.n) && keptLabels.join(",") === "atLimit,young",
    `deleted ${deleted} of ${due?.n} due (runs ${runs.join(",")}); kept of this run's: ${keptLabels.join(",")}`,
  );

  let orphans = 0;
  for (let i = 0; i < 100; i++) {
    const n = await adopterRepo(db).deleteOrphaned(now);
    orphans += n;
    if (n === 0) break;
  }
  const adoptersLeft: string[] = [];
  for (const [label, { adopter: adopterId }] of Object.entries(fixture)) {
    if ((await adopterRepo(db).findById(adopterId)) !== null) adoptersLeft.push(label);
  }
  check(
    "after it, the orphaned-adopter sweep takes the adopter whose only reveal went, keeps the others",
    orphans >= 1 && adoptersLeft.sort().join(",") === "atLimit,young",
    `deleted ${orphans} (at least this run's 1); kept of this run's: ${adoptersLeft.join(",")}`,
  );

  return out;
}
