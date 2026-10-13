import type { ShelterAdminId, ShelterHistoryEntry } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cityRepo } from "../src/repos/city-repo";
import { kabinetShelterRepo } from "../src/repos/kabinet-shelter-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { makeCity, makeShelter, setupTestDatabase, truncateAll } from "../src/test-utils/index";

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const NOW = new Date("2026-10-13T10:00:00.000Z");
const ADMIN = {
  kind: "shelter_admin",
  shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
} as const;
const NEXT_CONTACT = {
  primary: { kind: "telegram", handle: "lapa_shelter" },
  additional: [],
} as const;

async function shelter() {
  const city = makeCity();
  await cityRepo(db).insert(city);
  const s = makeShelter({ publicLocation: { ...makeShelter().publicLocation, cityId: city.id } });
  await shelterRepo(db).insert(s);
  return s;
}

const contactEntry = (previous: unknown): ShelterHistoryEntry =>
  ({
    kind: "contact_changed",
    at: NOW,
    actor: ADMIN,
    previous,
    next: NEXT_CONTACT,
  }) as ShelterHistoryEntry;

describe("kabinetShelterRepo.applyAudited", () => {
  it("writes the change, bumps the version, and records exactly one history entry", async () => {
    const s = await shelter();
    const repo = kabinetShelterRepo(db);
    const result = await repo.applyAudited({
      shelterId: s.id,
      expectedVersion: 0,
      change: { kind: "contact", contact: NEXT_CONTACT },
      entry: contactEntry(s.contact),
      historyId: "h1",
      now: NOW,
    });
    expect(result).toEqual({ kind: "ok" });
    const after = await shelterRepo(db).findById(s.id);
    expect(after?.contact).toEqual(NEXT_CONTACT);
    expect(after?.version).toBe(1);
    expect(after?.lastUpdatedAt).toEqual(NOW);
    expect(await repo.historyOf(s.id)).toEqual([contactEntry(s.contact)]);
  });

  /**
   * The point of one statement: a lost compare-and-set changes nothing and
   * leaves no history behind. Two separate statements, or `db.batch`, would
   * record a change that never happened.
   */
  it("on a stale version writes nothing at all: no change, no version bump, no history", async () => {
    const s = await shelter();
    const repo = kabinetShelterRepo(db);
    const result = await repo.applyAudited({
      shelterId: s.id,
      expectedVersion: 7,
      change: { kind: "contact", contact: NEXT_CONTACT },
      entry: contactEntry(s.contact),
      historyId: "h1",
      now: NOW,
    });
    expect(result).toEqual({ kind: "conflict" });
    const after = await shelterRepo(db).findById(s.id);
    expect(after?.contact).toEqual(s.contact);
    expect(after?.version).toBe(0);
    expect(await repo.historyOf(s.id)).toEqual([]);
  });

  it("two writers from the same read: the second gets conflict", async () => {
    const s = await shelter();
    const repo = kabinetShelterRepo(db);
    const write = (historyId: string) =>
      repo.applyAudited({
        shelterId: s.id,
        expectedVersion: 0,
        change: { kind: "contact", contact: NEXT_CONTACT },
        entry: contactEntry(s.contact),
        historyId,
        now: NOW,
      });
    expect(await write("h1")).toEqual({ kind: "ok" });
    expect(await write("h2")).toEqual({ kind: "conflict" });
    expect(await repo.historyOf(s.id)).toHaveLength(1);
  });

  it("writes the freshness sentence into its two columns", async () => {
    const s = await shelter();
    const sentence = { uk: "Оновлюємо щосуботи", en: null };
    await kabinetShelterRepo(db).applyAudited({
      shelterId: s.id,
      expectedVersion: 0,
      change: { kind: "freshness_sentence", freshnessSentence: sentence },
      entry: {
        kind: "freshness_sentence_changed",
        at: NOW,
        actor: ADMIN,
        previous: s.freshnessSentence,
        next: sentence,
      },
      historyId: "h1",
      now: NOW,
    });
    expect((await shelterRepo(db).findById(s.id))?.freshnessSentence).toEqual(sentence);
  });

  it("keeps verification_status in step with the verification it writes", async () => {
    const s = await shelter();
    const paused = {
      ...s.verification,
      status: "paused",
      pausedAt: NOW,
      pausedBy: ADMIN,
      reason: { code: "relocation", note: null },
    } as never;
    await kabinetShelterRepo(db).applyAudited({
      shelterId: s.id,
      expectedVersion: 0,
      change: { kind: "verification", verification: paused },
      entry: {
        kind: "verification",
        event: { type: "pause", at: NOW, actor: ADMIN, reason: { code: "relocation", note: null } },
        from: "verified",
        to: "paused",
      },
      historyId: "h1",
      now: NOW,
    });
    const after = await shelterRepo(db).findById(s.id);
    expect(after?.verification.status).toBe("paused");
    const [row] = await db.query.shelters.findMany({ where: (t, { eq }) => eq(t.id, s.id) });
    expect(row?.verificationStatus).toBe("paused");
  });
});
