import { cityRepo, shelterRepo } from "@opika/db/repos";
import { makeCity, makeShelter, setupTestDatabase, truncateAll } from "@opika/db/test";
import type { ModeratorId, Shelter, ShelterAdminId } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { kabinetHomeOf, leavesSignIn } from "../features/kabinet/home";
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

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity({ name: { uk: "Бровари", en: { text: "Brovary", provenance: "human" } } });
  await cityRepo(db).insert(city);
  mine = makeShelter({ publicLocation: { ...makeShelter().publicLocation, cityId: city.id } });
  theirs = makeShelter({
    displayName: "Інший притулок",
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
  });
  await shelterRepo(db).insert(mine);
  await shelterRepo(db).insert(theirs);
});

const deps = () => ({
  db,
  now: new Date(),
  newId: () => crypto.randomUUID(),
  invites: capturingInvitationSender(),
  linkBaseURL: "http://localhost",
});

describe("kabinetHomeOf", () => {
  it("sends an anonymous visitor to sign in", async () => {
    expect(await kabinetHomeOf({ kind: "anonymous" }, deps())).toEqual({ kind: "sign_in" });
  });

  it.each([
    ["no role", { kind: "no_role" }],
    ["conflicting roles", { kind: "conflicting_roles" }],
    ["a super_admin outside support mode", { kind: "super_admin", moderatorId: OPERATOR }],
  ] as [string, KabinetPrincipal][])("shows %s nothing (not found)", async (_who, principal) => {
    expect(await kabinetHomeOf(principal, deps())).toEqual({ kind: "not_found" });
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
    expect(Object.keys(home).sort()).toEqual(["cityName", "kind", "view", "viewer"]);
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
    ["a super_admin outside support mode", { kind: "super_admin", moderatorId: OPERATOR }, false],
  ] as [string, KabinetPrincipal, boolean][])(
    "%s: whether sign-in sends them on to /kabinet",
    (_who, principal, leaves) => {
      expect(leavesSignIn(principal)).toBe(leaves);
    },
  );

  it("leaves exactly when the home page would show a shelter", async () => {
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
      expect(leavesSignIn(principal), principal.kind).toBe(home.kind === "shelter");
    }
  });
});
