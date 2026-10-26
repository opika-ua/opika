import { COAT_COLOURS } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { colourChipLabel, colourFilterLabel } from "./colour-labels";

/**
 * The owner-approved table (pet card redesign, Phase 0, 2026-10-26): one
 * neuter form per colour, transcribed rather than read from `uk.ts`.
 */
const NAMES = {
  black: "Чорне",
  white: "Біле",
  grey: "Сіре",
  ginger: "Руде",
  brown: "Коричневе",
  cream: "Кремове",
  black_white: "Чорно-біле",
  tricolour: "Триколірне",
  tabby: "Смугасте",
  spotted: "Плямисте",
} as const;

describe("colourFilterLabel", () => {
  it.each(COAT_COLOURS.map((colour) => [colour, NAMES[colour]] as const))(
    "%s → «%s»",
    (colour, name) => {
      expect(colourFilterLabel(colour)).toBe(name);
    },
  );

  it("returns a distinct, non-empty word for every colour", () => {
    const labels = COAT_COLOURS.map(colourFilterLabel);
    expect(labels.every((label) => label.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(COAT_COLOURS.length);
  });
});

describe("colourChipLabel", () => {
  it.each(COAT_COLOURS.map((colour) => [colour, `${NAMES[colour]} забарвлення`] as const))(
    "%s → «%s»",
    (colour, chip) => {
      expect(colourChipLabel(colour)).toBe(chip);
    },
  );

  it("fills every slot: no brace is left in any chip", () => {
    for (const colour of COAT_COLOURS) {
      expect(colourChipLabel(colour)).not.toMatch(/[{}]/);
    }
  });
});
