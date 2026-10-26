import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { R2CleanupClient } from "../src/image-pipeline/r2-cleanup-client";
import { variantObjectKey } from "../src/image-pipeline/variants";
import { formatReport, parseCleanupArgs, runR2Cleanup } from "../src/r2-cleanup";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { trackedUnreferencedObjects } from "../src/repos/r2-cleanup-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import {
  makeAnimal,
  makeCity,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";

/**
 * GDPR photo retention (`docs/gdpr-analysis.md`). `runR2Cleanup` is tested
 * against a real, migrated local database with an in-memory fake standing in
 * for the real R2 client — the fake implements exactly `R2CleanupClient`'s
 * contract (list, delete in batches, report per-key failure), so a swap to
 * the real `createR2CleanupClient` changes nothing this test depends on.
 * The real client itself is tested only against a separate test bucket
 * (Oleksii's own requirement), not here.
 */
let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const NOW = new Date("2026-10-25T10:00:00.000Z");
const photo = (storageKey: string) => ({ storageKey, width: 800, height: 1000, alt: null });

async function insertAnimalWithPhotos(storageKeys: string[]) {
  const city = makeCity();
  await cityRepo(db).insert(city);
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id } as never,
  });
  await shelterRepo(db).insert(shelter);
  const animal = makeAnimal({ shelterId: shelter.id, photos: storageKeys.map(photo) as never });
  await animalRepo(db).insert(animal, city.id as never);
}

/** An in-memory stand-in for `R2CleanupClient`, holding exactly the keys it's told about. */
function fakeR2(objectKeys: string[]): R2CleanupClient & { remaining(): string[] } {
  const store = new Set(objectKeys);
  return {
    async listObjectKeys() {
      return [...store];
    },
    async deleteObjects(keys) {
      const deleted: string[] = [];
      for (const key of keys) {
        if (store.has(key)) {
          store.delete(key);
          deleted.push(key);
        }
      }
      return { deleted, failed: [] };
    },
    remaining: () => [...store],
  };
}

