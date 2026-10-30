import { type DraftAnimal, PUBLISH_GAP_KINDS, publishReadinessOf } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { ANIMAL_TABS, animalTabOf } from "./animal-tabs";
import { emptyValues, type FormValues } from "./form-values";
import { GAP_TAB, gapsOf, tabStatusOf } from "./publish-gaps";

const filled: FormValues = {
  ...emptyValues("2026-10-17"),
  sex: "male",
  size: "medium",
  bucket: "young",
  description: "Спокійна.",
};

type Present = Record<(typeof PUBLISH_GAP_KINDS)[number], boolean>;

/** Every combination of the five publish fields, filled or missing. */
const MATRIX = Array.from(
  { length: 2 ** PUBLISH_GAP_KINDS.length },
  (_, mask) =>
    Object.fromEntries(
      PUBLISH_GAP_KINDS.map((kind, bit) => [kind, (mask & (1 << bit)) !== 0]),
    ) as Present,
);

const valuesFor = (present: Present): FormValues => ({
  ...filled,
  sex: present.sex ? "male" : "unknown",
  size: present.size ? "medium" : null,
  bucket: present.age ? "young" : null,
  description: present.description ? "Спокійна." : "   ",
});

/** The domain's own readiness for the same facts: the form's gaps must be exactly its gaps. */
const domainGaps = (present: Present) => {
  const readiness = publishReadinessOf({
    sex: present.sex ? "male" : "unknown",
    size: present.size ? "medium" : null,
    age: present.age ? { kind: "declared_bucket" } : null,
    description: present.description ? { uk: "Спокійна.", en: null } : null,
    photos: present.photo ? [{}] : [],
  } as unknown as DraftAnimal);
  return readiness.kind === "gaps" ? readiness.gaps.map((gap) => gap.kind) : [];
};

describe("the tab badges follow the publish validation", () => {
  it.each(MATRIX.map((present, index) => [index, present] as const))(
    "combination %i: the form's gaps equal publishReadinessOf's, and each badge follows them",
    (_index, present) => {
      const gaps = gapsOf(valuesFor(present), present.photo ? 1 : 0);
      expect(gaps.map((gap) => gap.kind)).toEqual(domainGaps(present));
      const missingTabs = new Set(gaps.map((gap) => GAP_TAB[gap.kind]));
      for (const tab of ANIMAL_TABS) {
        const status = tabStatusOf(tab, gaps);
        if (tab === "zdorovia" || tab === "publikatsiia") expect(status).toBeNull();
        else expect(status).toBe(missingTabs.has(tab) ? "incomplete" : "complete");
      }
    },
  );

  it("every gap kind lands on a tab", () => {
    for (const kind of PUBLISH_GAP_KINDS) expect(ANIMAL_TABS).toContain(GAP_TAB[kind]);
  });
});

describe("?tab=", () => {
  it("reads each tab's slug, and falls back to the first", () => {
    for (const tab of ANIMAL_TABS) expect(animalTabOf(tab)).toBe(tab);
    expect(animalTabOf(undefined)).toBe("osnovne");
    expect(animalTabOf("nonsense")).toBe("osnovne");
  });
});
