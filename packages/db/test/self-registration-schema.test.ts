import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ModeratorId, ShelterHistoryEntry, ShelterId } from "@opika/domain";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cityRepo } from "../src/repos/city-repo";
import { funnelRepo } from "../src/repos/funnel-repo";
import { kabinetShelterRepo } from "../src/repos/kabinet-shelter-repo";
import { registrationFactsRepo } from "../src/repos/registration-facts-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { authUser } from "../src/schema/auth";
import { shelterHistory } from "../src/schema/shelter-history";
import { shelters } from "../src/schema/shelters";
import {
  makeCity,
  makeShelter as makeShelterAnywhere,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
let cityId: string;
beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  cityId = city.id;
});

/** A shelter in the test's city (the row's `city_id` references `cities`). */
const makeShelter = (overrides: Parameters<typeof makeShelterAnywhere>[0] = {}) =>
  makeShelterAnywhere({
    publicLocation: { ...makeShelterAnywhere().publicLocation, cityId } as never,
    ...overrides,
  });

const NOW = new Date("2026-11-20T10:00:00.000Z");
const MOD = "11111111-1111-4111-8111-111111111111" as ModeratorId;
const EVIDENCE = { items: [], submittedAt: NOW };

async function user(email: string, emailVerified: boolean): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(authUser).values({
    id,
    name: "Олена",
    email,
    emailVerified,
    createdAt: NOW,
    updatedAt: NOW,
  });
  return id;
}

/** An application as the registration write leaves it (Agent 1 writes the registrant too). */
async function application(registrantUserId: string | null): Promise<ShelterId> {
  const shelter = makeShelter({
    verification: { status: "application", appliedAt: NOW, evidence: EVIDENCE },
  });
  await shelterRepo(db).insert(shelter);
  if (registrantUserId !== null) {
    await db.update(shelters).set({ registrantUserId }).where(eq(shelters.id, shelter.id));
  }
  return shelter.id;
}

/** The constraint a refused statement names, wherever the driver wraps it. */
async function refusal(statement: Promise<unknown>): Promise<string> {
  try {
    await statement;
  } catch (error) {
    let e: unknown = error;
    for (let depth = 0; depth < 5 && e !== null && typeof e === "object"; depth += 1) {
      const pg = e as { constraint_name?: unknown; constraint?: unknown; cause?: unknown };
      const named = pg.constraint_name ?? pg.constraint;
      if (typeof named === "string") return named;
      e = pg.cause;
    }
    throw error;
  }
  throw new Error("the statement was accepted");
}

describe("0028: the database holds the self-registration facts together", () => {
  it("an application inserted through the repo is self-registered, dated by its own state", async () => {
    const id = await application(null);
    const [row] = await db.select().from(shelters).where(eq(shelters.id, id));
    expect(row).toMatchObject({ registrationSource: "self_registration", appliedAt: NOW });
  });

  it("an operator-created shelter stays operator, with no application date", async () => {
    const shelter = makeShelter();
    await shelterRepo(db).insert(shelter);
    const [row] = await db.select().from(shelters).where(eq(shelters.id, shelter.id));
    expect(row).toMatchObject({ registrationSource: "operator", appliedAt: null });
  });

  it("refuses an application that isn't self-registered", async () => {
    const id = await application(null);
    expect(
      await refusal(
        db
          .update(shelters)
          .set({ registrationSource: "operator", appliedAt: null })
          .where(eq(shelters.id, id)),
      ),
    ).toBe("shelters_application_is_self_registered");
  });

  it("refuses a self-registered shelter without its application date", async () => {
    const id = await application(null);
    expect(
      await refusal(db.update(shelters).set({ appliedAt: null }).where(eq(shelters.id, id))),
    ).toBe("shelters_self_registration_facts");
  });

  it("refuses an unknown registration source", async () => {
    const shelter = makeShelter();
    await shelterRepo(db).insert(shelter);
    expect(
      await refusal(
        db.execute(
          sql`UPDATE shelters SET registration_source = 'imported' WHERE id = ${shelter.id}`,
        ),
      ),
    ).toBe("shelters_registration_source_check");
  });

  it("refuses an application-refusal date on a shelter that isn't rejected", async () => {
    const id = await application(null);
    expect(
      await refusal(
        db.update(shelters).set({ applicationRejectedAt: NOW }).where(eq(shelters.id, id)),
      ),
    ).toBe("shelters_application_rejected_at_check");
  });

  it("one registrant, one shelter", async () => {
    const registrant = await user("lapa@example.org", false);
    await application(registrant);
    expect(await refusal(application(registrant))).toBe("shelters_registrant_user_id_unique");
  });

  it("an application needs no legal entity or address; verified still does", async () => {
    const id = await application(null);
    await db
      .update(shelters)
      .set({
        legalEntity: null,
        premises: null,
        exactAddress: null,
        exactLat: null,
        exactLng: null,
      })
      .where(eq(shelters.id, id));
    expect(
      await refusal(
        db.execute(
          sql`UPDATE shelters SET verification_status = 'verified', registration_source = 'operator', applied_at = NULL WHERE id = ${id}`,
        ),
      ),
    ).toBe("shelters_verified_has_verified_data");
  });
});

describe("registrationFactsRepo", () => {
  it("reads an operator-created shelter as operator", async () => {
    const shelter = makeShelter();
    await shelterRepo(db).insert(shelter);
    expect(await registrationFactsRepo(db).of(shelter.id)).toEqual({ source: "operator" });
  });

  it("reads the registrant's email status", async () => {
    const unconfirmed = await application(await user("one@example.org", false));
    const confirmed = await application(await user("two@example.org", true));
    expect(await registrationFactsRepo(db).of(unconfirmed)).toEqual({
      source: "self_registration",
      appliedAt: NOW,
      email: "unconfirmed",
    });
    expect(await registrationFactsRepo(db).of(confirmed)).toMatchObject({ email: "confirmed" });
  });

  it("reads an erased registrant as unconfirmed, and a missing shelter as null", async () => {
    const id = await application(null);
    expect(await registrationFactsRepo(db).of(id)).toMatchObject({ email: "unconfirmed" });
    expect(await registrationFactsRepo(db).of(crypto.randomUUID() as ShelterId)).toBeNull();
  });
});

