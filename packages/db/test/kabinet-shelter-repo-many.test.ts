import {
  type Animal,
  donationProviderOf,
  type InvitationId,
  type ModeratorId,
  publicLocationOf,
  type ShelterAdminId,
  type ShelterHistoryEntry,
  ShelterHistoryEntrySchema,
  type ShelterVerification,
  testOnlyLocationPolicy,
} from "@opika/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { kabinetShelterRepo } from "../src/repos/kabinet-shelter-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { animals } from "../src/schema/animals";
import {
  makeAnimal,
  makeCity,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";

/** The operator's audited writes (registry PR): several entries per write, and the new change kinds. */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const NOW = new Date("2026-10-13T10:00:00.000Z");
const MOD = "mod-1" as ModeratorId;
const policy = testOnlyLocationPolicy("repo-test");
let homeCity: string;
let otherCity: string;

beforeEach(async () => {
  await truncateAll(db);
  const home = makeCity();
  const other = makeCity();
  await cityRepo(db).insert(home);
  await cityRepo(db).insert(other);
  homeCity = home.id;
  otherCity = other.id;
});

async function shelter() {
  const s = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: homeCity } as never,
  });
  await shelterRepo(db).insert(s);
  return s;
}

const repo = () => kabinetShelterRepo(db);
const history = (shelterId: string) => repo().historyOf(shelterId as never);
const cityOfAnimal = async (id: string) =>
  (
    await db
      .select({ cityId: animals.cityId })
      .from(animals)
      .where(eq(animals.id, id as never))
  )[0]?.cityId;

describe("kabinetShelterRepo.applyAuditedMany", () => {
  it("writes every change with one version bump and one history row per entry", async () => {
    const s = await shelter();
    const description = { uk: "Новий опис", en: null };
    const contact = { primary: { kind: "telegram", handle: "lapa" }, additional: [] } as const;
    const actor = { kind: "moderator", moderatorId: MOD } as const;
    const entries: { id: string; entry: ShelterHistoryEntry }[] = [
      {
        id: "h1",
        entry: { kind: "contact_changed", at: NOW, actor, previous: s.contact, next: contact },
      },
      {
        id: "h2",
        entry: {
          kind: "description_changed",
          at: NOW,
          actor,
          previous: s.description,
          next: description,
        },
      },
    ];
    const result = await repo().applyAuditedMany({
      shelterId: s.id,
      expectedVersion: 0,
      changes: [
        { kind: "contact", contact },
        { kind: "description", description },
      ],
      entries,
      now: NOW,
    });
    expect(result).toEqual({ kind: "ok" });
    const after = await shelterRepo(db).findById(s.id);
    expect(after).toMatchObject({ contact, description, version: 1 });
    expect((await history(s.id)).map((entry) => entry.kind).sort()).toEqual([
      "contact_changed",
      "description_changed",
    ]);
  });

  it("writes nothing and records nothing when the version moved", async () => {
    const s = await shelter();
    const result = await repo().applyAuditedMany({
      shelterId: s.id,
      expectedVersion: 7,
      changes: [{ kind: "description", description: { uk: "Ні", en: null } }],
      entries: [
        {
          id: "h1",
          entry: {
            kind: "description_changed",
            at: NOW,
            actor: { kind: "moderator", moderatorId: MOD },
            previous: s.description,
            next: { uk: "Ні", en: null },
          },
        },
      ],
      now: NOW,
    });
    expect(result).toEqual({ kind: "conflict" });
    expect((await shelterRepo(db).findById(s.id))?.description).toEqual(s.description);
    expect(await history(s.id)).toEqual([]);
  });

  it("refuses a write with no history entry", async () => {
    const s = await shelter();
    await expect(
      repo().applyAuditedMany({
        shelterId: s.id,
        expectedVersion: 0,
        changes: [],
        entries: [],
        now: NOW,
      }),
    ).rejects.toThrow("at least one entry");
  });
});

