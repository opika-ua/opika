import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { R2CleanupClient } from "../src/image-pipeline/r2-cleanup-client";
import {
  IMAGE_VARIANT_NAMES,
  type ImageFormat,
  LOGO_VARIANT_NAMES,
  photoSourceObjectKeyFor,
  variantObjectKey,
} from "../src/image-pipeline/variants";
import {
  DEFAULT_MAX_PHOTOS_PER_RUN,
  formatReport,
  parseCleanupArgs,
  photosAmong,
  runR2Cleanup,
} from "../src/r2-cleanup";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { recordScan, trackedUnreferencedObjects } from "../src/repos/r2-cleanup-repo";
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
 * for the real R2 client - the fake implements exactly `R2CleanupClient`'s
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

/** Pet card PR 4: a real shelter row with a logo set. */
async function insertShelterWithLogo(storageKey: string) {
  const city = makeCity();
  await cityRepo(db).insert(city);
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id } as never,
    logo: { storageKey, width: 160, height: 160 },
  });
  await shelterRepo(db).insert(shelter);
}

/**
 * An in-memory stand-in for `R2CleanupClient`, holding exactly the keys
 * it's told about. `listObjectKeys` filters by prefix, same as the real
 * client - `runR2Cleanup` now calls it once per namespace
 * (`CLEANUP_PREFIXES`), and a fake that ignored the prefix would double-list
 * every key once PR 4 added the second call.
 */
