import { animalRepo, cityRepo, kabinetShelterRepo, shelterRepo } from "@opika/db/repos";
import { makeAnimal, makeCity, makeShelter, setupTestDatabase, truncateAll } from "@opika/db/test";
import type { CityId, ModeratorId, Shelter, ShelterAdminId } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { kabinetHomeOf, leavesSignIn } from "../features/kabinet/home";
import { SHELTER_WRITE_POLICY, type ShelterWritePolicy } from "./access";
import type { KabinetPrincipal } from "./actor";
import { capturingInvitationSender } from "./email-senders";

/**
 * Who sees what at `/kabinet` (KS-Q1): decided by the served procedure's own
 * access middleware and output schema, against a real database.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const OPERATOR = "0ec0ec0e-0000-4000-8000-000000000001" as ModeratorId;
let mine: Shelter;
let theirs: Shelter;
let cityId: CityId;

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity({ name: { uk: "Бровари", en: { text: "Brovary", provenance: "human" } } });
  await cityRepo(db).insert(city);
  cityId = city.id;
  mine = makeShelter({ publicLocation: { ...makeShelter().publicLocation, cityId: city.id } });
  theirs = makeShelter({
    displayName: "Інший притулок",
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
  });
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

const ADMIN = "33333333-3333-4333-8333-333333333333" as ShelterAdminId;
const adminOf = (shelter: Shelter): KabinetPrincipal => ({
  kind: "shelter_admin",
  shelterAdminId: ADMIN,
  shelterId: shelter.id,
});

describe("kabinetHomeOf", () => {
  it("sends an anonymous visitor to sign in", async () => {
    expect(await kabinetHomeOf({ kind: "anonymous" }, deps())).toEqual({ kind: "sign_in" });
  });

  it.each([
    ["no role", { kind: "no_role" }],
    ["conflicting roles", { kind: "conflicting_roles" }],
  ] as [string, KabinetPrincipal][])("shows %s nothing (not found)", async (_who, principal) => {
    expect(await kabinetHomeOf(principal, deps())).toEqual({ kind: "not_found" });
  });

  /**
   * R-UI (RU-T1): the operator's home is their list, decided by the registry
   * router's own matrix before any shelter is read, so a super_admin outside
   * support mode never sees a shelter's profile from here. Whatever the
   * shelter write policy says: the registry path never reads it.
   */
  it("sends the operator, a super_admin outside support mode, to their own screens", async () => {
    const operator: KabinetPrincipal = { kind: "super_admin", moderatorId: OPERATOR };
    expect(await kabinetHomeOf(operator, deps())).toEqual({ kind: "operator" });
  });

  it("keeps a support view on the shelter it entered, not the operator's list", async () => {
    const home = await kabinetHomeOf(
      { kind: "support_view", moderatorId: OPERATOR, shelterId: theirs.id },
      deps(),
    );
    expect(home.kind).toBe("shelter");
  });

  it("shows a shelter admin their own shelter, with its city, as an admin", async () => {
    const home = await kabinetHomeOf(
      {
        kind: "shelter_admin",
        shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
        shelterId: mine.id,
      },
      deps(),
    );
    expect(home).toMatchObject({ kind: "shelter", viewer: "admin", cityName: "Бровари" });
    if (home.kind !== "shelter") throw new Error("unreachable");
    expect(home.view.id).toBe(mine.id);
    expect(home.view.displayName).toBe(mine.displayName);
  });

  it("shows a support view the shelter it entered, read-only, as support", async () => {
    const home = await kabinetHomeOf(
      { kind: "support_view", moderatorId: OPERATOR, shelterId: theirs.id },
      deps(),
    );
    expect(home).toMatchObject({ kind: "shelter", viewer: "support" });
    if (home.kind !== "shelter") throw new Error("unreachable");
    expect(home.view.id).toBe(theirs.id);
  });

  it("carries only the shelter view's own fields, nothing engagement-shaped", async () => {
    const home = await kabinetHomeOf(
      {
        kind: "shelter_admin",
        shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
        shelterId: mine.id,
      },
      deps(),
    );
    if (home.kind !== "shelter") throw new Error("unreachable");
    expect(Object.keys(home).sort()).toEqual(["cityName", "editing", "kind", "view", "viewer"]);
    expect(Object.keys(home.view).sort()).toEqual([
      "contact",
      "description",
      "displayName",
      "donation",
      "exactAddress",
      "freshnessSentence",
      "id",
      "legalEntity",
      "pendingDonation",
      "verification",
      "version",
    ]);
  });

  it("never carries a nested field the view schema doesn't declare", async () => {
    // A stored jsonb value can hold more than its type says (an older shape, a
    // hand-edited row). The repository passes it through untouched; the
    // procedure's output parse is what strips it, and the page sees only that.
    const odd = makeShelter({
      publicLocation: mine.publicLocation,
      contact: { ...mine.contact, internalNote: "operator-only" } as Shelter["contact"],
    });
    await shelterRepo(db).insert(odd);
    const home = await kabinetHomeOf(
      {
        kind: "shelter_admin",
        shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
        shelterId: odd.id,
      },
      deps(),
    );
    if (home.kind !== "shelter") throw new Error("unreachable");
    expect(home.view.contact).toEqual(mine.contact);
    expect(JSON.stringify(home)).not.toContain("operator-only");
  });
});

/**
 * K4: whether the page offers the editor, decided with the router's own
 * `decideAccess` and the policy it is given, and what the editor needs: an
 * animal for the preview (N11) and whether the last proposal was declined
 * (answer 12).
 */
