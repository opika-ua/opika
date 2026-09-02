import { uk } from "@opika/i18n";
import { describe, expect, it } from "vitest";
import { spayNeuterRow, vaccinationRow } from "./medical-labels";

/**
 * Every branch here except "confirmed, shelter_declared" is structurally
 * unreachable by the Playwright harness — today's seed data (`packages/db
 * /src/seed.ts`) never produces a registry-sourced or in_progress
 * attestation, so this is the only place `source: "registry"` and
 * `state: "in_progress"` get exercised at all until real registry data
 * exists. Asserted against literal transcribed strings, not `uk.medical.*`
 * read back — `docs/standing-constraints.md`: "a test may not compare
 * output against the same constant the code renders."
 */
describe("vaccinationRow", () => {
  it("unknown: reads as 'Не записано', unknown bar", () => {
    const row = vaccinationRow({
      source: "shelter_declared",
      state: "unknown",
      declaredAt: new Date(),
    });
    expect(row.label).toBe("Комплексне щеплення");
    expect(row.statusText).toBe("Не записано");
    expect(row.barClassName).toBe("bg-rg-fill-strong");
  });

  it("in_progress: reads as 'У процесі', shelter-declared bar", () => {
    const row = vaccinationRow({
      source: "shelter_declared",
      state: "in_progress",
      declaredAt: new Date(),
    });
    expect(row.statusText).toBe("У процесі");
    expect(row.barClassName).toBe("bg-rg-ink-3");
  });

  it("confirmed + shelter_declared: reads as the general combo vaccination, shelter's-words bar", () => {
    const row = vaccinationRow({
      source: "shelter_declared",
      state: "confirmed",
      declaredAt: new Date(),
    });
    expect(row.label).toBe("Комплексне щеплення");
    expect(row.statusText).toBe("Слова притулку");
    expect(row.barClassName).toBe("bg-rg-ink-3");
  });

  it("confirmed + registry: reads as rabies specifically, registry bar — the one variant today's seed data never produces", () => {
    const row = vaccinationRow({
      source: "registry",
      state: "confirmed",
      registryRef: "UA-123",
      verifiedAt: new Date(),
    });
    expect(row.label).toBe("Сказ");
    expect(row.statusText).toBe("Реєстр тварин");
    expect(row.barClassName).toBe("bg-rg-registry");
  });
});

describe("spayNeuterRow", () => {
  it("unknown: reads as 'Не записано'", () => {
    const row = spayNeuterRow({
      source: "shelter_declared",
      state: "unknown",
      declaredAt: new Date(),
    });
    expect(row.label).toBe("Стерилізація");
    expect(row.statusText).toBe("Не записано");
    expect(row.barClassName).toBe("bg-rg-fill-strong");
  });

  it("in_progress: reads as 'У процесі'", () => {
    const row = spayNeuterRow({
      source: "shelter_declared",
      state: "in_progress",
      declaredAt: new Date(),
    });
    expect(row.statusText).toBe("У процесі");
    expect(row.barClassName).toBe("bg-rg-ink-3");
  });

  it("confirmed: reads as the shelter's own words, never a registry badge — SpayNeuterStatus admits no registry variant at all", () => {
    const row = spayNeuterRow({
      source: "shelter_declared",
      state: "confirmed",
      declaredAt: new Date(),
    });
    expect(row.statusText).toBe("Слова притулку");
    expect(row.barClassName).toBe("bg-rg-ink-3");
  });
});

/** Confirms the literal strings above actually match this repo's own i18n source, not a copy that's drifted. */
describe("literal strings match uk.ts", () => {
  it("medical labels", () => {
    expect(uk.medical.unknown).toBe("Не записано");
    expect(uk.medical.inProgress).toBe("У процесі");
    expect(uk.medical.rabies).toBe("Сказ");
    expect(uk.medical.vaccination).toBe("Комплексне щеплення");
    expect(uk.medical.spayNeuter).toBe("Стерилізація");
    expect(uk.medical.registry).toBe("Реєстр тварин");
    expect(uk.medical.shelterDeclared).toBe("Слова притулку");
  });
});