describe("an address change (S4, verified data)", () => {
  async function move(expectedVersion: number) {
    const s = await shelter();
    const atShelter = makeAnimal({ shelterId: s.id });
    const fostered: Animal = makeAnimal({
      shelterId: s.id,
      publicLocation: { precision: "city", cityId: homeCity as never, district: null },
    });
    await animalRepo(db).insert(atShelter, homeCity as never);
    await animalRepo(db).insert(fostered, homeCity as never);
    const exactAddress = {
      ...s.exactAddress,
      cityId: otherCity as never,
      coordinates: { lat: 49.84, lng: 24.03 },
    };
    const publicLocation = publicLocationOf(s.id, exactAddress, policy);
    const result = await repo().applyAuditedMany({
      shelterId: s.id,
      expectedVersion,
      changes: [{ kind: "exact_address", exactAddress, publicLocation }],
      entries: [
        {
          id: "h1",
          entry: {
            kind: "verified_data_changed",
            at: NOW,
            moderatorId: MOD,
            change: { field: "exact_address", previous: s.exactAddress, next: exactAddress },
          },
        },
      ],
      now: NOW,
    });
    return { s, atShelter, fostered, exactAddress, publicLocation, result };
  }

  it("moves the address, the fuzzed pin, the city, and every animal still at the shelter", async () => {
    const { s, atShelter, fostered, exactAddress, publicLocation, result } = await move(0);
    expect(result).toEqual({ kind: "ok" });
    const after = await shelterRepo(db).findById(s.id);
    expect(after?.exactAddress).toEqual(exactAddress);
    expect(after?.publicLocation).toEqual(publicLocation);
    expect(await cityOfAnimal(atShelter.id)).toBe(otherCity);
    // A fostered animal is discoverable in its foster city, not the shelter's.
    expect(await cityOfAnimal(fostered.id)).toBe(homeCity);
  });

  it("moves no animal when the shelter write loses its compare-and-set", async () => {
    const { s, atShelter, result } = await move(3);
    expect(result).toEqual({ kind: "conflict" });
    expect((await shelterRepo(db).findById(s.id))?.publicLocation.cityId).toBe(homeCity);
    expect(await cityOfAnimal(atShelter.id)).toBe(homeCity);
  });
});

describe("legal entity and donation approval columns", () => {
  it("round-trips a legal-entity change", async () => {
    const s = await shelter();
    const legalEntity = { ...s.legalEntity, legalName: "ГО Нова назва" } as typeof s.legalEntity;
    await repo().applyAudited({
      shelterId: s.id,
      expectedVersion: 0,
      change: { kind: "legal_entity", legalEntity },
      entry: {
        kind: "verified_data_changed",
        at: NOW,
        moderatorId: MOD,
        change: { field: "legal_entity", previous: s.legalEntity, next: legalEntity },
      },
      historyId: "h1",
      now: NOW,
    });
    expect((await shelterRepo(db).findById(s.id))?.legalEntity).toEqual(legalEntity);
  });

  it("makes an approved link live and clears the proposal", async () => {
    const url = "https://send.monobank.ua/jar/abc";
    const link = { url, provider: donationProviderOf(url) };
    const s = makeShelter({
      publicLocation: { ...makeShelter().publicLocation, cityId: homeCity } as never,
      pendingDonation: {
        link,
        proposedAt: NOW,
        proposedBy: "admin-1" as ShelterAdminId,
      },
    });
    await shelterRepo(db).insert(s);
    await repo().applyAudited({
      shelterId: s.id,
      expectedVersion: 0,
      change: { kind: "donation_approved", donation: link },
      entry: {
        kind: "donation_decided",
        at: NOW,
        moderatorId: MOD,
        decision: "approved",
        link,
        previousLive: null,
      },
      historyId: "h1",
      now: NOW,
    });
    const after = await shelterRepo(db).findById(s.id);
    expect(after?.donation).toEqual(link);
    expect(after?.pendingDonation).toBeNull();
  });
});

/**
 * IN-Q14: `admin_joined` needs no migration (the kind column is text, the
 * entry jsonb). This is the proof: the row goes in and comes back whole,
 * dates revived and both ids intact, and it still parses as the domain union.
 */
