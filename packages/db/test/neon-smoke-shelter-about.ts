import { randomUUID } from "node:crypto";
import { ShelterDescriptionInputSchema } from "@opika/contracts";
import type {
  CityId,
  LocalizedText,
  ModeratorId,
  ShelterActor,
  ShelterAdminId,
  ShelterHistoryEntry,
} from "@opika/domain";
import { eq, sql } from "drizzle-orm";
import type { Database } from "../src/client";
import { executeRows } from "../src/raw-rows";
import { cityRepo } from "../src/repos/city-repo";
import { kabinetShelterRepo } from "../src/repos/kabinet-shelter-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { shelters } from "../src/schema/shelters";
import { makeCity, makeShelter } from "../src/test-utils/index";
import { outcomeOf } from "./neon-smoke-verified-data";

type Outcome = { name: string; ok: boolean; detail: string };

const NOW = new Date();
const CHECK = "shelters_description_en_check";
const text = (uk: string): LocalizedText => ({ uk, en: null });

/**
 * Migration 0026 and the shelter-description write path on Neon's driver: the column is nullable,
 * English never stands without Ukrainian, null clears through the audited write, a stored text over
 * the cap reads in full, and a stale save loses in both orders. The HTTP-level cases (the cap's
 * BAD_REQUEST, a support-mode refusal) live in apps/web's tests: this package has no router.
 * Rows stay on the child branch, which is thrown away.
 */
