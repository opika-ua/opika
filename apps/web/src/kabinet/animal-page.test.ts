import { animalRepo, cityRepo, shelterRepo } from "@opika/db/repos";
import {
  makeAnimal,
  makeCity,
  makeDraftAnimal,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "@opika/db/test";
import {
  type CityId,
  FEED_VISIBLE_VERIFICATION_STATUSES,
  type ModeratorId,
  type Shelter,
  type ShelterAdminId,
  type ShelterVerification,
  VERIFICATION_STATUSES,
  type VerificationStatus,
} from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  publishedAnnouncementOf,
  type ShelterVisibility,
  shelterVisibilityOf,
} from "../features/kabinet/animal-form/labels";
import { type AnimalPageTarget, kabinetAnimalPageOf } from "../features/kabinet/animal-page";
import { SHELTER_WRITE_POLICY, type ShelterWritePolicy } from "./access";
import type { KabinetPrincipal } from "./actor";
import { capturingInvitationSender } from "./email-senders";

/**
 * Who sees what at `/kabinet/tvaryny/nova` and `/kabinet/tvaryny/[id]` (K3):
 * decided by the served procedures' own access middleware and the served
 * write policy, against a real database, as `/kabinet`'s `home-page.test.ts`.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const OPERATOR = "0ec0ec0e-0000-4000-8000-000000000001" as ModeratorId;
const ADMIN = "33333333-3333-4333-8333-333333333333" as ShelterAdminId;
let mine: Shelter;
let theirs: Shelter;
let cityId: CityId;

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  cityId = city.id;
  const located = { ...makeShelter().publicLocation, cityId: city.id };
  mine = makeShelter({ publicLocation: located });
  theirs = makeShelter({ displayName: "Інший притулок", publicLocation: located });
  await shelterRepo(db).insert(mine);
  await shelterRepo(db).insert(theirs);
});

const deps = (shelterWrites: ShelterWritePolicy = SHELTER_WRITE_POLICY) => ({
  db,
  now: new Date(),
  newId: () => crypto.randomUUID(),
  invites: capturingInvitationSender(),
  linkBaseURL: "http://localhost",
  shelterWrites,
  cursorSecret: "test-cursor-secret",
  operatorDisplayName: "Олексій",
});

const adminOf = (shelter: Shelter): KabinetPrincipal => ({
  kind: "shelter_admin",
  shelterAdminId: ADMIN,
  shelterId: shelter.id,
});
const supportOf = (shelter: Shelter): KabinetPrincipal => ({
  kind: "support_view",
  moderatorId: OPERATOR,
  shelterId: shelter.id,
});
/**
 * Opens every shelter's own writes: the handler suites' policy, which stands
 * in for the production open one until PR 6's switch commit adds it.
 */
const OPEN: ShelterWritePolicy = { kind: "open_for_tests_only" };
const NEW: AnimalPageTarget = { kind: "new" };
const existing = (animalId: string): AnimalPageTarget => ({ kind: "existing", animalId });

describe("kabinetAnimalPageOf: who reaches the K3 pages", () => {
  it("sends an anonymous visitor to sign in, on either page", async () => {
    const draft = makeDraftAnimal({ shelterId: mine.id });
    await animalRepo(db).insert(draft, cityId);
    for (const target of [NEW, existing(draft.id)]) {
      expect(await kabinetAnimalPageOf({ kind: "anonymous" }, target, deps())).toEqual({
        kind: "sign_in",
      });
    }
  });

  it.each([
    ["no role", { kind: "no_role" }],
    ["conflicting roles", { kind: "conflicting_roles" }],
    ["a super_admin outside support mode", { kind: "super_admin", moderatorId: OPERATOR }],
  ] as [string, KabinetPrincipal][])(
    "shows %s nothing on either page (404), even under an open policy",
    async (_who, principal) => {
      const draft = makeDraftAnimal({ shelterId: mine.id });
      await animalRepo(db).insert(draft, cityId);
      for (const target of [NEW, existing(draft.id)]) {
        for (const policy of [SHELTER_WRITE_POLICY, OPEN]) {
          expect(await kabinetAnimalPageOf(principal, target, deps(policy))).toEqual({
            kind: "not_found",
          });
        }
      }
    },
  );
});