describe("funnelRepo", () => {
  it("records each step once per shelter", async () => {
    const id = await application(null);
    expect(await funnelRepo(db).record("registered", id, NOW)).toBe("recorded");
    expect(await funnelRepo(db).record("registered", id, NOW)).toBe("already_recorded");
    expect(await funnelRepo(db).record("first_draft", id, NOW)).toBe("recorded");
  });

  it("counts every step since the window's start, a missing step as 0", async () => {
    const a = await application(null);
    const b = await application(null);
    await funnelRepo(db).record("registered", a, new Date("2026-10-01T00:00:00.000Z"));
    await funnelRepo(db).record("registered", b, NOW);
    await funnelRepo(db).record("email_confirmed", b, NOW);
    expect(await funnelRepo(db).countsSince(new Date("2026-11-01T00:00:00.000Z"))).toEqual({
      registered: 1,
      email_confirmed: 1,
      first_draft: 0,
      approved: 0,
      first_published: 0,
    });
  });

  it("keeps the counts when the application is deleted", async () => {
    const id = await application(null);
    await funnelRepo(db).record("registered", id, NOW);
    await db.delete(shelters).where(eq(shelters.id, id));
    expect((await funnelRepo(db).countsSince(NOW)).registered).toBe(1);
  });
});

/**
 * The two hand-written statements at the end of 0028, run against rows in the shape they were
 * written for (before 0028), so the backfill is tested, not just applied.
 */
describe("0028's backfills", () => {
  const migration = readFileSync(
    fileURLToPath(new URL("../drizzle/0028_self_registration.sql", import.meta.url)),
    "utf8",
  );
  const backfills = migration
    .split("--> statement-breakpoint")
    .map((statement) => statement.replace(/^\s*--.*$/gm, "").trim())
    .filter((statement) => statement.startsWith("UPDATE"));

  it("has exactly the two", () => {
    expect(backfills).toHaveLength(2);
  });

  it("gives every older rejection the verification stage, and the rename lines an actor", async () => {
    const rejected = makeShelter({
      verification: {
        status: "rejected",
        rejectedAt: NOW,
        rejectedBy: MOD,
        reason: { code: "spam", note: null },
        stage: "verification",
        evidence: EVIDENCE,
      },
    });
    await shelterRepo(db).insert(rejected);
    await db.execute(
      sql`UPDATE shelters SET verification = verification - 'stage' WHERE id = ${rejected.id}`,
    );
    const oldRename = {
      kind: "display_name_changed",
      at: NOW.toISOString(),
      moderatorId: MOD,
      from: "Лапа",
      to: "Лапа допомоги",
    };
    await db.execute(
      sql`INSERT INTO shelter_history (id, shelter_id, kind, at, entry) VALUES (${crypto.randomUUID()}, ${rejected.id}, 'display_name_changed', ${NOW.toISOString()}, ${JSON.stringify(oldRename)}::jsonb)`,
    );

    for (const statement of backfills) await db.execute(sql.raw(statement));
    // Idempotent: a second run changes nothing.
    for (const statement of backfills) await db.execute(sql.raw(statement));

    const [row] = await db.select().from(shelters).where(eq(shelters.id, rejected.id));
    expect(row?.verification).toMatchObject({ status: "rejected", stage: "verification" });
    const [line] = await db.select().from(shelterHistory);
    expect(line?.entry as ShelterHistoryEntry).toEqual({
      kind: "display_name_changed",
      at: NOW,
      actor: { kind: "moderator", moderatorId: MOD },
      from: "Лапа",
      to: "Лапа допомоги",
    });
  });
});

/**
 * Code from before 0028 can write the old shapes between the production migration and the deploy
 * (owner, 2026-11-18): every read normalises them, so those rows can't break a screen after it.
 */
describe("rows written in the old shapes after 0028 read as today's", () => {
  it("a stage-less rejection and a moderatorId rename line, through the repositories", async () => {
    const rejected = makeShelter({
      verification: {
        status: "rejected",
        rejectedAt: NOW,
        rejectedBy: MOD,
        reason: { code: "spam", note: null },
        stage: "verification",
        evidence: EVIDENCE,
      },
    });
    await shelterRepo(db).insert(rejected);
    await db.execute(
      sql`UPDATE shelters SET verification = verification - 'stage' WHERE id = ${rejected.id}`,
    );
    const oldRename = {
      kind: "display_name_changed",
      at: NOW.toISOString(),
      moderatorId: MOD,
      from: "Лапа",
      to: "Лапа допомоги",
    };
    await db.execute(
      sql`INSERT INTO shelter_history (id, shelter_id, kind, at, entry) VALUES (${crypto.randomUUID()}, ${rejected.id}, 'display_name_changed', ${NOW.toISOString()}, ${JSON.stringify(oldRename)}::jsonb)`,
    );

    expect((await shelterRepo(db).findById(rejected.id))?.verification).toMatchObject({
      status: "rejected",
      stage: "verification",
    });
    expect(await kabinetShelterRepo(db).historyOf(rejected.id)).toEqual([
      {
        kind: "display_name_changed",
        at: NOW,
        actor: { kind: "moderator", moderatorId: MOD },
        from: "Лапа",
        to: "Лапа допомоги",
      },
    ]);
  });
});
