import type { AdopterId, AdopterProfile, CityId, ShelterId } from "@opika/domain";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabaseWithClient } from "../src/client";
import { adopterRepo, ORPHAN_ADOPTER_MIN_AGE_MS } from "../src/repos/adopter-repo";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { revealRepo } from "../src/repos/reveal-repo";
import { adopterSessionLapse, type SessionRow, sessionRepo } from "../src/repos/session-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { swipeRepo } from "../src/repos/swipe-repo";
import { adopters } from "../src/schema/adopters";
import { reveals } from "../src/schema/reveals";
import { sessions } from "../src/schema/sessions";
import { swipes } from "../src/schema/swipes";
import {
  makeAdopter,
  makeAnimal,
  makeCity,
  makeReveal,
  makeShelter,
  makeSwipe,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";
import { TEST_DATABASE_URL } from "../src/test-utils/setup";

/**
 * Audit F6, the owner's S3 scope (2026-10-29): the clean-up cron deletes anonymous sessions past
 * decision 13's limits (30 days since creation, 7 since last seen) and adopters nothing can reach
 * or needs, a bounded batch per run. Real Postgres; `now` is a parameter, never the clock.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const NOW = new Date("2026-10-29T03:00:00.000Z");
const DAY = 86_400_000;
const at = (ms: number) => new Date(NOW.getTime() + ms);
/** Literals, not the policy constant, so a changed limit fails here. */
const ABSOLUTE_MS = 30 * DAY;
const IDLE_MS = 7 * DAY;

let hashSeq = 0;
const nextHash = () => (hashSeq++).toString(16).padStart(64, "0");

async function adopterWith(createdAt: Date, overrides: Partial<AdopterProfile> = {}) {
  const adopter = makeAdopter({ createdAt, ...overrides });
  await adopterRepo(db).insert(adopter);
  return adopter.id;
}

async function sessionOf(adopterId: AdopterId, createdAt: Date, lastSeenAt: Date) {
  const row: SessionRow = { tokenHash: nextHash(), adopterId, createdAt, lastSeenAt };
  await sessionRepo(db).insert(row);
  return row;
}

const sessionHashes = async () =>
  (await db.select({ h: sessions.tokenHash }).from(sessions)).map((r) => r.h).sort();
const adopterIds = async () =>
  (await db.select({ id: adopters.id }).from(adopters)).map((r) => r.id).sort();

describe("sessionRepo.deleteLapsed", () => {
  it("deletes exactly the sessions validateSession refuses, at both limits' boundaries", async () => {
    const adopter = await adopterWith(at(-60 * DAY));
    const cases = {
      live: await sessionOf(adopter, at(-DAY), at(-60_000)),
      atAbsolute: await sessionOf(adopter, at(-ABSOLUTE_MS), at(-60_000)),
      pastAbsolute: await sessionOf(adopter, at(-ABSOLUTE_MS - 1), at(-60_000)),
      atIdle: await sessionOf(adopter, at(-10 * DAY), at(-IDLE_MS)),
      pastIdle: await sessionOf(adopter, at(-10 * DAY), at(-IDLE_MS - 1)),
      pastBoth: await sessionOf(adopter, at(-40 * DAY), at(-40 * DAY)),
    };
    // The validator's own predicate decides the same rows, so the two can't drift apart.
    const refused = Object.values(cases).filter((row) => adopterSessionLapse(row, NOW) !== null);
    expect(refused.map((row) => row.tokenHash).sort()).toEqual(
      [cases.pastAbsolute, cases.pastIdle, cases.pastBoth].map((row) => row.tokenHash).sort(),
    );

    expect(await sessionRepo(db).deleteLapsed(NOW)).toBe(3);
    expect(await sessionHashes()).toEqual(
      [cases.live, cases.atAbsolute, cases.atIdle].map((row) => row.tokenHash).sort(),
    );
  });

  it("deletes at most `limit` per run, the rest on later runs, then nothing (idempotent)", async () => {
    const adopter = await adopterWith(at(-60 * DAY));
    for (let i = 0; i < 5; i++) await sessionOf(adopter, at(-40 * DAY), at(-40 * DAY));
    const live = await sessionOf(adopter, at(-DAY), at(-DAY));

    const runs = [];
    for (let i = 0; i < 4; i++) runs.push(await sessionRepo(db).deleteLapsed(NOW, 2));
    expect(runs).toEqual([2, 2, 1, 0]);
    expect(await sessionHashes()).toEqual([live.tokenHash]);
  });
});

describe("sessionRepo.deleteLapsed against a concurrent touch", () => {
  /**
   * The comment on `deleteLapsed` says a session a request touches while the clean-up runs is kept.
   * Forced, not raced: the touch holds the row's lock in an open transaction, the clean-up (on a
   * second connection) is confirmed blocked on it, then the touch commits. The batch subquery
   * already chose the row on its old `last_seen_at`; only the lapse test on the DELETE itself
   * keeps it.
   */
  it("keeps a session touched between the batch's pick and its delete", async () => {
    const adopter = await adopterWith(at(-60 * DAY));
    const row = await sessionOf(adopter, at(-DAY), at(-IDLE_MS - 1));
    const secondClient = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
    const watcherClient = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
    try {
      let cleanupRun: Promise<number> = Promise.resolve(-1);
      await db.transaction(async (tx) => {
        await tx
          .update(sessions)
          .set({ lastSeenAt: at(-60_000) })
          .where(eq(sessions.tokenHash, row.tokenHash));
        cleanupRun = sessionRepo(createDatabaseWithClient(secondClient)).deleteLapsed(NOW);
        // Wait until the clean-up really is blocked on the touch's row lock, not merely started.
        for (let waited = 0; ; waited += 50) {
          const [r] = await watcherClient<{ waiting: number }[]>`
            SELECT count(*)::int AS waiting FROM pg_locks WHERE NOT granted`;
          if (Number(r?.waiting) > 0) break;
          if (waited > 5000) throw new Error("the clean-up never waited on the touch");
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      });
      expect(await cleanupRun).toBe(0);
      expect(await sessionHashes()).toEqual([row.tokenHash]);
    } finally {
      await watcherClient.end();
      await secondClient.end();
    }
  });
});

describe("adopterRepo.deleteOrphaned", () => {
  async function animalAt(): Promise<{ shelterId: ShelterId; animalId: string }> {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = makeShelter({
      exactAddress: {
        line1: "вул. Тестова 1",
        line2: null,
        postalCode: "01001",
        cityId: city.id as CityId,
        district: null,
        coordinates: { lat: 50.45, lng: 30.52 },
      },
    });
    await shelterRepo(db).insert(shelter);
    const animal = makeAnimal({ shelterId: shelter.id });
    await animalRepo(db).insert(animal, city.id);
    return { shelterId: shelter.id, animalId: animal.id };
  }

  it("deletes an old anonymous adopter with nothing left, keeps every adopter that has something", async () => {
    const old = at(-ORPHAN_ADOPTER_MIN_AGE_MS - 1);
    const orphan = await adopterWith(old);
    const withLapsedSession = await adopterWith(old);
    await sessionOf(withLapsedSession, old, old);
    const withSwipe = await adopterWith(old);
    const withReveal = await adopterWith(old);
    const { shelterId, animalId } = await animalAt();
    await swipeRepo(db).record(makeSwipe({ adopterId: withSwipe, animalId: animalId as never }));
    const reveal = makeReveal({ adopterId: withReveal, animalId: animalId as never, shelterId });
    await revealRepo(db).insert(reveal);
    const account = await adopterWith(old, {
      identity: {
        kind: "account",
        accountId: crypto.randomUUID() as never,
        email: "adopter@example.org",
      },
    });
    // Mid-bootstrap (adopter written, session not yet) or simply young: never touched.
    const young = await adopterWith(at(-ORPHAN_ADOPTER_MIN_AGE_MS));

    expect(await adopterRepo(db).deleteOrphaned(NOW)).toBe(1);
    expect(await adopterIds()).toEqual(
      [withLapsedSession, withSwipe, withReveal, account, young].sort(),
    );
    expect(await adopterIds()).not.toContain(orphan);
    // What the kept adopters carry is untouched.
    expect((await db.select().from(swipes)).map((r) => r.adopterId)).toEqual([withSwipe]);
    expect((await db.select().from(reveals)).map((r) => r.id)).toEqual([reveal.id]);
    expect(await sessionHashes()).toHaveLength(1);
  });

  it("an adopter whose session the same run deleted goes in that run (sessions first)", async () => {
    const old = at(-ORPHAN_ADOPTER_MIN_AGE_MS - DAY);
    const adopter = await adopterWith(old);
    await sessionOf(adopter, old, old);
    expect(await sessionRepo(db).deleteLapsed(NOW)).toBe(1);
    expect(await adopterRepo(db).deleteOrphaned(NOW)).toBe(1);
    expect(await adopterIds()).toEqual([]);
  });

  it("deletes at most `limit` per run, then nothing (idempotent)", async () => {
    for (let i = 0; i < 3; i++) await adopterWith(at(-40 * DAY));
    const runs = [];
    for (let i = 0; i < 3; i++) runs.push(await adopterRepo(db).deleteOrphaned(NOW, 2));
    expect(runs).toEqual([2, 1, 0]);
    expect(await adopterIds()).toEqual([]);
  });

  it("the minimum age is the session's 30-day cap plus a day (a literal, so a change fails here)", () => {
    expect(ORPHAN_ADOPTER_MIN_AGE_MS).toBe(31 * DAY);
  });
});