describe("runR2Cleanup", () => {
  it("a dry run scans, tracks and reports what's due, but deletes nothing", async () => {
    const orphan = variantObjectKey("animals/orphan/1", "card");
    const r2 = fakeR2([orphan]);

    const report = await runR2Cleanup(db, r2, NOW, { commit: false, graceDays: undefined });

    expect(report.scanned).toBe(1);
    expect(report.newlyTracked).toBe(1);
    // Just tracked, at the same instant as "now" — 0 elapsed days, under the default 7-day grace.
    expect(report.dueForDeletion).toEqual([]);
    expect(report.deleted).toEqual([]);
    expect(r2.remaining()).toEqual([orphan]); // untouched
  });

  it("commits: deletes exactly what's past the grace period, re-checking first, and nulls dangling snapshots", async () => {
    const orphan = variantObjectKey("animals/orphan/1", "card");
    const r2 = fakeR2([orphan]);
    // First scan tracks it as first-seen-unreferenced at NOW.
    await runR2Cleanup(db, r2, NOW, { commit: false, graceDays: undefined });

    const past = new Date(NOW.getTime() + 8 * 24 * 60 * 60 * 1000); // 8 days later
    const report = await runR2Cleanup(db, r2, past, { commit: true, graceDays: undefined });

    expect(report.dueForDeletion).toEqual([orphan]);
    expect(report.deleted).toEqual([orphan]);
    expect(r2.remaining()).toEqual([]);
    expect(await trackedUnreferencedObjects(db)).toEqual([]);
  });

  it("deletes exactly what stillUnreferenced approves, not everything in dueForDeletion (Tier 1 review, PR #200, finding re: the re-check being bypassable)", async () => {
    // A mock, not a real race: proves runR2Cleanup's delete step is driven
    // by stillUnreferenced's own return value, which removing the call
    // entirely (the mutation the delta review tried) would break even
    // though no other test here catches it — those tests all arrange for
    // recordScan's own self-heal to clear a re-referenced key before it
    // ever reaches `due`, so they never actually exercise this call.
    const kept = variantObjectKey("animals/kept/1", "card");
    const filteredOut = variantObjectKey("animals/filtered-out/1", "card");
    vi.resetModules();
    vi.doMock("../src/repos/r2-cleanup-repo", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/repos/r2-cleanup-repo")>();
      return {
        ...actual,
        stillUnreferenced: async (_db: unknown, candidates: readonly string[]) =>
          candidates.filter((key) => key !== filteredOut),
      };
    });
    const { runR2Cleanup: mockedRunR2Cleanup } = await import("../src/r2-cleanup-run");
    const r2 = fakeR2([kept, filteredOut]);
    await mockedRunR2Cleanup(db, r2, NOW, { commit: false, graceDays: undefined });

    const past = new Date(NOW.getTime() + 8 * 24 * 60 * 60 * 1000);
    const report = await mockedRunR2Cleanup(db, r2, past, { commit: true, graceDays: undefined });

    expect([...report.dueForDeletion].sort()).toEqual([filteredOut, kept].sort());
    expect(report.deleted).toEqual([kept]); // stillUnreferenced's mock excluded filteredOut
    expect(r2.remaining()).toEqual([filteredOut]);
    vi.doUnmock("../src/repos/r2-cleanup-repo");
  });

  it("a key referenced again before the second run is never deleted, even past the grace period", async () => {
    const key = variantObjectKey("animals/a/1", "card");
    const r2 = fakeR2([key]);
    await runR2Cleanup(db, r2, NOW, { commit: false, graceDays: undefined }); // tracked

    await insertAnimalWithPhotos(["animals/a/1"]); // referenced again before the delete run

    const past = new Date(NOW.getTime() + 8 * 24 * 60 * 60 * 1000);
    const report = await runR2Cleanup(db, r2, past, { commit: true, graceDays: undefined });

    // The scan step itself untracks it (recordScan's own self-heal), so it
    // never reaches "due" in the first place — belt and suspenders with the
    // stillUnreferenced re-check inside runR2Cleanup.
    expect(report.dueForDeletion).toEqual([]);
    expect(r2.remaining()).toEqual([key]);
  });

  it("not yet past the (default) grace period: tracked, but not due", async () => {
    const orphan = variantObjectKey("animals/orphan/1", "card");
    const r2 = fakeR2([orphan]);
    await runR2Cleanup(db, r2, NOW, { commit: false, graceDays: undefined });

    const soon = new Date(NOW.getTime() + 24 * 60 * 60 * 1000); // 1 day later, default grace is 7
    const report = await runR2Cleanup(db, r2, soon, { commit: true, graceDays: undefined });

    expect(report.dueForDeletion).toEqual([]);
    expect(report.deleted).toEqual([]);
    expect(r2.remaining()).toEqual([orphan]);
  });

  it("an explicit graceDays: 0 treats the same-instant scan as already due", async () => {
    const orphan = variantObjectKey("animals/orphan/1", "card");
    const r2 = fakeR2([orphan]);

    const report = await runR2Cleanup(db, r2, NOW, { commit: true, graceDays: 0 });

    expect(report.dueForDeletion).toEqual([orphan]);
    expect(report.deleted).toEqual([orphan]);
  });
});

