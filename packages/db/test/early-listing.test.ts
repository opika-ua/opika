import { randomUUID } from "node:crypto";
import {
  EARLY_LISTING_DAYS,
  EVERYONE_SCOPE,
  type ModeratorId,
  NO_FILTERS,
  publicListingBasisOf,
  publicListingBasisOfColumns,
  type ShelterVerification,
  VERIFICATION_STATUSES,
} from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { galleryRepo } from "../src/repos/gallery-repo";
import { kabinetAnimalRepo } from "../src/repos/kabinet-animal-repo";
import { kabinetShelterRepo } from "../src/repos/kabinet-shelter-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import {
  makeAnimal,
  makeCity,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const NOW = new Date("2026-11-04T12:00:00.000Z");
const DAY = 86_400_000;
const MOD = randomUUID() as ModeratorId;
const AT = new Date("2026-08-05T00:00:00.000Z");
const EVIDENCE = { items: [], submittedAt: AT };
const pausedFacts = {
  verifiedAt: AT,
  verifiedBy: MOD,
  pausedAt: AT,
  pausedBy: { kind: "moderator", moderatorId: MOD },
  reason: { code: "relocation", note: null },
} as const;

const stateOf = (status: (typeof VERIFICATION_STATUSES)[number]): ShelterVerification => {
  switch (status) {
    case "pending":
      return { status, submittedAt: AT, evidence: EVIDENCE };
    case "under_review":
      return { status, startedAt: AT, reviewerId: MOD, evidence: EVIDENCE };
    case "verified":
      return { status, verifiedAt: AT, verifiedBy: MOD, evidence: EVIDENCE };
    case "rejected":
      return {
        status,
        rejectedAt: AT,
        rejectedBy: MOD,
        reason: { code: "spam", note: null },
        evidence: EVIDENCE,
      };
    case "paused":
      return { status, ...pausedFacts, evidence: EVIDENCE };
    case "suspended":
      return {
        status,
        suspendedAt: AT,
        suspendedBy: MOD,
        reason: { code: "unresponsive", note: null },
        priorState: { status: "paused", ...pausedFacts },
        evidence: EVIDENCE,
      };
  }
};

const OFFSETS: Record<string, Date | null> = {
  none: null,
  future: new Date(NOW.getTime() + 1),
  now: NOW,
  insideByOneMs: new Date(NOW.getTime() - EARLY_LISTING_DAYS * DAY + 1),
  exactlyAtExpiry: new Date(NOW.getTime() - EARLY_LISTING_DAYS * DAY),
  pastByOneMs: new Date(NOW.getTime() - EARLY_LISTING_DAYS * DAY - 1),
};

async function seedCity() {
  const city = makeCity();
  await cityRepo(db).insert(city);
  return city;
}

async function seedShelter(
  cityId: ReturnType<typeof makeCity>["id"],
  status: (typeof VERIFICATION_STATUSES)[number],
  since: Date | null,
) {
  const base = makeShelter();
  const shelter = makeShelter({
    verification: stateOf(status),
    earlyListingSince: since,
    publicLocation: { ...base.publicLocation, cityId },
  });
  await shelterRepo(db).insert(shelter);
  const animal = makeAnimal({
    shelterId: shelter.id,
    name: `${status}-${since?.getTime() ?? "x"}`,
    everServedAt: null,
  });
  await animalRepo(db).insert(animal, cityId);
  return { shelter, animal };
}

