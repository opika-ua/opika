import { fileURLToPath } from "node:url";
import { CityIdSchema } from "@opika/domain";
import { describe, expect, it, vi } from "vitest";
import {
  buildAnimal,
  buildShelter,
  deterministicId,
  refuseIfInsideRepo,
} from "../src/onboard-shelter";

const SECRET_A = "a".repeat(32);
const SECRET_B = "b".repeat(32);

const EXACT_ADDRESS = {
  line1: "вул. Незалежності, 12",
  line2: null,
  postalCode: null,
  cityId: CityIdSchema.parse(deterministicId("city:brovary")),
  district: null,
  coordinates: { lat: 50.5111, lng: 30.7903 },
};

const SHELTER_INPUT = {
  idSeed: "test-shelter",
  displayName: "Тестовий притулок",
  descriptionUk: "Опис.",
  legalEntity: { kind: "unregistered_initiative" as const, contactPersonName: "Олена" },
  exactAddress: EXACT_ADDRESS,
  contact: {
    primary: { kind: "phone" as const, e164: "+380671234567" },
    additional: [],
  },
  donation: null,
  freshnessSentenceUk: "Оновлюємо щотижня.",
  vettedByName: "Олексій",
};

const now = new Date("2026-09-06T12:00:00Z");

/**
 * The whole point of `onboard-shelter.ts`, verified directly rather than
 * trusted: a real exact address must never be recoverable from what gets
 * stored, and the offset must actually depend on the secret — not just be
 * "some fixed transform" that happens to differ numerically.
 */
describe("buildShelter's public location", () => {
  it("does not equal the exact coordinates", () => {
    const shelter = buildShelter(SHELTER_INPUT, now, SECRET_A);
    expect(shelter.publicLocation.precision).toBe("fuzzed_address");
    if (shelter.publicLocation.precision !== "fuzzed_address") throw new Error("unreachable");
    expect(shelter.publicLocation.approximate.center).not.toEqual(EXACT_ADDRESS.coordinates);
  });

  it("differs between two different secrets — proof the offset is actually keyed, not just non-zero", () => {
    const a = buildShelter(SHELTER_INPUT, now, SECRET_A);
    const b = buildShelter(SHELTER_INPUT, now, SECRET_B);
    if (
      a.publicLocation.precision !== "fuzzed_address" ||
      b.publicLocation.precision !== "fuzzed_address"
    ) {
      throw new Error("unreachable");
    }
    expect(a.publicLocation.approximate.center).not.toEqual(b.publicLocation.approximate.center);
  });

  it("throws on a secret shorter than 32 characters — productionLocationPolicy's own guard, exercised through this caller", () => {
    // The property this test actually verifies: buildShelter really does
    // call productionLocationPolicy, not merely something that behaves
    // similarly. testOnlyLocationPolicy (packages/domain) carries no such
    // guard — mutation-tested by temporarily swapping the import in
    // onboard-shelter.ts to confirm this exact assertion, and only this
    // one, catches the swap; the two tests above still pass either way,
    // since both policies produce *some* keyed-looking variation.
    expect(() => buildShelter(SHELTER_INPUT, now, "short")).toThrow(/32 characters/);
  });
});

describe("buildShelter and buildAnimal ids", () => {
  it("are deterministic across two calls with the same input — re-running the script must not duplicate rows", () => {
    const first = buildShelter(SHELTER_INPUT, now, SECRET_A);
    const second = buildShelter(SHELTER_INPUT, now, SECRET_A);
    expect(first.id).toBe(second.id);
  });

  it("differ between a shelter and an animal sharing the same idSeed — a namespace collision must not be possible", () => {
    const shelter = buildShelter(SHELTER_INPUT, now, SECRET_A);
    const animal = buildAnimal(
      {
        idSeed: "test-shelter",
        name: "Ластівка",
        species: "dog",
        sex: "female",
        size: "medium",
        ageBucket: "adult",
        descriptionUk: "Опис.",
        photos: [{ storageKey: "/seed-photos/dog-1.jpg", width: 800, height: 1000 }],
      },
      shelter.id,
      now,
    );
    expect(animal.id).not.toBe(shelter.id);
  });
});

describe("refuseIfInsideRepo", () => {
  it("exits the process when the input path is inside the repository", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => refuseIfInsideRepo(fileURLToPath(import.meta.url))).toThrow("process.exit called");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("inside the repository"));

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("does not exit for a path outside the repository", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    expect(() => refuseIfInsideRepo("/tmp/shelter-brovary.json")).not.toThrow();
    exitSpy.mockRestore();
  });
});