describe("an admin_joined history line", () => {
  it("round-trips through shelter_history unchanged", async () => {
    const s = await shelter();
    const entry: ShelterHistoryEntry = {
      kind: "admin_joined",
      at: NOW,
      shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
      invitationId: "44444444-4444-4444-8444-444444444444" as InvitationId,
      email: "olena@example.org",
    };
    await repo().appendHistory({ id: "h-joined", shelterId: s.id, entry });
    const page = await repo().historyPage({ shelterId: s.id, after: null, limit: 10 });
    expect(page.items).toEqual([entry]);
    expect(ShelterHistoryEntrySchema.parse(page.items[0])).toEqual(entry);
  });
});

/**
 * S8-F5, hook 2: entering `verified` is the one thing that can make an
 * already-published card visible for the first time without any write of
 * its own (hook 1, `writeListingIf`, never runs for it). `kabinetShelterRepo
 * .applyAuditedMany` stamps every one of that shelter's discoverable,
 * not-yet-stamped animals in the same statement as the verification write —
 * the same cross-table-CTE shape as the address-change tests above.
 */
describe("S8-F5: everServedAt, a shelter entering `verified` (hook 2)", () => {
  const PAUSED: ShelterVerification = {
    status: "paused",
    verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    verifiedBy: MOD,
    pausedAt: new Date("2026-08-01T00:00:00.000Z"),
    pausedBy: { kind: "shelter_admin", shelterAdminId: "admin-1" as ShelterAdminId },
    reason: { code: "other", note: null },
    evidence: { items: [], submittedAt: new Date("2026-01-01T00:00:00.000Z") },
  };
  const VERIFIED: ShelterVerification = {
    status: "verified",
    verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    verifiedBy: MOD,
    evidence: { items: [], submittedAt: new Date("2026-01-01T00:00:00.000Z") },
  };
  const everServedAtOf = async (id: string) =>
    (await animalRepo(db).findById(id as never))?.everServedAt ?? null;

  async function pausedShelterWithAnimals() {
    const s = makeShelter({
      verification: PAUSED,
      publicLocation: { ...makeShelter().publicLocation, cityId: homeCity } as never,
    });
    await shelterRepo(db).insert(s);
    // Published while paused: never actually served, so `null` — exactly
    // what hook 1 would have computed, had this gone through it.
    const publishedWhilePaused = makeAnimal({ shelterId: s.id, everServedAt: null });
    // Not discoverable: must stay untouched regardless of the shelter.
    const draft = makeAnimal({ shelterId: s.id, listing: { kind: "draft" }, everServedAt: null });
    // Already served before this shelter was ever paused: must keep its
    // own, earlier timestamp, not be bumped to this write's `now`.
    const alreadyServedAt = new Date("2026-02-01T00:00:00.000Z");
    const alreadyServed = makeAnimal({ shelterId: s.id, everServedAt: alreadyServedAt });
    await animalRepo(db).insert(publishedWhilePaused, homeCity as never);
    await animalRepo(db).insert(draft, homeCity as never);
    await animalRepo(db).insert(alreadyServed, homeCity as never);
    return { s, publishedWhilePaused, draft, alreadyServed, alreadyServedAt };
  }

  it("published while paused → null → resumed → set", async () => {
    const { s, publishedWhilePaused } = await pausedShelterWithAnimals();
    expect(await everServedAtOf(publishedWhilePaused.id)).toBeNull();

    const result = await repo().applyAuditedMany({
      shelterId: s.id,
      expectedVersion: s.version,
      changes: [{ kind: "verification", verification: VERIFIED }],
      entries: [
        {
          id: "h1",
          entry: {
            kind: "verification",
            event: {
              type: "resume",
              at: NOW,
              actor: { kind: "shelter_admin", shelterAdminId: "admin-1" as ShelterAdminId },
            },
            from: "paused",
            to: "verified",
          },
        },
      ],
      now: NOW,
    });

    expect(result).toEqual({ kind: "ok" });
    expect(await everServedAtOf(publishedWhilePaused.id)).toEqual(NOW);
  });

  it("leaves a draft untouched, even at a shelter that just became verified", async () => {
    const { s, draft } = await pausedShelterWithAnimals();
    await repo().applyAuditedMany({
      shelterId: s.id,
      expectedVersion: s.version,
      changes: [{ kind: "verification", verification: VERIFIED }],
      entries: [
        {
          id: "h1",
          entry: {
            kind: "verification",
            event: {
              type: "resume",
              at: NOW,
              actor: { kind: "shelter_admin", shelterAdminId: "admin-1" as ShelterAdminId },
            },
            from: "paused",
            to: "verified",
          },
        },
      ],
      now: NOW,
    });
    expect(await everServedAtOf(draft.id)).toBeNull();
  });

  /**
   * Mutation (Tier 1 review finding 6, PR #196): replacing the "served" CTE's
   * `shelter_id IN (SELECT id FROM upd)` scope with an unconditional `TRUE`
   * left every existing hook-2 test green, because none of them had a
   * *second* shelter in the same unaffected state to prove wasn't touched.
   */
  it("never stamps a different shelter's animals", async () => {
    const { s, publishedWhilePaused } = await pausedShelterWithAnimals();
    const otherShelter = makeShelter({
      verification: PAUSED,
      publicLocation: { ...makeShelter().publicLocation, cityId: homeCity } as never,
    });
    await shelterRepo(db).insert(otherShelter);
    const otherPublishedWhilePaused = makeAnimal({
      shelterId: otherShelter.id,
      everServedAt: null,
    });
    await animalRepo(db).insert(otherPublishedWhilePaused, homeCity as never);

    await repo().applyAuditedMany({
      shelterId: s.id,
      expectedVersion: s.version,
      changes: [{ kind: "verification", verification: VERIFIED }],
      entries: [
        {
          id: "h1",
          entry: {
            kind: "verification",
            event: {
              type: "resume",
              at: NOW,
              actor: { kind: "shelter_admin", shelterAdminId: "admin-1" as ShelterAdminId },
            },
            from: "paused",
            to: "verified",
          },
        },
      ],
      now: NOW,
    });

    expect(await everServedAtOf(publishedWhilePaused.id)).toEqual(NOW);
    expect(await everServedAtOf(otherPublishedWhilePaused.id)).toBeNull();
  });

  it("never moves an already-set everServedAt forward", async () => {
    const { s, alreadyServed, alreadyServedAt } = await pausedShelterWithAnimals();
    await repo().applyAuditedMany({
      shelterId: s.id,
      expectedVersion: s.version,
      changes: [{ kind: "verification", verification: VERIFIED }],
      entries: [
        {
          id: "h1",
          entry: {
            kind: "verification",
            event: {
              type: "resume",
              at: NOW,
              actor: { kind: "shelter_admin", shelterAdminId: "admin-1" as ShelterAdminId },
            },
            from: "paused",
            to: "verified",
          },
        },
      ],
      now: NOW,
    });
    expect(await everServedAtOf(alreadyServed.id)).toEqual(alreadyServedAt);
  });

  it("does nothing extra for a verification change that doesn't reach `verified` (e.g. a suspend)", async () => {
    const s = makeShelter({
      verification: VERIFIED,
      publicLocation: { ...makeShelter().publicLocation, cityId: homeCity } as never,
    });
    await shelterRepo(db).insert(s);
    const published = makeAnimal({ shelterId: s.id, everServedAt: null });
    await animalRepo(db).insert(published, homeCity as never);

    await repo().applyAuditedMany({
      shelterId: s.id,
      expectedVersion: s.version,
      changes: [
        {
          kind: "verification",
          verification: {
            status: "suspended",
            suspendedAt: NOW,
            suspendedBy: MOD,
            reason: { code: "unresponsive", note: null },
            priorState: { status: "verified", verifiedAt: VERIFIED.verifiedAt, verifiedBy: MOD },
            evidence: { items: [], submittedAt: NOW },
          },
        },
      ],
      entries: [
        {
          id: "h1",
          entry: {
            kind: "verification",
            event: {
              type: "suspend",
              at: NOW,
              moderatorId: MOD,
              reason: { code: "unresponsive", note: null },
            },
            from: "verified",
            to: "suspended",
          },
        },
      ],
      now: NOW,
    });
    // Suspending never serves anything new — the animal genuinely was
    // never served (it was published null, and a suspend only removes
    // visibility, never grants it), so it correctly stays null.
    expect(await everServedAtOf(published.id)).toBeNull();
  });

  it("approve (under_review → verified) stamps a pending shelter's already-published cards too", async () => {
    const s = makeShelter({
      verification: {
        status: "under_review",
        startedAt: new Date("2026-08-01T00:00:00.000Z"),
        reviewerId: MOD,
        evidence: { items: [], submittedAt: new Date("2026-08-01T00:00:00.000Z") },
      },
      publicLocation: { ...makeShelter().publicLocation, cityId: homeCity } as never,
    });
    await shelterRepo(db).insert(s);
    // S8-F5's own motivating case: a pending/under-review shelter's admins
    // can publish from day one (CLAUDE.md decision #6), before the shelter
    // has ever been verified once.
    const publishedBeforeApproval = makeAnimal({ shelterId: s.id, everServedAt: null });
    await animalRepo(db).insert(publishedBeforeApproval, homeCity as never);

    await repo().applyAuditedMany({
      shelterId: s.id,
      expectedVersion: s.version,
      changes: [{ kind: "verification", verification: VERIFIED }],
      entries: [
        {
          id: "h1",
          entry: {
            kind: "verification",
            event: { type: "approve", at: NOW, moderatorId: MOD },
            from: "under_review",
            to: "verified",
          },
        },
      ],
      now: NOW,
    });
    expect(await everServedAtOf(publishedBeforeApproval.id)).toEqual(NOW);
  });

  /**
   * Tier 1 review finding 5 (PR #196): an address move (hook "moved") and a
   * verification approval (hook 2, "served") used to be two separate sibling
   * CTEs, each its own UPDATE of `animals`. When both land in one audited
   * write and target the same row — any animal at the shelter's own
   * premises — Postgres's documented behaviour for two data-modifying WITH
   * statements racing the same row is unspecified; empirically, only one
   * column's change survived. Both must land from a single combined write.
   */
  it("moves the address AND stamps everServedAt in one call, for the same row", async () => {
    const s = makeShelter({
      verification: PAUSED,
      publicLocation: { ...makeShelter().publicLocation, cityId: homeCity } as never,
    });
    await shelterRepo(db).insert(s);
    const atShelter = makeAnimal({ shelterId: s.id, everServedAt: null });
    await animalRepo(db).insert(atShelter, homeCity as never);

    const exactAddress = {
      ...s.exactAddress,
      cityId: otherCity as never,
      coordinates: { lat: 49.84, lng: 24.03 },
    };
    const publicLocation = publicLocationOf(s.id, exactAddress, policy);

    const result = await repo().applyAuditedMany({
      shelterId: s.id,
      expectedVersion: s.version,
      changes: [
        { kind: "exact_address", exactAddress, publicLocation },
        { kind: "verification", verification: VERIFIED },
      ],
      entries: [
        {
          id: "h1",
          entry: {
            kind: "verified_data_changed",
            at: NOW,
            moderatorId: MOD,
            change: { field: "exact_address", previous: s.exactAddress, next: exactAddress },
          },
        },
        {
          id: "h2",
          entry: {
            kind: "verification",
            event: {
              type: "resume",
              at: NOW,
              actor: { kind: "shelter_admin", shelterAdminId: "admin-1" as ShelterAdminId },
            },
            from: "paused",
            to: "verified",
          },
        },
      ],
      now: NOW,
    });

    expect(result).toEqual({ kind: "ok" });
    const after = await animalRepo(db).findById(atShelter.id as never);
    expect(after?.everServedAt).toEqual(NOW);
    const row = await db
      .select({ cityId: animals.cityId })
      .from(animals)
      .where(eq(animals.id, atShelter.id as never));
    expect(row[0]?.cityId).toBe(otherCity);
  });
});
