import { AnimalIdSchema } from "@opika/domain";
import { describe, expect, it } from "vitest";

/**
 * docs/gallery-contract-decisions.md §6: `/tvaryny/gortaty` (the deck,
 * docs/design/README.md "Gallery ↔ Deck") is a static sibling of
 * `/tvaryny/[animalId]` (the card's link target). Next resolves the static
 * segment first, so the two only conflict if an `AnimalId` could literally
 * equal `"gortaty"` — asserted here rather than left as a paragraph's claim.
 */
describe("the /tvaryny/gortaty namespace cannot collide with an AnimalId", () => {
  it("rejects the literal route segment as a UUID", () => {
    expect(AnimalIdSchema.safeParse("gortaty").success).toBe(false);
  });

  it("rejects it for both reasons stated in the decision — length and charset", () => {
    expect("gortaty").toHaveLength(7); // a UUID is 36
    expect("gortaty").not.toMatch(/^[0-9a-f-]+$/); // g, o, r, t, y aren't hex digits
  });
});
