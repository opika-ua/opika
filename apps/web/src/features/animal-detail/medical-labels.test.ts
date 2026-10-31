import { uk } from "@opika/i18n";
import { describe, expect, it } from "vitest";
import {
  MEDICAL_VALUE_TEXT,
  rowSource,
  sharedSource,
  spayNeuterRow,
  vaccinationRow,
} from "./medical-labels";

const declared = (state: "unknown" | "in_progress" | "confirmed") =>
  ({ source: "shelter_declared", state, declaredAt: new Date() }) as const;
const registry = {
  source: "registry",
  state: "confirmed",
  registryRef: "UA-123",
  verifiedAt: new Date(),
} as const;

describe("vaccinationRow", () => {
  it.each([
    ["unknown", "unknown"],
    ["in_progress", "in_progress"],
    ["confirmed", "done"],
  ] as const)(
    "shelter-declared %s reads as %s, labelled as the combo vaccination",
    (state, value) => {
      const row = vaccinationRow(declared(state));
      expect(row).toEqual({ label: "Комплексне щеплення", value, source: "shelter" });
    },
  );

  it("registry: rabies specifically, done, and the registry is its source - today's seed never produces it", () => {
    expect(vaccinationRow(registry)).toEqual({
      label: "Щеплення від сказу",
      value: "done",
      source: "registry",
    });
  });
});

describe("spayNeuterRow", () => {
  it.each([
    ["unknown", "unknown"],
    ["in_progress", "in_progress"],
    ["confirmed", "done"],
  ] as const)("%s reads as %s, always the shelter's word", (state, value) => {
    expect(spayNeuterRow(declared(state))).toEqual({
      label: "Стерилізація",
      value,
      source: "shelter",
    });
  });
});

describe("source lines", () => {
  it("all shelter rows: one shared line", () => {
    const rows = [vaccinationRow(declared("confirmed")), spayNeuterRow(declared("unknown"))];
    expect(sharedSource(rows)).toBe("За даними притулку");
  });

  it("any registry row: no shared line, each row names its own", () => {
    const rows = [vaccinationRow(registry), spayNeuterRow(declared("confirmed"))];
    expect(sharedSource(rows)).toBeNull();
    expect(rowSource(rows[0] as (typeof rows)[number])).toBe("За даними державного реєстру тварин");
    expect(rowSource(rows[1] as (typeof rows)[number])).toBe("За даними притулку");
  });
});

/** Confirms the literal strings above match this repo's own i18n source. */
describe("literal strings match i18n", () => {
  it("medical labels", () => {
    expect(MEDICAL_VALUE_TEXT).toEqual({
      done: "Зроблено",
      in_progress: "У процесі",
      unknown: "Невідомо",
    });
    expect(uk.medical.rabies).toBe("Щеплення від сказу");
    expect(uk.medical.vaccination).toBe("Комплексне щеплення");
    expect(uk.medical.spayNeuter).toBe("Стерилізація");
    expect(uk.medical.registry).toBe("За даними державного реєстру тварин");
    expect(uk.medical.sourceShelter).toBe("За даними притулку");
  });
});