describe("kabinetHomeOf: K4 editing", () => {
  it("open for each shelter's own admin under the served policy, every shelter alike", async () => {
    expect(await kabinetHomeOf(adminOf(mine), deps())).toMatchObject({
      editing: { kind: "open" },
    });
    const home = await kabinetHomeOf(adminOf(theirs), deps());
    expect(home).toMatchObject({ editing: { kind: "open" } });
    if (home.kind !== "shelter") throw new Error("not a shelter page");
    expect(home.view.id).toBe(theirs.id);
  });

  it("read-only for a support view, even with writes open", async () => {
    const home = await kabinetHomeOf(
      { kind: "support_view", moderatorId: OPERATOR, shelterId: mine.id },
      deps(),
    );
    expect(home).toMatchObject({ viewer: "support", editing: { kind: "read_only" } });
  });

  /**
   * Designer round 1, S6: the voice preview shows the shelter page's section,
   * which needs no animal (DR1-Q5), so the page reads none for it.
   */
  it("needs no animal for the voice preview", async () => {
    await animalRepo(db).insert(
      makeAnimal({ shelterId: mine.id, name: "Ластівка", listing: { kind: "draft" } }),
      cityId,
    );
    const home = await kabinetHomeOf(adminOf(mine), deps());
    if (home.kind !== "shelter") throw new Error("not a shelter");
    expect(home.editing).toEqual({ kind: "open", donationDeclined: false });
  });

  describe("the declined proposal (answer 12)", () => {
    const link = { url: "https://dobro.ua/fund/x", provider: "other" as const };
    const append = async (
      entry: Parameters<ReturnType<typeof kabinetShelterRepo>["appendHistory"]>[0]["entry"],
    ) =>
      kabinetShelterRepo(db).appendHistory({ id: crypto.randomUUID(), shelterId: mine.id, entry });
    const proposed = (at: Date) => ({
      kind: "donation_proposed" as const,
      at,
      actor: { kind: "shelter_admin" as const, shelterAdminId: ADMIN },
      link,
    });
    const rejected = (at: Date) => ({
      kind: "donation_decided" as const,
      at,
      moderatorId: OPERATOR,
      decision: "rejected" as const,
      link,
      previousLive: null,
    });
    const declinedOf = async () => {
      const home = await kabinetHomeOf(adminOf(mine), deps());
      if (home.kind !== "shelter" || home.editing.kind !== "open") throw new Error("not open");
      return home.editing.donationDeclined;
    };

    it("is false with no donation history", async () => {
      expect(await declinedOf()).toBe(false);
    });

    it("is true when the newest donation line is a rejection, other lines above it or not", async () => {
      await append(proposed(new Date("2026-10-01T10:00:00Z")));
      await append(rejected(new Date("2026-10-02T10:00:00Z")));
      await append({
        kind: "animal_created",
        at: new Date("2026-10-03T10:00:00Z"),
        actor: { kind: "shelter_admin", shelterAdminId: ADMIN },
        animalId: crypto.randomUUID() as never,
        animalName: "Рекс",
      });
      expect(await declinedOf()).toBe(true);
    });

    it("is false again once a newer proposal is on top", async () => {
      await append(proposed(new Date("2026-10-01T10:00:00Z")));
      await append(rejected(new Date("2026-10-02T10:00:00Z")));
      await append(proposed(new Date("2026-10-04T10:00:00Z")));
      expect(await declinedOf()).toBe(false);
    });

    it("finds a rejection more than one history page down", async () => {
      await append(proposed(new Date("2026-09-01T10:00:00Z")));
      await append(rejected(new Date("2026-09-02T10:00:00Z")));
      for (let i = 0; i < 60; i += 1) {
        await append({
          kind: "animal_created",
          at: new Date(Date.UTC(2026, 9, 1, 0, i)),
          actor: { kind: "shelter_admin", shelterAdminId: ADMIN },
          animalId: crypto.randomUUID() as never,
          animalName: `Тварина ${i}`,
        });
      }
      expect(await declinedOf()).toBe(true);
    });
  });
});

describe("leavesSignIn (/kabinet/vkhid with a live session)", () => {
  // The same principals, so the sign-in page and the home page can't disagree
  // about who has somewhere to go.
  it.each([
    [
      "a shelter admin",
      {
        kind: "shelter_admin",
        shelterAdminId: "33333333-3333-4333-8333-333333333333",
        shelterId: "s",
      },
      true,
    ],
    ["a support view", { kind: "support_view", moderatorId: OPERATOR, shelterId: "s" }, true],
    ["an anonymous visitor", { kind: "anonymous" }, false],
    ["an account with no role", { kind: "no_role" }, false],
    ["conflicting roles", { kind: "conflicting_roles" }, false],
    // R-UI: `/kabinet` now has somewhere to send the operator (their list).
    ["a super_admin outside support mode", { kind: "super_admin", moderatorId: OPERATOR }, true],
  ] as [string, KabinetPrincipal, boolean][])(
    "%s: whether sign-in sends them on to /kabinet",
    (_who, principal, leaves) => {
      expect(leavesSignIn(principal)).toBe(leaves);
    },
  );

  it("leaves exactly when the home page would show a shelter or send the operator on", async () => {
    for (const principal of [
      {
        kind: "shelter_admin",
        shelterAdminId: "33333333-3333-4333-8333-333333333333",
        shelterId: mine.id,
      },
      { kind: "support_view", moderatorId: OPERATOR, shelterId: theirs.id },
      { kind: "anonymous" },
      { kind: "no_role" },
      { kind: "conflicting_roles" },
      { kind: "super_admin", moderatorId: OPERATOR },
    ] as KabinetPrincipal[]) {
      const home = await kabinetHomeOf(principal, deps());
      expect(leavesSignIn(principal), principal.kind).toBe(
        home.kind === "shelter" || home.kind === "operator",
      );
    }
  });
});
