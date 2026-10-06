import { AnimalSchema, ShelterContactSchema, ShelterSchema } from "@opika/domain";
import { describe, expect, it } from "vitest";
import {
  buildCities,
  buildDemoAnimals,
  buildDemoShelters,
  buildShelters,
  parseSeedProfile,
} from "../src/seed";

/**
 * Phase 3 (seed profiles, `docs/handoff-2026-10-04.md` §3.4). Separate file
 * from `seed-corpus.test.ts` on purpose: that file's own describe block
 * exercises the `test` profile's 320-animal corpus specifically, and adding
 * a second, differently-shaped corpus's assertions into the same block
 * would blur which profile a given assertion is actually about.
 */

describe("parseSeedProfile", () => {
  it('defaults to "test" with no flag at all', () => {
    expect(parseSeedProfile([])).toBe("test");
  });

  it('returns "test" for an explicit --profile=test', () => {
    expect(parseSeedProfile(["--profile=test"])).toBe("test");
  });

  it('returns "demo" for --profile=demo', () => {
    expect(parseSeedProfile(["--profile=demo"])).toBe("demo");
  });

  it("throws, naming the bad value, for anything else", () => {
    expect(() => parseSeedProfile(["--profile=staging"])).toThrow(/staging/);
  });
});

describe("buildDemoShelters", () => {
  const cities = buildCities();
  const shelters = buildDemoShelters(cities);

  it("returns exactly 2 shelters, each schema-valid as a whole object", () => {
    expect(shelters).toHaveLength(2);
    for (const shelter of shelters) {
      expect(() => ShelterSchema.parse(shelter)).not.toThrow();
    }
  });

  it("reuses real test-corpus identities, not invented ones", () => {
    const testShelters = buildShelters(cities);
    const testNames = new Set(testShelters.map((s) => s.displayName));
    for (const shelter of shelters) {
      expect(testNames.has(shelter.displayName)).toBe(true);
    }
  });

  it("both reused shelters are verified", () => {
    for (const shelter of shelters) {
      expect(shelter.verification.status).toBe("verified");
    }
  });

  /**
   * Two of the handoff's five named hostile cases ("unregistered_initiative",
   * "no freshness sentence") are supposed to be free properties of the
   * reused «Вірний друг» identity, not something this function adds
   * separately — asserted here so a future change to which indices
   * `buildDemoShelters` reuses can't silently drop them.
   */
  it("includes the unregistered_initiative shelter, with no freshness sentence, for free", () => {
    const match = shelters.find((s) => s.legalEntity.kind === "unregistered_initiative");
    expect(match).toBeDefined();
    expect(match?.freshnessSentence).toBeNull();
  });

  // The third named case living on a shelter identity ("long name").
  it("includes the deliberately long shelter name", () => {
    const LONG_NAME_MIN_CHARS = 40;
    const match = shelters.find((s) => s.displayName.length >= LONG_NAME_MIN_CHARS);
    expect(match).toBeDefined();
  });

  /**
   * D-5 (pulled forward to Phase 3) + round-1 Tier 1 review — three
   * separate things a demo shelter can never do if revealed to a real
   * person: look reachable (contact), look payable (donation), or send
   * someone to a real street expecting a shelter that was never there
   * (exact address). Each checked directly against the real value, not
   * inferred from a constant this test and the code would otherwise share.
   */
  it("every contact channel validates, is schema-correct, and carries no real phone or Telegram handle", () => {
    for (const shelter of shelters) {
      expect(() => ShelterContactSchema.parse(shelter.contact)).not.toThrow();

      // Email, not Telegram: round 1 of Tier 1 review found a `demo_`-prefixed
      // Telegram handle is still a real, registerable username — the exact
      // live-contactability risk this profile exists to avoid. An `.invalid`
      // email domain (RFC 2606) cannot be registered or delivered to by
      // anyone, by internet standard rather than by this project's own
      // convention.
      expect(shelter.contact.primary.kind).toBe("email");
      if (shelter.contact.primary.kind === "email") {
        expect(shelter.contact.primary.address).toMatch(/^demo-.+@opika-demo\.invalid$/);
      }

      const phoneChannel = shelter.contact.additional.find((c) => c.kind === "phone");
      expect(phoneChannel).toBeDefined();
      if (phoneChannel?.kind === "phone") {
        // +380000000000 — an all-zero subscriber number, never a real
        // assigned Ukrainian range.
        expect(phoneChannel.e164).toBe("+380000000000");
      }

      expect(shelter.contact.additional.some((c) => c.kind === "telegram")).toBe(false);
    }
  });

  it("has no donation link — the reused identities' real ones point at real payment providers", () => {
    for (const shelter of shelters) {
      expect(shelter.donation).toBeNull();
    }
  });

  it("exact address is an obviously fictional street, at the shelter's own (already public) city centroid", () => {
    for (const shelter of shelters) {
      expect(shelter.exactAddress.line1).toBe("вул. Демонстраційна, 1");
      const city = cities.find((c) => c.id === shelter.exactAddress.cityId);
      expect(city).toBeDefined();
      expect(shelter.exactAddress.coordinates).toEqual(city?.centroid);
    }
  });

  it("publicLocation is recomputed from the demo exactAddress, not left pointing at the real one", () => {
    const realShelters = buildShelters(cities);
    for (const shelter of shelters) {
      const real = realShelters.find((s) => s.displayName === shelter.displayName);
      expect(real).toBeDefined();
      // Different fuzzed output proves publicLocation was actually
      // recomputed from the new exactAddress, not merely copied forward
      // from the real one `buildShelters` originally produced.
      expect(shelter.publicLocation).not.toEqual(real?.publicLocation);
    }
  });
});

describe("buildDemoAnimals", () => {
  const cities = buildCities();
  const shelters = buildDemoShelters(cities);
  const animalRecords = buildDemoAnimals(shelters, cities);
  const animals = animalRecords.map((r) => r.animal);

  it("returns exactly 18 animals, each schema-valid as a whole object", () => {
    expect(animals).toHaveLength(18);
    for (const animal of animals) {
      expect(() => AnimalSchema.parse(animal)).not.toThrow();
    }
  });

  it("every animal belongs to one of the 2 demo shelters, never a test-only one", () => {
    const demoShelterIds = new Set(shelters.map((s) => s.id));
    for (const animal of animals) {
      expect(demoShelterIds.has(animal.shelterId)).toBe(true);
    }
  });

  // The fourth named hostile case: a draft, which `buildAnimals`'s own
  // formula gives zero photos unconditionally regardless of index.
  it("has at least one draft, and every draft has zero photos", () => {
    const drafts = animals.filter((a) => a.listing.kind === "draft");
    expect(drafts.length).toBeGreaterThan(0);
    for (const draft of drafts) {
      expect(draft.photos).toHaveLength(0);
    }
  });

  // The fifth and last named case: the one this function actually overlays
  // rather than getting for free.
  it("has exactly one animal with six photos, from the real D-6 set", () => {
    const matches = animals.filter((a) => a.photos.length === 6);
    expect(matches).toHaveLength(1);
    for (const photo of matches[0]!.photos) {
      expect(photo.storageKey).toMatch(/^seed-photos\/d6-real\//);
    }
  });

  it("the six-photo animal is a dog, matching its real-photo pool", () => {
    const match = animals.find((a) => a.photos.length === 6);
    expect(match?.species).toBe("dog");
  });
});
