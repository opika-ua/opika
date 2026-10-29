import { basename, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { CityIdSchema, EdrpouSchema } from "@opika/domain";
import { describe, expect, it, vi } from "vitest";
import {
  buildAnimal,
  buildShelter,
  deterministicId,
  OnboardInputSchema,
  refuseIfInsideRepo,
  withCityIdFromSlug,
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
  {
    kind: "site_visit" as const,
    visitedOn: "2026-09-01",
    notes: "Особисто говорив з Оленою по телефону 1 вересня.",
  },
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
 * stored, and the offset must actually depend on the secret - not just be
 * "some fixed transform" that happens to differ numerically.
 */
describe("buildShelter's public location", () => {
  it("does not equal the exact coordinates", () => {
    const shelter = buildShelter(SHELTER_INPUT, now, SECRET_A);
    expect(shelter.publicLocation.precision).toBe("fuzzed_address");
    if (shelter.publicLocation.precision !== "fuzzed_address") throw new Error("unreachable");
    expect(shelter.publicLocation.approximate.center).not.toEqual(EXACT_ADDRESS.coordinates);
  });

  it("differs between two different secrets - proof the offset is actually keyed, not just non-zero", () => {
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

  it("throws on a secret shorter than 32 characters - productionLocationPolicy's own guard, exercised through this caller", () => {
    // The property this test actually verifies: buildShelter really does
    // call productionLocationPolicy, not merely something that behaves
    // similarly. testOnlyLocationPolicy (packages/domain) carries no such
    // guard - mutation-tested by temporarily swapping the import in
    // onboard-shelter.ts to confirm this exact assertion, and only this
    // one, catches the swap; the two tests above still pass either way,
    // since both policies produce *some* keyed-looking variation.
    expect(() => buildShelter(SHELTER_INPUT, now, "short")).toThrow(/32 characters/);
  });

  /** H2-9: the visit's date is the day it happened, credited to the operator recording it. */
  it("dates a site visit by visitedOn and credits it to the founder stand-in", () => {
    const shelter = buildShelter(SHELTER_INPUT, now, SECRET_A);
    const visit = shelter.verification.evidence.items.find((item) => item.kind === "site_visit");
    expect(visit).toMatchObject({
      kind: "site_visit",
      visitedAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(visit && "visitedBy" in visit && visit.visitedBy).toBe(
      deterministicId("moderator:founder-manual-vetting"),
    );
  });

  /** Until the private evidence bucket exists (H2-6), a typed key points at nothing this system issued. */
  it.each([
    {
      kind: "edrpou_registration" as const,
      edrpou: EdrpouSchema.parse("12345678"),
      registeredName: "ГО «ДОМІВКА»",
      documentKey: "photos/public/extract.jpg",
    },
    {
      kind: "bank_account_holder" as const,
      holderName: "ГО «Домівка»",
      documentKey: "photos/public/statement.jpg",
    },
  ])("refuses a typed documentKey on $kind evidence", (keyed) => {
    const withKey = { ...SHELTER_INPUT, evidence: [...SUFFICIENT_EVIDENCE, keyed] };
    expect(() => buildShelter(withKey, now, SECRET_A)).toThrow(
      new RegExp(`${keyed.kind}.documentKey must be omitted`),
    );
  });

  it("refuses a site visit dated after the day it is recorded", () => {
    const futureVisit = {
      ...SHELTER_INPUT,
      evidence: [
        { kind: "site_visit" as const, visitedOn: "2026-09-07", notes: "Завтра поїду" },
        ...SUFFICIENT_EVIDENCE.slice(1),
      ],
    };
    expect(() => buildShelter(futureVisit, now, SECRET_A)).toThrow(/2026-09-07 is after today/);
  });
});

describe("buildShelter's evidence requirement", () => {
  it("throws when the supplied evidence doesn't meet DEFAULT_VERIFICATION_POLICY for the legal entity kind", () => {
    const insufficientInput = {
      ...SHELTER_INPUT,
      evidence: [
        {
          kind: "site_visit" as const,
          visitedOn: "2026-09-01",
          notes: "Один візит, без референсів.",
        },
      ],
    };
    expect(() => buildShelter(insufficientInput, now, SECRET_A)).toThrow(
      /DEFAULT_VERIFICATION_POLICY/,
    );
  });

  it("does not fabricate a reference_contact pointing at the shelter's own number - evidence comes only from what the input actually supplied", () => {
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
  it("are deterministic across two calls with the same input - re-running the script must not duplicate rows", () => {
    const first = buildShelter(SHELTER_INPUT, now, SECRET_A);
    const second = buildShelter(SHELTER_INPUT, now, SECRET_A);
    expect(first.id).toBe(second.id);
  });

  it("differ between a shelter and an animal sharing the same idSeed - a namespace collision must not be possible", () => {
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
      shelter,
      now,
    );
    expect(animal.id).not.toBe(shelter.id);
  });

  /**
   * S8-F5, hook 3: this script is the one real path that inserts an animal
   * already `published` under a shelter already `verified` - both the
   * publish-transition hook and the verification-transition hook never run
   * for it, so this insert is the only chance to stamp `everServedAt`.
   */
  it("stamps everServedAt at insert, since every shelter this script creates is already verified", () => {
    const shelter = buildShelter(SHELTER_INPUT, now, SECRET_A);
    expect(shelter.verification.status).toBe("verified");
    const animal = buildAnimal(
      {
        idSeed: "test-shelter-served",
        name: "Ластівка",
        species: "dog",
        sex: "female",
        size: "medium",
        ageBucket: "adult",
        descriptionUk: "Опис.",
        photos: [{ localPath: "dog-1.jpg" }],
      },
      [{ storageKey: "animals/test/1", width: 800, height: 1000, alt: null }],
      shelter,
      now,
    );
    expect(animal.listing.kind).toBe("published");
    expect(animal.everServedAt).toEqual(now);
  });
});

/**
 * K-Q6: "operator sentences get the same validation." The script parses its
 * input file with this schema before anything is built or written, so a
 * refusal here is a refusal before the dry-run printout.
 */
describe("OnboardInputSchema's text rules", () => {
  const ANIMAL_INPUT = {
    idSeed: "test-animal",
    name: "Ластівка",
    species: "dog",
    sex: "female",
    size: "medium",
    ageBucket: "adult",
    descriptionUk: "Опис.",
    photos: [{ localPath: "dog-1.jpg" }],
  };
  const parse = (shelter: object, animal: object = {}) =>
    OnboardInputSchema.safeParse({
      shelter: { ...SHELTER_INPUT, ...shelter },
      animals: [{ ...ANIMAL_INPUT, ...animal }],
    });

  it("trims the freshness sentence", () => {
    const parsed = parse({ freshnessSentenceUk: " Оновлюємо щосуботи. " });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.shelter.freshnessSentenceUk).toBe("Оновлюємо щосуботи.");
  });

  // DR1-Q5: the sentence is shelter-level, so the operator's script refuses the
  // name token too, as the kabinet does; nothing it writes can carry one.
  it.each([["{імʼя}"], ["{Ім'я}"]])("refuses a freshness sentence with %s", (token) => {
    expect(parse({ freshnessSentenceUk: `Чи ${token} ще з нами?` }).success).toBe(false);
  });

  it.each([
    ["an unknown token", "Оновлено {дата}."],
    ["a stray brace", "Оновлено }."],
    ["281 characters", "я".repeat(281)],
    ["a blank sentence (it is required here)", "   "],
  ])("refuses a freshness sentence with %s", (_label, freshnessSentenceUk) => {
    expect(parse({ freshnessSentenceUk }).success).toBe(false);
  });

  it("accepts a 280-character freshness sentence", () => {
    expect(parse({ freshnessSentenceUk: "я".repeat(280) }).success).toBe(true);
  });

  // K-Q11: the same ten-photo cap as the kabinet, so an onboarded animal is one K3 can edit.
  it("accepts ten photos for an animal and refuses eleven", () => {
    const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ localPath: `p${i}.jpg` }));
    expect(parse({}, { photos: photos(10) }).success).toBe(true);
    expect(parse({}, { photos: photos(11) }).success).toBe(false);
  });

  it.each([
    ["the token", "{імʼя}"],
    ["a brace", "Ласт}івка"],
    ["61 characters", "я".repeat(61)],
  ])("refuses an animal name with %s", (_label, name) => {
    expect(parse({}, { name }).success).toBe(false);
  });

  it("trims and accepts a 60-character animal name", () => {
    const parsed = parse({}, { name: ` ${"я".repeat(60)} ` });
    expect(parsed.data?.animals[0]?.name).toBe("я".repeat(60));
  });

  /** Review finding 6: K3's 1,500-character cap, so an onboarded description stays editable there. */
  it("accepts a 1,500-character animal description and refuses 1,501", () => {
    expect(parse({}, { descriptionUk: "я".repeat(1500) }).success).toBe(true);
    const over = parse({}, { descriptionUk: "я".repeat(1501) });
    expect(over.success).toBe(false);
    expect(over.error?.issues.map((issue) => issue.message)).toEqual([
      "Description is 1501 characters; the maximum is 1500",
    ]);
  });

  it("counts the description in characters, not UTF-16 units", () => {
    // 1,500 paw prints are 3,000 UTF-16 units.
    expect(parse({}, { descriptionUk: "🐾".repeat(1500) }).success).toBe(true);
  });

  // SF-F1: onboarding always publishes directly, so unlike a kabinet draft,
  // there is no pre-publish stage where "unknown" is an acceptable sex.
  it("refuses an animal with sex unknown", () => {
    const refused = parse({}, { sex: "unknown" });
    expect(refused.success).toBe(false);
    expect(refused.error?.issues.map((issue) => issue.message)).toContain(
      "Onboarded animals must have a known sex (male or female), not unknown",
    );
  });

  it.each([["male"], ["female"]])("accepts an animal with sex %s", (sex) => {
    expect(parse({}, { sex }).success).toBe(true);
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
   * intended rather than a hole - asserted because the normalisation is the
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

describe("withCityIdFromSlug", () => {
  const CITY_ID = "c1000000-0000-4000-8000-000000000001";
  const withAddress = (address: Record<string, unknown>) => ({
    shelter: { displayName: "x", exactAddress: address },
    animals: [],
  });
  const lookup = async (slug: string) => (slug === "brovary-kyivska" ? { id: CITY_ID } : null);

  it("leaves a file that names its city by id exactly as it was", async () => {
    const raw = withAddress({ line1: "a", cityId: CITY_ID });
    expect(await withCityIdFromSlug(raw, lookup)).toBe(raw);
  });

  it("replaces a slug by the id it resolves to, and drops the slug", async () => {
    const resolved = (await withCityIdFromSlug(
      withAddress({ line1: "a", citySlug: " brovary-kyivska " }),
      lookup,
    )) as { shelter: { exactAddress: Record<string, unknown> } };
    expect(resolved.shelter.exactAddress).toEqual({ line1: "a", cityId: CITY_ID });
  });

  it("refuses a slug nothing answers to, naming it", async () => {
    await expect(
      withCityIdFromSlug(withAddress({ line1: "a", citySlug: "atlantis" }), lookup),
    ).rejects.toThrow(/"atlantis"/);
  });

  it("refuses both an id and a slug, and an empty slug", async () => {
    await expect(
      withCityIdFromSlug(withAddress({ cityId: CITY_ID, citySlug: "brovary-kyivska" }), lookup),
    ).rejects.toThrow(/both cityId and citySlug/);
    await expect(withCityIdFromSlug(withAddress({ citySlug: "" }), lookup)).rejects.toThrow(
      /non-empty/,
    );
  });

  it("feeds the schema, which then accepts the file", async () => {
    const resolved = await withCityIdFromSlug(
      withAddress({ ...EXACT_ADDRESS, cityId: undefined, citySlug: "brovary-kyivska" }),
      lookup,
    );
    const address = (resolved as { shelter: { exactAddress: { cityId: string } } }).shelter
      .exactAddress;
    expect(address.cityId).toBe(CITY_ID);
  });
});