export async function runShelterAboutSmoke(db: Database): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });

  const city = makeCity({ id: randomUUID() as CityId, slug: `smoke-${randomUUID()}` as never });
  await cityRepo(db).insertMissing([city]);
  const tag = randomUUID().slice(0, 6);
  const seed = async (label: string, description: LocalizedText | null) => {
    const shelter = makeShelter({
      displayName: `Смоук про притулок ${label} ${tag}`,
      description,
      publicLocation: { precision: "city", cityId: city.id, district: null },
    });
    await shelterRepo(db).insert(shelter);
    return shelter;
  };
  const admin: ShelterActor = {
    kind: "shelter_admin",
    shelterAdminId: randomUUID() as ShelterAdminId,
  };
  const operator: ShelterActor = { kind: "moderator", moderatorId: randomUUID() as ModeratorId };
  const write = (
    shelterId: string,
    expectedVersion: number,
    actor: ShelterActor,
    previous: LocalizedText | null,
    next: LocalizedText | null,
  ) =>
    kabinetShelterRepo(db).applyAudited({
      shelterId: shelterId as never,
      expectedVersion,
      change: { kind: "description", description: next },
      entry: { kind: "description_changed", at: NOW, actor, previous, next },
      historyId: randomUUID(),
      now: NOW,
    });

  // 0026 shape: nullable column, the CHECK present, and no existing row violates it.
  const column = await executeRows<{ is_nullable: string }>(
    db,
    sql`SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'shelters' AND column_name = 'description_uk'`,
  );
  const constraint = await executeRows<{ conname: string }>(
    db,
    sql`SELECT conname FROM pg_constraint WHERE conrelid = 'public.shelters'::regclass AND conname = ${CHECK}`,
  );
  const violating = await executeRows<{ n: string }>(
    db,
    sql`SELECT count(*)::text AS n FROM shelters WHERE NOT (description_uk IS NOT NULL OR (description_en_text IS NULL AND description_en_provenance IS NULL))`,
  );
  check(
    "0026: description_uk is nullable, the CHECK exists and every existing row satisfies it",
    column[0]?.is_nullable === "YES" && constraint.length === 1 && violating[0]?.n === "0",
    `nullable ${column[0]?.is_nullable}, ${constraint.length} constraint(s), ${violating[0]?.n} violating row(s)`,
  );

  // A shelter created with no description stores SQL NULL in all three columns.
  const none = await seed("none", null);
  const [noneRow] = await db
    .select({
      uk: shelters.descriptionUk,
      en: shelters.descriptionEnText,
      provenance: shelters.descriptionEnProvenance,
    })
    .from(shelters)
    .where(eq(shelters.id, none.id));
  check(
    "0026: a shelter created with no description stores NULL in all three columns and reads back null",
    noneRow !== undefined &&
      noneRow.uk === null &&
      noneRow.en === null &&
      noneRow.provenance === null &&
      (await shelterRepo(db).findById(none.id))?.description === null,
    JSON.stringify(noneRow),
  );

  // English without Ukrainian is refused by the CHECK, whichever English column carries it.
  const refusals = [
    await outcomeOf(async () => {
      await db.execute(
        sql`UPDATE shelters SET description_en_text = 'Text', description_en_provenance = 'human' WHERE id = ${none.id}`,
      );
    }),
    await outcomeOf(async () => {
      await db.execute(sql`UPDATE shelters SET description_en_text = 'Text' WHERE id = ${none.id}`);
    }),
  ];
  check(
    "0026: English text without Ukrainian is refused by shelters_description_en_check",
    refusals.every((r) => r === CHECK),
    refusals.join(", "),
  );

  // The cap is on input only: exactly 1,500 passes the input schema and is stored and read back.
  const atCap = text("я".repeat(1500));
  const accepted = ShelterDescriptionInputSchema.safeParse(atCap).success;
  const refusedOver = !ShelterDescriptionInputSchema.safeParse(text("я".repeat(1501))).success;
  const capped = await seed("cap", null);
  const addResult = await write(capped.id, 0, admin, null, atCap);
  const readCap = (await shelterRepo(db).findById(capped.id))?.description?.uk.length;
  check(
    "write: 1,500 characters pass the input schema (1,501 do not) and are stored in full over an empty description",
    accepted && refusedOver && addResult.kind === "ok" && readCap === 1500,
    `schema ok ${accepted}, 1501 refused ${refusedOver}, ${addResult.kind}, read ${readCap}`,
  );

  // null clears: three NULL columns, a history line with previous and next, the actor named.
  const cleared = await seed("clear", text("Опис, який зникне"));
  const clearResult = await write(cleared.id, 0, admin, cleared.description, null);
  const [clearedRow] = await db
    .select({
      uk: shelters.descriptionUk,
      en: shelters.descriptionEnText,
      version: shelters.version,
    })
    .from(shelters)
    .where(eq(shelters.id, cleared.id));
  const clearedHistory = await kabinetShelterRepo(db).historyOf(cleared.id);
  const clearedLine = clearedHistory[0];
  check(
    "write: null clears all three columns, bumps the version and records previous and next",
    clearResult.kind === "ok" &&
      clearedRow?.uk === null &&
      clearedRow.en === null &&
      clearedRow.version === 1 &&
      clearedLine?.kind === "description_changed" &&
      clearedLine.previous?.uk === "Опис, який зникне" &&
      clearedLine.next === null &&
      clearedLine.actor.kind === "shelter_admin",
    `${clearResult.kind}, ${JSON.stringify(clearedRow)}, ${clearedLine?.kind}`,
  );

  // A stored text over the cap (the first real shelter's merged text is ~1,737) reads in full.
  const long = "я".repeat(1737);
  const over = await seed("over", text(long));
  const readOver = (await shelterRepo(db).findById(over.id))?.description?.uk;
  const trim = await write(over.id, 0, operator, text(long), text("Коротко"));
  const overHistory = (await kabinetShelterRepo(db).historyOf(over.id))[0];
  check(
    "read: a stored description of 1,737 characters reads in full, and survives in history after a trim",
    readOver === long &&
      trim.kind === "ok" &&
      overHistory?.kind === "description_changed" &&
      overHistory.previous?.uk === long,
    `read ${readOver?.length}, ${trim.kind}`,
  );

  // CONFLICT, shelter first: the operator's save at the old version loses and the text is the shelter's.
  const first = await seed("race-a", text("Було"));
  const shelterSave = await write(first.id, 0, admin, first.description, text("Від притулку"));
  const operatorLate = await write(first.id, 0, operator, first.description, text("Від оператора"));
  const firstHistory = await kabinetShelterRepo(db).historyOf(first.id);
  check(
    "CONFLICT: shelter saves first, the operator's save at the same version is refused, one history line naming the shelter",
    shelterSave.kind === "ok" &&
      operatorLate.kind === "conflict" &&
      (await shelterRepo(db).findById(first.id))?.description?.uk === "Від притулку" &&
      firstHistory.length === 1 &&
      firstHistory[0]?.kind === "description_changed" &&
      firstHistory[0].actor.kind === "shelter_admin",
    `${shelterSave.kind} then ${operatorLate.kind}, ${firstHistory.length} line(s)`,
  );

  // CONFLICT, operator first.
  const second = await seed("race-b", text("Було"));
  const operatorSave = await write(
    second.id,
    0,
    operator,
    second.description,
    text("Від оператора"),
  );
  const shelterLate = await write(second.id, 0, admin, second.description, text("Від притулку"));
  const secondHistory = await kabinetShelterRepo(db).historyOf(second.id);
  check(
    "CONFLICT: operator saves first, the shelter's save at the same version is refused, one history line naming the operator",
    operatorSave.kind === "ok" &&
      shelterLate.kind === "conflict" &&
      (await shelterRepo(db).findById(second.id))?.description?.uk === "Від оператора" &&
      secondHistory.length === 1 &&
      secondHistory[0]?.kind === "description_changed" &&
      secondHistory[0].actor.kind === "moderator",
    `${operatorSave.kind} then ${shelterLate.kind}, ${secondHistory.length} line(s)`,
  );

  // Old history: a freshness_sentence_changed line written before still reads back.
  const legacy = await seed("legacy", text("Опис"));
  const oldLine: ShelterHistoryEntry = {
    kind: "freshness_sentence_changed",
    at: NOW,
    actor: admin,
    previous: null,
    next: text("Оновлюємо щосуботи"),
  };
  await kabinetShelterRepo(db).appendHistory({
    id: randomUUID(),
    shelterId: legacy.id,
    entry: oldLine,
  });
  const legacyRead = await kabinetShelterRepo(db).historyOf(legacy.id);
  check(
    "history: an old freshness_sentence_changed line still reads back",
    legacyRead.length === 1 &&
      legacyRead[0]?.kind === "freshness_sentence_changed" &&
      legacyRead[0].next?.uk === "Оновлюємо щосуботи",
    legacyRead.map((entry) => entry.kind).join(", "),
  );

  return out;
}