describe("kabinetAnimalPageOf: /nova (create)", () => {
  it("each shelter's own admin gets the empty form under an open policy", async () => {
    for (const shelter of [mine, theirs]) {
      expect(await kabinetAnimalPageOf(adminOf(shelter), NEW, deps(OPEN))).toMatchObject({
        kind: "form",
        view: null,
        viewer: "admin",
        editing: { kind: "open", grantedBy: "open_policy" },
      });
    }
  });

  it("404 for a shelter whose writes are refused: nothing to show read-only on a create page", async () => {
    for (const shelter of [mine, theirs]) {
      expect(await kabinetAnimalPageOf(adminOf(shelter), NEW, deps())).toEqual({
        kind: "not_found",
      });
    }
  });

  it("404 for the support view, even under an open policy (support never writes)", async () => {
    expect(await kabinetAnimalPageOf(supportOf(mine), NEW, deps(OPEN))).toEqual({
      kind: "not_found",
    });
  });
});

describe("kabinetAnimalPageOf: /[id] (edit)", () => {
  it("the admin's own draft under an open policy: the form, open, with the draft's unanswered facts null", async () => {
    const draft = makeDraftAnimal({ shelterId: mine.id, name: "Ластівка" });
    await animalRepo(db).insert(draft, cityId);
    const page = await kabinetAnimalPageOf(adminOf(mine), existing(draft.id), deps(OPEN));
    expect(page).toMatchObject({ kind: "form", editing: { kind: "open" }, viewer: "admin" });
    if (page.kind !== "form" || page.view === null) throw new Error("unreachable");
    expect(page.view).toMatchObject({
      id: draft.id,
      name: "Ластівка",
      listing: { kind: "draft" },
      size: null,
      age: null,
      description: null,
    });
  });

  it("read-only for an admin while writes are refused, and for the support view under an open policy", async () => {
    const animal = makeAnimal({ shelterId: theirs.id });
    await animalRepo(db).insert(animal, cityId);
    expect(await kabinetAnimalPageOf(adminOf(theirs), existing(animal.id), deps())).toMatchObject({
      kind: "form",
      editing: { kind: "read_only" },
      viewer: "admin",
    });
    expect(
      await kabinetAnimalPageOf(supportOf(theirs), existing(animal.id), deps(OPEN)),
    ).toMatchObject({ kind: "form", editing: { kind: "read_only" }, viewer: "support" });
  });

  it("another shelter's animal, an unknown id and a non-id all get the one `missing` answer", async () => {
    const other = makeAnimal({ shelterId: theirs.id });
    await animalRepo(db).insert(other, cityId);
    for (const animalId of [other.id, crypto.randomUUID(), "not-an-id"]) {
      expect(
        await kabinetAnimalPageOf(adminOf(mine), existing(animalId), deps(OPEN)),
        animalId,
      ).toMatchObject({ kind: "missing", viewer: "admin" });
    }
  });

  it("says where the shelter's cards stand, read from the stored verification, for every status", async () => {
    const seen: Partial<Record<VerificationStatus, ShelterVisibility>> = {};
    for (const status of VERIFICATION_STATUSES) {
      const shelter = makeShelter({
        publicLocation: mine.publicLocation,
        verification: VERIFICATION_IN[status],
      });
      await shelterRepo(db).insert(shelter);
      const animal = makeAnimal({ shelterId: shelter.id });
      await animalRepo(db).insert(animal, cityId);
      const page = await kabinetAnimalPageOf(adminOf(shelter), existing(animal.id), deps());
      if (page.kind !== "form") throw new Error(`${status}: expected the form, got ${page.kind}`);
      seen[status] = page.shelterVisibility;
    }
    expect(seen).toEqual(EXPECTED_VISIBILITY);
  });
});