describe("the SQL discoverability predicate matches the domain rule", () => {
  it("every status x permission offset: list, counts, scoped page, card view and detail join agree", async () => {
    const city = await seedCity();
    const cases = [];
    for (const status of VERIFICATION_STATUSES) {
      for (const [offset, since] of Object.entries(OFFSETS)) {
        const seeded = await seedShelter(city.id, status, since);
        const basis = publicListingBasisOf(
          seeded.shelter.verification,
          since === null ? { kind: "not_allowed" } : { kind: "allowed", since },
          NOW,
        );
        // The column twin is what the card view uses; it must agree with the full rule.
        expect(publicListingBasisOfColumns(status, since, NOW)).toBe(basis.kind);
        cases.push({ ...seeded, basis, label: `${status}/${offset}` });
      }
    }
    const gallery = galleryRepo(db);
    const page = {
      filters: NO_FILTERS,
      sort: "freshest",
      page: 1,
      pageSize: 100,
      now: NOW,
    } as const;
    const expectedIds = cases
      .filter((c) => c.basis.kind !== "not_listed")
      .map((c) => c.animal.id)
      .sort();

    const list = await gallery.list({ ...page, scope: EVERYONE_SCOPE });
    expect(list.items.map((a) => a.id).sort()).toEqual(expectedIds);
    expect(list.totalMatching).toBe(expectedIds.length);

    const cards = await gallery.listCards({ ...page, scope: EVERYONE_SCOPE });
    for (const item of cards.items) {
      const found = cases.find((c) => c.animal.id === item.animal.id);
      expect(item.shelter.verification, found?.label).toBe(found?.basis.kind);
      expect(item.shelter.availability, found?.label).toBe("open");
    }

    const facets = await gallery.facetCounts({ filters: NO_FILTERS, now: NOW });
    expect(facets.cities.reduce((sum, entry) => sum + entry.count, 0)).toBe(expectedIds.length);

    const relaxed = await gallery.relaxationCounts({ filters: NO_FILTERS, now: NOW });
    expect(relaxed.current).toBe(expectedIds.length);

    const sitemap = await gallery.sitemapRows({ now: NOW });
    const verifiedIds = cases
      .filter((c) => c.basis.kind === "verified")
      .map((c) => c.animal.id)
      .sort();
    // The sitemap never names an early-listed shelter's animal (nor therefore its page).
    expect(sitemap.map((row) => row.id).sort()).toEqual(verifiedIds);

    for (const c of cases) {
      const scoped = await gallery.list({
        ...page,
        scope: { kind: "shelter", shelterId: c.shelter.id },
      });
      expect(scoped.totalMatching, c.label).toBe(c.basis.kind === "not_listed" ? 0 : 1);

      const joined = await animalRepo(db).findWithShelterById(c.animal.id, NOW);
      const expectedAvailability =
        c.basis.kind !== "not_listed"
          ? "open"
          : c.shelter.verification.status === "paused"
            ? "paused"
            : "unreachable";
      expect(joined?.shelter?.availability, c.label).toBe(expectedAvailability);
      expect(joined?.shelter?.verification, c.label).toBe(
        c.basis.kind === "not_listed" ? "unverified" : c.basis.kind,
      );
    }
  });

  it("expires with the clock alone: the same row is listed at one instant and hidden at the next", async () => {
    const city = await seedCity();
    const since = new Date("2026-10-01T00:00:00.000Z");
    const { animal } = await seedShelter(city.id, "pending", since);
    const expiresAt = new Date(since.getTime() + EARLY_LISTING_DAYS * DAY);
    const at = (now: Date) =>
      galleryRepo(db).list({
        filters: NO_FILTERS,
        scope: EVERYONE_SCOPE,
        sort: "freshest",
        page: 1,
        pageSize: 10,
        now,
      });
    expect((await at(new Date(expiresAt.getTime() - 1))).items.map((a) => a.id)).toEqual([
      animal.id,
    ]);
    expect((await at(expiresAt)).items).toEqual([]);
  });
});

