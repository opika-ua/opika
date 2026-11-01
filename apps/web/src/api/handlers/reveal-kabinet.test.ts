import { apiErrors } from "@opika/contracts";
import { makeAnimal, makeShelter } from "@opika/db/test";
import type { AdopterId } from "@opika/domain";
import { createORPCErrorConstructorMap } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppContext } from "../context";

const errors = createORPCErrorConstructorMap({
  NOT_FOUND: apiErrors.NOT_FOUND,
  ANIMAL_NOT_AVAILABLE: apiErrors.ANIMAL_NOT_AVAILABLE,
  SHELTER_NOT_VISIBLE: apiErrors.SHELTER_NOT_VISIBLE,
  UNAUTHENTICATED: apiErrors.UNAUTHENTICATED,
  RATE_LIMITED: apiErrors.RATE_LIMITED,
});

const findAnimal = vi.fn();
const findShelter = vi.fn();
const findExisting = vi.fn();
const checkLimit = vi.fn();
const writeReveal = vi.fn();

vi.mock("@opika/db/repos", () => ({
  animalRepo: () => ({ findById: findAnimal }),
  shelterRepo: () => ({ findById: findShelter }),
  revealRepo: () => ({ findByAdopterAndAnimal: findExisting }),
}));
vi.mock("../reveal-rate-limit", () => ({
  checkRevealRateLimit: checkLimit,
  writeRevealWithinRateLimit: writeReveal,
}));

const { animalsReveal } = await import("./reveal");

const adopterId = "11111111-1111-4111-8111-111111111111" as AdopterId;
const shelter = makeShelter();
const animal = makeAnimal({ shelterId: shelter.id });

let ipBudget: ReturnType<typeof vi.fn>;

function context(isKabinetSession?: () => Promise<boolean>): AppContext {
  return {
    db: {} as AppContext["db"],
    adopterId,
    tokenHash: null,
    now: new Date("2026-09-09T12:00:00Z"),
    caller: {
      kind: "http",
      ipKey: "ip",
      budgets: {
        adopterMints: { check: vi.fn() },
        newShelterReveals: { check: ipBudget },
      } as never,
    },
    setCookies: [],
    isKabinetSession,
  };
}

const reveal = (ctx: AppContext) => animalsReveal({ animalId: animal.id }, ctx, errors);

beforeEach(() => {
  for (const m of [findAnimal, findShelter, findExisting, checkLimit, writeReveal]) m.mockReset();
  ipBudget = vi.fn().mockResolvedValue(true);
  findAnimal.mockResolvedValue(animal);
  findShelter.mockResolvedValue(shelter);
  findExisting.mockResolvedValue(null);
  checkLimit.mockResolvedValue("new_shelter");
  writeReveal.mockImplementation(async (_db, r) => r);
});

describe("animals.reveal with a validated kabinet session", () => {
  it("returns the contact without recording, reading or counting per adopter, but spends the per-IP budget", async () => {
    const view = await reveal(context(async () => true));

    expect(view.shelterContact.contact).toEqual(shelter.contact);
    expect(view.animalId).toBe(animal.id);
    expect(writeReveal).not.toHaveBeenCalled();
    expect(checkLimit).not.toHaveBeenCalled();
    expect(findExisting).not.toHaveBeenCalled();
    expect(ipBudget).toHaveBeenCalledTimes(1);
  });

  it("returns the same view shape as a recorded reveal", async () => {
    const { id: _a, ...visitor } = await reveal(context());
    const { id: _b, ...kabinet } = await reveal(context(async () => true));
    expect(kabinet).toEqual(visitor);
  });

  it("is refused like anyone else once the per-IP budget is spent", async () => {
    ipBudget.mockResolvedValue(false);
    await expect(reveal(context(async () => true))).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(writeReveal).not.toHaveBeenCalled();
  });

  it("still reveals for an adopter whose per-adopter budget is used up", async () => {
    checkLimit.mockRejectedValue(errors.RATE_LIMITED());
    await expect(reveal(context(async () => true))).resolves.toBeDefined();
    await expect(reveal(context())).rejects.toBeDefined();
  });

  it("neither changes nor deletes an existing reveal of that adopter and animal", async () => {
    findExisting.mockResolvedValue({ id: "existing" });
    await reveal(context(async () => true));
    expect(writeReveal).not.toHaveBeenCalled();
    expect(findExisting).not.toHaveBeenCalled();
  });

  it("still refuses an undiscoverable animal and an unverified shelter", async () => {
    findAnimal.mockResolvedValue(
      makeAnimal({ shelterId: shelter.id, listing: { status: "draft" } as never }),
    );
    await expect(reveal(context(async () => true))).rejects.toMatchObject({
      code: "ANIMAL_NOT_AVAILABLE",
    });

    findAnimal.mockResolvedValue(animal);
    findShelter.mockResolvedValue(null);
    await expect(reveal(context(async () => true))).rejects.toMatchObject({
      code: "SHELTER_NOT_VISIBLE",
    });
    expect(ipBudget).not.toHaveBeenCalled();
  });
});

describe("animals.reveal without a valid kabinet session is a visitor", () => {
  const recordedAndBudgeted = () => {
    expect(checkLimit).toHaveBeenCalledTimes(1);
    expect(writeReveal).toHaveBeenCalledTimes(1);
    expect(ipBudget).toHaveBeenCalledTimes(1);
  };

  it("cookie present but the session invalid or lapsed", async () => {
    await reveal(context(async () => false));
    recordedAndBudgeted();
  });

  it("the lookup throws (kabinet auth unavailable included)", async () => {
    await reveal(
      context(async () => {
        throw new Error("kabinet auth unavailable");
      }),
    );
    recordedAndBudgeted();
  });

  it("no lookup at all (no kabinet cookie, or an in-process context)", async () => {
    await reveal(context(undefined));
    recordedAndBudgeted();
  });
});