/**
 * One stored verification per status, each a valid state of its kind, so the
 * page reads the status through the repository and the profile procedure
 * rather than being handed it.
 */
const AT = new Date("2026-10-01T10:00:00.000Z");
const EVIDENCE = { items: [], submittedAt: AT };
const VERIFIED_FACTS = { verifiedAt: AT, verifiedBy: OPERATOR };
const VERIFICATION_IN: { [S in VerificationStatus]: Extract<ShelterVerification, { status: S }> } =
  {
    pending: { status: "pending", submittedAt: AT, evidence: EVIDENCE },
    under_review: {
      status: "under_review",
      startedAt: AT,
      reviewerId: OPERATOR,
      evidence: EVIDENCE,
    },
    verified: { status: "verified", ...VERIFIED_FACTS, evidence: EVIDENCE },
    rejected: {
      status: "rejected",
      rejectedAt: AT,
      rejectedBy: OPERATOR,
      reason: { code: "insufficient_evidence", note: null },
      evidence: EVIDENCE,
    },
    paused: {
      status: "paused",
      ...VERIFIED_FACTS,
      pausedAt: AT,
      pausedBy: { kind: "shelter_admin", shelterAdminId: ADMIN },
      reason: { code: "relocation", note: null },
      evidence: EVIDENCE,
    },
    suspended: {
      status: "suspended",
      suspendedAt: AT,
      suspendedBy: OPERATOR,
      reason: { code: "unresponsive", note: null },
      priorState: { status: "verified", ...VERIFIED_FACTS },
      evidence: EVIDENCE,
    },
  };

/**
 * Written out status by status, not derived from the feed's constant: before
 * a pass (pending, under review, rejected and free to resubmit) the cards
 * show «щойно притулок пройде перевірку»; after one (paused, suspended) that
 * sentence is false (docs review of #116).
 */
const EXPECTED_VISIBILITY: Record<VerificationStatus, ShelterVisibility> = {
  pending: "awaiting_verification",
  under_review: "awaiting_verification",
  verified: "visible",
  rejected: "awaiting_verification",
  paused: "hidden",
  suspended: "hidden",
};

/** His lines, transcribed from his K3 file, never read from `uk.ts`. */
const PUBLISH_DONE = "Опубліковано. Тепер картку бачать ті, хто шукає тварину.";
const PUBLISHED_NOT_SHOWN =
  "Опубліковано. Ті, хто шукає тварину, побачать картку, щойно притулок пройде перевірку.";
const PUBLISHED_HIDDEN = "Опубліковано. Цю картку зараз ніхто не бачить.";
const ANNOUNCED: Record<VerificationStatus, string> = {
  pending: PUBLISHED_NOT_SHOWN,
  under_review: PUBLISHED_NOT_SHOWN,
  verified: PUBLISH_DONE,
  rejected: PUBLISHED_NOT_SHOWN,
  paused: PUBLISHED_HIDDEN,
  suspended: PUBLISHED_HIDDEN,
};

describe("shelterVisibilityOf: every verification status, and what publishing then announces", () => {
  it("the tables name every status there is", () => {
    const statuses = [...VERIFICATION_STATUSES].sort();
    expect(Object.keys(EXPECTED_VISIBILITY).sort()).toEqual(statuses);
    expect(Object.keys(ANNOUNCED).sort()).toEqual(statuses);
  });

  it.each(VERIFICATION_STATUSES)("%s", (status) => {
    const visibility = shelterVisibilityOf(status);
    expect({ visibility, announced: publishedAnnouncementOf(visibility) }).toEqual({
      visibility: EXPECTED_VISIBILITY[status],
      announced: ANNOUNCED[status],
    });
  });

  it("is visible exactly where the public surfaces show the shelter's cards", () => {
    for (const status of VERIFICATION_STATUSES) {
      expect(shelterVisibilityOf(status) === "visible", status).toBe(
        (FEED_VISIBLE_VERIFICATION_STATUSES as readonly string[]).includes(status),
      );
    }
  });
});
