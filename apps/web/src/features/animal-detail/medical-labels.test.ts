import { uk } from "@opika/i18n";
import { describe, expect, it } from "vitest";
import { spayNeuterRow, vaccinationRow } from "./medical-labels";

/**
 * Every branch here except "confirmed, shelter_declared" is structurally
 * unreachable by the Playwright harness - today's seed data (`packages/db
 * /src/seed.ts`) never produces a registry-sourced or in_progress
 * attestation, so this is the only place `source: "registry"` and
 * `state: "in_progress"` get exercised at all until real registry data
 * exists. Asserted against literal transcribed strings, not `uk.medical.*`
 * read back - `docs/standing-constraints.md`: "a test may not compare
 * output against the same constant the code renders."
 */
describe("vaccinationRow", () => {
  it("unknown: reads as 'Не записано'", () => {
    const row = vaccinationRow({
      source: "shelter_declared",
      state: "unknown",
      declaredAt: new Date(),
    });
    expect(row.label).toBe("Комплексне щеплення");
    expect(row.statusText).toBe("Не записано");
  });

  it("in_progress: reads as 'У процесі'", () => {
    const row = vaccinationRow({
      source: "shelter_declared",
      state: "in_progress",
      declaredAt: new Date(),
    });
    expect(row.statusText).toBe("У процесі");
  });

  it("confirmed + shelter_declared: reads as the general combo vaccination", () => {
    const row = vaccinationRow({
      source: "shelter_declared",
      state: "confirmed",
      declaredAt: new Date(),
    });
    expect(row.label).toBe("Комплексне щеплення");
    // DR1-Q1, option (c), his label (2026-10-20): «Слова притулку» is the shelter page's alone.
    // Copy audit 2026-10-22 #16 (his decision, with DR1-Q1): the line says it was done, and by whom.
    expect(row.statusText).toBe("Зроблено, за даними притулку");
  });

  it("confirmed + registry: reads as rabies specifically - the one variant today's seed data never produces", () => {
    const row = vaccinationRow({
      source: "registry",
      state: "confirmed",
      registryRef: "UA-123",
      verifiedAt: new Date(),
    });
    expect(row.label).toBe("Щеплення від сказу");
    // Q5 of the K3 sheet (Oleksii, verbatim): "`medical.registry` → «Державний реєстр тварин»".
    expect(row.statusText).toBe("Зроблено, за даними державного реєстру тварин");
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
  });

  it("in_progress: reads as 'У процесі'", () => {
    const row = spayNeuterRow({
      source: "shelter_declared",
      state: "in_progress",
      declaredAt: new Date(),
    });
    expect(row.statusText).toBe("У процесі");
  });

  it("confirmed: reads as the shelter's own words, never a registry badge - SpayNeuterStatus admits no registry variant at all", () => {
    const row = spayNeuterRow({
      source: "shelter_declared",
      state: "confirmed",
      declaredAt: new Date(),
    });
    // DR1-Q1, option (c), his label (2026-10-20): «Слова притулку» is the shelter page's alone.
    // Copy audit 2026-10-22 #16 (his decision, with DR1-Q1): the line says it was done, and by whom.
    expect(row.statusText).toBe("Зроблено, за даними притулку");
  });
});

/** Confirms the literal strings above actually match this repo's own i18n source, not a copy that's drifted. */
describe("literal strings match uk.ts", () => {
  it("medical labels", () => {
    expect(uk.medical.unknown).toBe("Не записано");
    expect(uk.medical.inProgress).toBe("У процесі");
    expect(uk.medical.rabies).toBe("Щеплення від сказу");
    expect(uk.medical.vaccination).toBe("Комплексне щеплення");
    expect(uk.medical.spayNeuter).toBe("Стерилізація");
    expect(uk.medical.registry).toBe("Зроблено, за даними державного реєстру тварин");
    expect(uk.medical.shelterDeclared).toBe("Дані притулку");
    expect(uk.medical.doneShelterDeclared).toBe("Зроблено, за даними притулку");
  });
});
