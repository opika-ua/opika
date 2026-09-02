import { basename, resolve, sep } from "node:path";
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

/** Satisfies DEFAULT_VERIFICATION_POLICY's unregistered_initiative row: one site_visit, two reference_contacts. */
const SUFFICIENT_EVIDENCE = [
  { kind: "site_visit" as const, notes: "Особисто говорив з Оленою по телефону 1 вересня." },
  {
    kind: "reference_contact" as const,
    name: "Сусідній притулок «Хвостатий дім»",
    channel: { kind: "phone" as const, e164: "+380671111111" },
    relationship: "partner_organisation" as const,
  },
  {
    kind: "reference_contact" as const,
    name: "Ветклініка «Айболить»",
    channel: { kind: "phone" as const, e164: "+380672222222" },
    relationship: "veterinary_clinic" as const,
  },
];

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
  evidence: SUFFICIENT_EVIDENCE,
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

describe("buildShelter's evidence requirement", () => {
  it("throws when the supplied evidence doesn't meet DEFAULT_VERIFICATION_POLICY for the legal entity kind", () => {
    const insufficientInput = {
      ...SHELTER_INPUT,
      evidence: [{ kind: "site_visit" as const, notes: "Один візит, без референсів." }],
    };
    expect(() => buildShelter(insufficientInput, now, SECRET_A)).toThrow(
      /DEFAULT_VERIFICATION_POLICY/,
    );
  });

  it("does not fabricate a reference_contact pointing at the shelter's own number — evidence comes only from what the input actually supplied", () => {
    const shelter = buildShelter(SHELTER_INPUT, now, SECRET_A);
    const referenceContacts = shelter.verification.evidence.items.filter(
      (item) => item.kind === "reference_contact",
    );
    for (const ref of referenceContacts) {
      expect(ref.channel).not.toEqual(SHELTER_INPUT.contact.primary);
    }
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
        photos: [{ localPath: "dog-1.jpg" }],
      },
      [{ storageKey: "animals/test/0", width: 800, height: 1000, alt: null }],
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

  /**
   * `resolve()` normalises `..` away, so this is the guard working as
   * intended rather than a hole — asserted because the normalisation is the
   * whole reason a `..` path cannot be used to smuggle a real shelter file
   * back into the working tree under a different-looking name.
   */
  it("exits for a path that leaves the repository and comes back via ..", () => {
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const repoRoot = resolve(fileURLToPath(import.meta.url), "../../../..");
    // Assembled with `sep` rather than `join`, which would normalise the
    // `..` away here in the test and leave the guard's own normalisation
    // untested.
    const roundTrip = [
      repoRoot,
      "..",
      basename(repoRoot),
      "packages",
      "db",
      "test",
      "onboard-shelter.test.ts",
    ].join(sep);
    expect(roundTrip, "the path under test must actually contain a .. segment").toContain("..");
    expect(() => refuseIfInsideRepo(roundTrip)).toThrow("process.exit called");

    vi.restoreAllMocks();
  });

  /**
   * Windows-only because it is a Windows-only hole, and this script is run
   * from a Windows machine (`CLAUDE.md`'s "Windows development notes"): NTFS
   * is case-insensitive, so `d:...` and `D:...` name the same file, and a
   * case-sensitive `startsWith` against the repo root would let the
   * lowercase spelling through. Fails on that platform if `canonicalPath`
   * stops case-folding; on POSIX a differently-cased path is a genuinely
   * different file, so there is nothing to assert.
   */
  it.runIf(process.platform === "win32")(
    "exits for a differently-cased spelling of a path inside the repository",
    () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit called");
      });
      vi.spyOn(console, "error").mockImplementation(() => {});

      const inRepo = fileURLToPath(import.meta.url);
      expect(() => refuseIfInsideRepo(inRepo.toLowerCase())).toThrow("process.exit called");
      expect(() => refuseIfInsideRepo(inRepo.toUpperCase())).toThrow("process.exit called");
      expect(exitSpy).toHaveBeenCalled();

      vi.restoreAllMocks();
    },
  );

  it("does not exit for a path outside the repository", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    expect(() => refuseIfInsideRepo("/tmp/shelter-brovary.json")).not.toThrow();
    exitSpy.mockRestore();
  });
});