describe("the stored permission across verification changes", () => {
  const SINCE = new Date("2026-11-01T00:00:00.000Z");

  async function listedShelter(status: "pending" | "under_review" = "pending") {
    const city = await seedCity();
    return { ...(await seedShelter(city.id, status, SINCE)), cityId: city.id };
  }
  const sinceOf = async (id: string) =>
    (await shelterRepo(db).findById(id as never))?.earlyListingSince ?? null;
  const move = (shelterId: string, verification: ShelterVerification, expectedVersion: number) =>
    kabinetShelterRepo(db).applyAudited({
      shelterId: shelterId as never,
      expectedVersion,
      change: { kind: "verification", verification },
      entry: {
        kind: "verification",
        event: { type: "start_review", at: NOW, reviewerId: MOD },
        from: "pending",
        to: "under_review",
      },
      historyId: randomUUID(),
      now: NOW,
    });

  it("start_review KEEPS it (the carve-out)", async () => {
    const { shelter } = await listedShelter("pending");
    expect(await move(shelter.id, stateOf("under_review"), 0)).toEqual({ kind: "ok" });
    expect(await sinceOf(shelter.id)).toEqual(SINCE);
  });

  it("an evidence add (same status) keeps it", async () => {
    const { shelter } = await listedShelter("under_review");
    expect(await move(shelter.id, stateOf("under_review"), 0)).toEqual({ kind: "ok" });
    expect(await sinceOf(shelter.id)).toEqual(SINCE);
  });

  it.each(["verified", "rejected"] as const)("%s CLEARS it", async (status) => {
    const { shelter } = await listedShelter("under_review");
    expect(await move(shelter.id, stateOf(status), 0)).toEqual({ kind: "ok" });
    expect(await sinceOf(shelter.id)).toBeNull();
  });

  it("a resubmit (rejected to pending) never carries one over", async () => {
    const city = await seedCity();
    // Even a stale value on a rejected row (which the repo itself cannot produce) is dropped.
    const { shelter } = await seedShelter(city.id, "rejected", SINCE);
    expect(await move(shelter.id, stateOf("pending"), 0)).toEqual({ kind: "ok" });
    expect(await sinceOf(shelter.id)).toBeNull();
  });

  it("allow sets the column, bumps the version and stamps the shelter's public cards once", async () => {
    const city = await seedCity();
    const { shelter, animal } = await seedShelter(city.id, "pending", null);
    const draft = makeAnimal({
      shelterId: shelter.id,
      listing: { kind: "draft" },
      everServedAt: null,
    });
    await animalRepo(db).insert(draft, city.id);
    expect((await animalRepo(db).findById(animal.id))?.everServedAt).toBeNull();

    const repo = kabinetShelterRepo(db);
    const result = await repo.applyAudited({
      shelterId: shelter.id,
      expectedVersion: 0,
      change: { kind: "early_listing_allowed", since: NOW },
      entry: { kind: "early_listing_allowed", at: NOW, moderatorId: MOD, period: 1, note: null },
      historyId: randomUUID(),
      now: NOW,
    });
    expect(result).toEqual({ kind: "ok" });
    const after = await shelterRepo(db).findById(shelter.id);
    expect(after?.earlyListingSince).toEqual(NOW);
    expect(after?.version).toBe(1);
    expect((await animalRepo(db).findById(animal.id))?.everServedAt).toEqual(NOW);
    // A draft was never public: it is not stamped.
    expect((await animalRepo(db).findById(draft.id))?.everServedAt).toBeNull();
    expect(await repo.earlyListingPeriodsUsed(shelter.id)).toBe(1);

    const revoked = await repo.applyAudited({
      shelterId: shelter.id,
      expectedVersion: 1,
      change: { kind: "early_listing_revoked" },
      entry: { kind: "early_listing_revoked", at: NOW, moderatorId: MOD },
      historyId: randomUUID(),
      now: NOW,
    });
    expect(revoked).toEqual({ kind: "ok" });
    expect(await sinceOf(shelter.id)).toBeNull();
    // Monotonic: the stamp outlives the revoke.
    expect((await animalRepo(db).findById(animal.id))?.everServedAt).toEqual(NOW);
  });

  it("allow loses to a concurrent approval: nothing written, no history", async () => {
    const city = await seedCity();
    const { shelter } = await seedShelter(city.id, "under_review", null);
    expect(await move(shelter.id, stateOf("verified"), 0)).toEqual({ kind: "ok" });
    const result = await kabinetShelterRepo(db).applyAudited({
      shelterId: shelter.id,
      expectedVersion: 0,
      change: { kind: "early_listing_allowed", since: NOW },
      entry: { kind: "early_listing_allowed", at: NOW, moderatorId: MOD, period: 1, note: null },
      historyId: randomUUID(),
      now: NOW,
    });
    expect(result).toEqual({ kind: "conflict" });
    expect(await sinceOf(shelter.id)).toBeNull();
    expect(await kabinetShelterRepo(db).earlyListingPeriodsUsed(shelter.id)).toBe(0);
  });
});

describe("a card published while the shelter is early-listed is stamped as served", () => {
  it("writeListingIf stamps under a running permission and not under a lapsed one", async () => {
    const city = await seedCity();
    const running = await seedShelter(city.id, "pending", new Date(NOW.getTime() - DAY));
    const lapsed = await seedShelter(city.id, "pending", new Date(NOW.getTime() - 61 * DAY));
    const publish = async (animalShelter: { id: string }) => {
      const draft = makeAnimal({
        shelterId: animalShelter.id as never,
        listing: { kind: "draft" },
        everServedAt: null,
        photos: [{ storageKey: "photos/a/0", width: 800, height: 600, alt: null }],
      });
      await animalRepo(db).insert(draft, city.id);
      const published = {
        kind: "published",
        publishedAt: NOW,
        confirmedAt: NOW,
        undoable: null,
      } as const;
      const written = await kabinetAnimalRepo(db).writeListingIf(
        draft.id,
        published,
        { kind: "draft" },
        NOW,
        { kind: "not_recorded", because: "confirmation" },
        {
          kind: "publish",
          expectedVersion: draft.version,
        },
      );
      expect(written.kind).toBe("ok");
      return (await animalRepo(db).findById(draft.id))?.everServedAt ?? null;
    };
    expect(await publish(running.shelter)).toEqual(NOW);
    expect(await publish(lapsed.shelter)).toBeNull();
  });
});