describe("formatReport", () => {
  it("names the heading-appropriate fields; a dry run never claims a deletion count", () => {
    const base = {
      scanned: 3,
      newlyTracked: 1,
      clearedBack: 0,
      dueForDeletion: ["animals/x/1/card.webp"],
      deleted: [],
      failed: [],
      snapshotsNulled: 0,
    };
    const dry = formatReport(base, "Would delete").join("\n");
    expect(dry).toContain("Would delete");
    expect(dry).not.toContain("Deleted:");

    const committed = formatReport(
      { ...base, deleted: ["animals/x/1/card.webp"], snapshotsNulled: 1 },
      "Deleted",
    ).join("\n");
    expect(committed).toContain("Deleted: 1");
    expect(committed).toContain("Reveal snapshots nulled: 1");
  });

  it("surfaces a failed delete without hiding it", () => {
    const lines = formatReport(
      {
        scanned: 1,
        newlyTracked: 0,
        clearedBack: 0,
        dueForDeletion: ["k"],
        deleted: [],
        failed: [{ key: "k", message: "AccessDenied" }],
        snapshotsNulled: 0,
      },
      "Deleted",
    ).join("\n");
    expect(lines).toContain("Failed (left in place, left tracked): 1");
    expect(lines).toContain("k: AccessDenied");
  });
});

describe("parseCleanupArgs", () => {
  const argv = (...args: string[]) => ["node", "r2-cleanup.ts", ...args];

  it("defaults to a dry run with no grace-days override", () => {
    expect(parseCleanupArgs(argv("--expect", "ep-x"))).toEqual({
      kind: "ok",
      commit: false,
      graceDays: undefined,
    });
  });

  it("reads --commit and --grace-days together", () => {
    expect(parseCleanupArgs(argv("--expect", "ep-x", "--commit", "--grace-days", "0"))).toEqual({
      kind: "ok",
      commit: true,
      graceDays: 0,
    });
  });

  it("--prod is accepted and otherwise ignored by this parser (checked by the production guard)", () => {
    expect(parseCleanupArgs(argv("--expect", "ep-x", "--commit", "--prod"))).toEqual({
      kind: "ok",
      commit: true,
      graceDays: undefined,
    });
  });

  it("refuses --grace-days without --commit", () => {
    // His R2-B1 words, verbatim: "--grace-days 0 allowed only in a manual
    // run with --commit". A Tier 1 delta review raised whether a
    // read-only preview should be allowed too — an open question for him
    // (R2-F4), not decided here either way.
    expect(parseCleanupArgs(argv("--expect", "ep-x", "--grace-days", "0"))).toEqual({
      kind: "refused",
      reason:
        "--grace-days needs --commit (a non-default grace period is honoured only on a real run)",
    });
  });

  it("refuses a non-integer or negative --grace-days", () => {
    expect(parseCleanupArgs(argv("--commit", "--grace-days", "-1")).kind).toBe("refused");
    expect(parseCleanupArgs(argv("--commit", "--grace-days", "1.5")).kind).toBe("refused");
    expect(parseCleanupArgs(argv("--commit", "--grace-days", "nope")).kind).toBe("refused");
    expect(parseCleanupArgs(argv("--commit", "--grace-days")).kind).toBe("refused");
  });

  it("refuses an empty or whitespace-only --grace-days, never reading it as 0", () => {
    // Number("") and Number(" ") are both 0 — the most destructive value
    // this flag takes (Tier 1 review, PR #200, note 10).
    expect(parseCleanupArgs(argv("--commit", "--grace-days", "")).kind).toBe("refused");
    expect(parseCleanupArgs(argv("--commit", "--grace-days", "   ")).kind).toBe("refused");
  });

  it("refuses --grace-days given twice, and --expect given twice", () => {
    expect(parseCleanupArgs(argv("--commit", "--grace-days", "0", "--grace-days", "1")).kind).toBe(
      "refused",
    );
    expect(parseCleanupArgs(argv("--expect", "ep-x", "--expect", "ep-y")).kind).toBe("refused");
  });

  it("refuses an argument it doesn't take", () => {
    expect(parseCleanupArgs(argv("--shelter", "x"))).toEqual({
      kind: "refused",
      reason:
        "--shelter is not an argument this script takes; it takes --expect <ep>, --commit, --prod and --grace-days <n>",
    });
  });
});
