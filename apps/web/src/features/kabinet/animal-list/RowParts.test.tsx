import { freshnessPips } from "@opika/ui";
import { describe, expect, it } from "vitest";
import { filledPipCount } from "./RowParts";

describe("the row's freshness pips", () => {
  it.each(["fresh", "aging", "stale"] as const)(
    "%s fills as many pips as the deck's marker does",
    (kind) => {
      expect(filledPipCount(kind)).toBe(freshnessPips(kind).filter((p) => p !== "empty").length);
    },
  );
});