function fakeR2(objectKeys: string[]): R2CleanupClient & { remaining(): string[] } {
  const store = new Set(objectKeys);
  return {
    async listObjectKeys(prefix) {
      return [...store].filter((key) => key.startsWith(prefix));
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
    const orphan = variantObjectKey("animals/orphan/1", "card", "webp");
    const r2 = fakeR2([orphan]);

    const report = await runR2Cleanup(db, r2, NOW, { commit: false, graceDays: undefined });

    expect(report.scanned).toBe(1);
    expect(report.newlyTracked).toBe(1);
    // Just tracked, at the same instant as "now" - 0 elapsed days, under the default 7-day grace.
    expect(report.dueForDeletion).toEqual([]);
    expect(report.deleted).toEqual([]);
    expect(r2.remaining()).toEqual([orphan]); // untouched
  });

  it("commits: deletes exactly what's past the grace period, re-checking first, and nulls dangling snapshots", async () => {
    const orphan = variantObjectKey("animals/orphan/1", "card", "webp");
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

  it("deletes an unreferenced photo's AVIF objects with its WebP ones, and keeps a referenced photo's both (GDPR retention)", async () => {
    await insertAnimalWithPhotos(["animals/kept/1"]);
    const objectsOf = (storageKey: string) =>
      (["webp", "avif"] as const).flatMap((format) =>
        (["thumb", "card", "detail", "mid", "compact"] as const).map((variant) =>
          variantObjectKey(storageKey, variant, format),
        ),
      );
    const kept = objectsOf("animals/kept/1");
    const orphan = objectsOf("animals/orphan/1");
    const r2 = fakeR2([...kept, ...orphan]);

    await runR2Cleanup(db, r2, NOW, { commit: false, graceDays: undefined });
    const past = new Date(NOW.getTime() + 8 * 24 * 60 * 60 * 1000);
    const report = await runR2Cleanup(db, r2, past, { commit: true, graceDays: undefined });

    expect([...report.deleted].sort()).toEqual([...orphan].sort());
    expect(orphan.filter((key) => key.endsWith(".avif"))).toHaveLength(5);
    expect(r2.remaining().sort()).toEqual([...kept].sort());
  });

  it("scans both namespaces in one run: an orphaned animal photo and an orphaned shelter logo, a referenced logo left alone (pet card PR 4)", async () => {
    await insertShelterWithLogo("shelters/kept/logo/1");
    const keptLogo = variantObjectKey("shelters/kept/logo/1", "small", "webp");
    const orphanLogo = variantObjectKey("shelters/orphan/logo/1", "small", "webp");
    const orphanPhoto = variantObjectKey("animals/orphan/1", "card", "webp");
    const r2 = fakeR2([keptLogo, orphanLogo, orphanPhoto]);

    await runR2Cleanup(db, r2, NOW, { commit: false, graceDays: undefined });
    const past = new Date(NOW.getTime() + 8 * 24 * 60 * 60 * 1000);
    const report = await runR2Cleanup(db, r2, past, { commit: true, graceDays: undefined });

    expect(report.scanned).toBe(3);
    expect([...report.dueForDeletion].sort()).toEqual([orphanLogo, orphanPhoto].sort());
    expect([...report.deleted].sort()).toEqual([orphanLogo, orphanPhoto].sort());
    expect(r2.remaining()).toEqual([keptLogo]); // referenced, untouched
  });

  it("never touches an object under shelters/ that isn't logo-shaped, even past the grace period (Tier 1 review, PR #220, finding 1 - the STOP)", async () => {
    // This job's bucket scan has to list the whole shelters/ prefix (R2
    // takes one literal prefix per call, and shelter ids vary), so the
    // thing actually protecting a shelter's other data is isKeyOwnedByThisJob
    // narrowing that listing down - not the reference check, which would
    // mark any of these "unreferenced" just as readily as a real orphaned
    // logo, with nothing to tell them apart once they're in scope.
    const evidence = "shelters/s/evidence/statute.pdf";
    const cover = variantObjectKey("shelters/s/cover/abc", "card", "webp");
    const readme = "shelters/readme.txt";
    const r2 = fakeR2([evidence, cover, readme]);

    await runR2Cleanup(db, r2, NOW, { commit: false, graceDays: undefined });
    const past = new Date(NOW.getTime() + 8 * 24 * 60 * 60 * 1000);
    const report = await runR2Cleanup(db, r2, past, { commit: true, graceDays: undefined });

    expect(report.scanned).toBe(0);
    expect(report.dueForDeletion).toEqual([]);
    expect(report.deleted).toEqual([]);
    expect(r2.remaining().sort()).toEqual([cover, evidence, readme].sort());
  });

  it("deletes exactly what stillUnreferenced approves, not everything in dueForDeletion (Tier 1 review, PR #200, finding re: the re-check being bypassable)", async () => {
    // A mock, not a real race: proves runR2Cleanup's delete step is driven
    // by stillUnreferenced's own return value, which removing the call
    // entirely (the mutation the delta review tried) would break even
    // though no other test here catches it - those tests all arrange for
    // recordScan's own self-heal to clear a re-referenced key before it
    // ever reaches `due`, so they never actually exercise this call.
    const kept = variantObjectKey("animals/kept/1", "card", "webp");
    const filteredOut = variantObjectKey("animals/filtered-out/1", "card", "webp");
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

  it("re-checks before each batch, not once for the whole run (Tier 1 review, PR #200, finding re: 'before each batch' never being built)", async () => {
    // 1500 due keys cross the 1000-key batch boundary (DELETE_BATCH_SIZE in
    // r2-cleanup-run.ts, matching r2-cleanup-client.ts's own real network
    // batch). A spy counts how many times - and with how many keys -
    // stillUnreferenced is actually called.
    const keys = Array.from({ length: 1500 }, (_, i) => `animals/batch-${i}/card.webp`);
    await recordScan(db, keys, NOW);

    const calls: number[] = [];
    vi.resetModules();
    vi.doMock("../src/repos/r2-cleanup-repo", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/repos/r2-cleanup-repo")>();
      return {
        ...actual,
        stillUnreferenced: async (db2: unknown, candidates: readonly string[]) => {
          calls.push(candidates.length);
          return actual.stillUnreferenced(db2 as never, candidates);
        },
      };
    });
    const { runR2Cleanup: mockedRunR2Cleanup } = await import("../src/r2-cleanup-run");
    const past = new Date(NOW.getTime() + 8 * 24 * 60 * 60 * 1000);
    const r2 = fakeR2(keys);

    const report = await mockedRunR2Cleanup(db, r2, past, {
      commit: true,
      graceDays: undefined,
      maxPhotos: 5000,
    });

    expect(calls).toEqual([1000, 500]); // two batches, re-checked separately
    expect(report.deleted).toHaveLength(1500);
    vi.doUnmock("../src/repos/r2-cleanup-repo");
  }, 30_000);

  it("a key referenced again before the second run is never deleted, even past the grace period", async () => {
    const key = variantObjectKey("animals/a/1", "card", "webp");
    const r2 = fakeR2([key]);
    await runR2Cleanup(db, r2, NOW, { commit: false, graceDays: undefined }); // tracked

    await insertAnimalWithPhotos(["animals/a/1"]); // referenced again before the delete run

    const past = new Date(NOW.getTime() + 8 * 24 * 60 * 60 * 1000);
    const report = await runR2Cleanup(db, r2, past, { commit: true, graceDays: undefined });

    // The scan step itself untracks it (recordScan's own self-heal), so it
    // never reaches "due" in the first place - belt and suspenders with the
    // stillUnreferenced re-check inside runR2Cleanup.
    expect(report.dueForDeletion).toEqual([]);
    expect(r2.remaining()).toEqual([key]);
  });

  it("not yet past the (default) grace period: tracked, but not due", async () => {
    const orphan = variantObjectKey("animals/orphan/1", "card", "webp");
    const r2 = fakeR2([orphan]);
    await runR2Cleanup(db, r2, NOW, { commit: false, graceDays: undefined });

    const soon = new Date(NOW.getTime() + 24 * 60 * 60 * 1000); // 1 day later, default grace is 7
    const report = await runR2Cleanup(db, r2, soon, { commit: true, graceDays: undefined });

    expect(report.dueForDeletion).toEqual([]);
    expect(report.deleted).toEqual([]);
    expect(r2.remaining()).toEqual([orphan]);
  });

  it("an explicit graceDays: 0 treats the same-instant scan as already due", async () => {
    const orphan = variantObjectKey("animals/orphan/1", "card", "webp");
    const r2 = fakeR2([orphan]);

    const report = await runR2Cleanup(db, r2, NOW, { commit: true, graceDays: 0 });

    expect(report.dueForDeletion).toEqual([orphan]);
    expect(report.deleted).toEqual([orphan]);
  });
});

/** One photo as uploads store it today: the five variants in each format, and its kept source. */
const photoObjects = (storageKey: string, formats: readonly ImageFormat[] = ["webp", "avif"]) => [
  ...formats.flatMap((format) =>
    IMAGE_VARIANT_NAMES.map((variant) => variantObjectKey(storageKey, variant, format)),
  ),
  photoSourceObjectKeyFor(storageKey, randomUUID()),
];
const photos = (n: number, formats?: readonly ImageFormat[]) =>
  Array.from({ length: n }, (_, i) => photoObjects(`animals/orphan/${i}`, formats)).flat();
/** Photos stored before AVIF and not yet backfilled: six objects each. */
const olderPhotos = (n: number) => photos(n, ["webp"]);

describe("photosAmong (what the cap counts, owner 2026-11-16)", () => {
  const key = "animals/a/1";

  it("counts a photo's variants in both formats and its kept source as one photo, and a logo's as one", () => {
    expect(photoObjects(key)).toHaveLength(11);
    expect(photosAmong(photoObjects(key))).toBe(1);
    expect(photosAmong(photoObjects(key, ["webp"]))).toBe(1);
    expect(
      photosAmong(LOGO_VARIANT_NAMES.map((v) => variantObjectKey("shelters/s/logo/1", v, "webp"))),
    ).toBe(1);
    expect(photosAmong([...photos(3), ...photoObjects("animals/b/1", ["webp"])])).toBe(4);
  });

  it("counts each key of no known shape as a photo of its own, even several in one photo's folder", () => {
    // Grouped by folder alone, the first three would be one photo.
    const strays = [
      `${key}/original.jpg`,
      `${key}/thumb.jpg`,
      `${key}/card.png`,
      "shelters/s/logo/1/small.avif",
      "animals/loose.webp",
      `${key}/source-1.webp`,
    ];
    expect(photosAmong(strays)).toBe(strays.length);
    expect(photosAmong([...photoObjects(key), ...strays])).toBe(1 + strays.length);
  });

  it("never folds a stray key into a photo, even one named exactly like the photo's folder", () => {
    expect(photosAmong([key, variantObjectKey(key, "card", "webp")])).toBe(2);
  });

  it("a second kept source in one photo's folder counts as a photo of its own", () => {
    const twoSources = [
      variantObjectKey(key, "card", "webp"),
      photoSourceObjectKeyFor(key, randomUUID()),
      photoSourceObjectKeyFor(key, randomUUID()),
    ];
    expect(photosAmong(twoSources)).toBe(2);
  });
});

describe("the per-run cap, in photos", () => {
  const orphans = (n: number) =>
    Array.from({ length: n }, (_, i) => variantObjectKey(`animals/orphan/${i}`, "card", "webp"));
  const later = new Date(NOW.getTime() + 8 * 24 * 60 * 60 * 1000);

  /** Tracks `keys` now, then commits once they're past the grace period. */
  async function dueLater(keys: string[], maxPhotos?: number) {
    const r2 = fakeR2(keys);
    await runR2Cleanup(db, r2, NOW, { commit: false, graceDays: undefined });
    const report = await runR2Cleanup(db, r2, later, {
      commit: true,
      graceDays: undefined,
      maxPhotos,
    });
    return { r2, report };
  }

  it("deletes everything when the due photos are at the cap", async () => {
    const { r2, report } = await dueLater(orphans(3), 3);
    expect(report.capTripped).toBeNull();
    expect(report.deleted).toHaveLength(3);
    expect(r2.remaining()).toEqual([]);
  });

  it("over the cap deletes nothing, reports the counts, and leaves the rows tracked", async () => {
    const { r2, report } = await dueLater(orphans(4), 3);
    expect(report.capTripped).toEqual({ photos: 4, objects: 4, cap: 3 });
    expect(report.deleted).toEqual([]);
    expect(r2.remaining()).toHaveLength(4);
    expect(await trackedUnreferencedObjects(db)).toHaveLength(4);
    expect(formatReport(report, "Deleted").join("\n")).toContain(
      "REFUSED: 4 photos (4 objects) are due, over the cap of 3 photos per run. Nothing was deleted.",
    );
  });

  it("the override lets the same backlog through, and a dry run is never capped but shows the count", async () => {
    const r2 = fakeR2(orphans(4));
    await runR2Cleanup(db, r2, NOW, { commit: false, graceDays: undefined });
    const dry = await runR2Cleanup(db, r2, later, {
      commit: false,
      graceDays: undefined,
      maxPhotos: 1,
    });
    expect(dry.capTripped).toBeNull();
    expect(r2.remaining()).toHaveLength(4);
    expect(formatReport(dry, "Would delete").join("\n")).toContain(
      "Photos and logos among them (what the cap counts): 4",
    );
    const report = await runR2Cleanup(db, r2, later, {
      commit: true,
      graceDays: undefined,
      maxPhotos: 10,
    });
    expect(report.deleted).toHaveLength(4);
  });

  it("is 100 photos by default: 100 photos of eleven objects (1100 objects) all go", async () => {
    const keys = photos(DEFAULT_MAX_PHOTOS_PER_RUN);
    expect(keys).toHaveLength(1100);
    const { r2, report } = await dueLater(keys);
    expect(report.capTripped).toBeNull();
    expect(report.duePhotos).toBe(100);
    expect(report.deleted).toHaveLength(1100);
    expect(r2.remaining()).toEqual([]);
  }, 30_000);

  it("101 such photos are refused whole, and only an explicit override lets them through", async () => {
    const { r2, report } = await dueLater(photos(DEFAULT_MAX_PHOTOS_PER_RUN + 1));
    expect(report.capTripped).toEqual({ photos: 101, objects: 1111, cap: 100 });
    expect(report.deleted).toEqual([]);
    expect(r2.remaining()).toHaveLength(1111);
    expect(await trackedUnreferencedObjects(db)).toHaveLength(1111);
    expect(formatReport(report, "Deleted").join("\n")).toContain(
      "REFUSED: 101 photos (1111 objects) are due, over the cap of 100 photos per run. Nothing was deleted. Check why before raising it (--max-photos <n>).",
    );

    const raised = await runR2Cleanup(db, r2, later, {
      commit: true,
      graceDays: undefined,
      maxPhotos: 101,
    });
    expect(raised.capTripped).toBeNull();
    expect(raised.deleted).toHaveLength(1111);
  }, 30_000);

  it("183 photos stored before AVIF (six objects each: 1098, under the old 1100-object cap) are refused", async () => {
    const keys = olderPhotos(183);
    expect(keys).toHaveLength(1098);
    const { r2, report } = await dueLater(keys);
    expect(report.capTripped).toEqual({ photos: 183, objects: 1098, cap: 100 });
    expect(report.deleted).toEqual([]);
    expect(r2.remaining()).toHaveLength(1098);
  }, 30_000);

  it("a mix of six- and eleven-object photos and a logo counts each photo once", async () => {
    const keys = [
      ...olderPhotos(60),
      ...Array.from({ length: 39 }, (_, i) => photoObjects(`animals/newer/${i}`)).flat(),
      ...LOGO_VARIANT_NAMES.map((v) => variantObjectKey("shelters/s/logo/1", v, "webp")),
    ];
    expect(keys).toHaveLength(60 * 6 + 39 * 11 + 2);
    const r2 = fakeR2(keys);
    await runR2Cleanup(db, r2, NOW, { commit: false, graceDays: undefined });

    const under = await runR2Cleanup(db, r2, later, {
      commit: true,
      graceDays: undefined,
      maxPhotos: 99,
    });
    expect(under.capTripped).toEqual({ photos: 100, objects: 791, cap: 99 });
    expect(r2.remaining()).toHaveLength(791);

    const atDefault = await runR2Cleanup(db, r2, later, { commit: true, graceDays: undefined });
    expect(atDefault.capTripped).toBeNull();
    expect(atDefault.deleted).toHaveLength(791);
  }, 30_000);

  it("objects of no known shape count one by one, so they can only tighten the cap", async () => {
    // 100 real photos are at the default cap; one stray object in a photo's folder takes it over.
    const stray = "animals/orphan/0/original.jpg";
    const { r2, report } = await dueLater([...photos(100), stray]);
    expect(report.capTripped).toEqual({ photos: 101, objects: 1101, cap: 100 });
    expect(r2.remaining()).toHaveLength(1101);
    expect(r2.remaining()).toContain(stray);
  }, 30_000);

  it("refuses a cap that isn't a positive whole number, deleting nothing", async () => {
    const r2 = fakeR2(orphans(2));
    await runR2Cleanup(db, r2, NOW, { commit: false, graceDays: undefined });
    for (const maxPhotos of [0, -1, 1.5, Number.NaN]) {
      await expect(
        runR2Cleanup(db, r2, later, { commit: true, graceDays: undefined, maxPhotos }),
      ).rejects.toThrow(/positive whole number/);
    }
    expect(r2.remaining()).toHaveLength(2);
  });
});
describe("formatReport", () => {
  it("names the heading-appropriate fields; a dry run never claims a deletion count", () => {
    const base = {
      scanned: 3,
      newlyTracked: 1,
      clearedBack: 0,
      dueForDeletion: ["animals/x/1/card.webp"],
      duePhotos: 1,
      deleted: [],
      failed: [],
      snapshotsNulled: 0,
      capTripped: null,
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
        duePhotos: 1,
        deleted: [],
        failed: [{ key: "k", message: "AccessDenied" }],
        snapshotsNulled: 0,
        capTripped: null,
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

  it("reads --max-photos, and refuses a missing, zero, fractional, non-decimal, unsafe or repeated value", () => {
    expect(parseCleanupArgs(argv("--expect", "ep-x", "--commit", "--max-photos", "500"))).toEqual({
      kind: "ok",
      commit: true,
      graceDays: undefined,
      maxPhotos: 500,
    });
    for (const bad of [
      [],
      ["0"],
      ["1.5"],
      ["abc"],
      [""],
      ["1e9"],
      ["0x64"],
      ["5.0"],
      ["-5"],
      ["9007199254740993"],
    ]) {
      expect(parseCleanupArgs(argv("--expect", "ep-x", "--max-photos", ...bad)).kind).toBe(
        "refused",
      );
    }
    expect(
      parseCleanupArgs(argv("--expect", "ep-x", "--max-photos", "5", "--max-photos", "6")).kind,
    ).toBe("refused");
  });

  it("refuses the old object-count --max-delete, pointing to --max-photos, never reading it as a photo count", () => {
    for (const args of [
      ["--max-delete", "1100"],
      ["--max-delete"],
      ["--max-photos", "5", "--max-delete", "500"],
    ]) {
      expect(parseCleanupArgs(argv("--expect", "ep-x", "--commit", ...args))).toEqual({
        kind: "refused",
        reason:
          "--max-delete is gone: the cap counts photos and logos now, not objects; give --max-photos <n> instead (the dry run prints the photo count)",
      });
    }
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
    // read-only preview should be allowed too - an open question for him
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
    // Number("") and Number(" ") are both 0 - the most destructive value
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
        "--shelter is not an argument this script takes; it takes --expect <ep>, --commit, --prod, --grace-days <n> and --max-photos <n>",
    });
  });
});
