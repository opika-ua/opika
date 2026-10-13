import { describe, expect, it } from "vitest";
import { operatorDisplayName } from "./operator";

/** RS-Q2 (Oleksii): missing var → «Оператор реєстру» from the catalogue, never a boot failure. */
describe("operatorDisplayName", () => {
  it("uses the configured name, trimmed", () => {
    expect(operatorDisplayName({ KABINET_OPERATOR_DISPLAY_NAME: "  Олексій " })).toBe("Олексій");
  });

  it("falls back to «Оператор реєстру» when the variable is unset", () => {
    expect(operatorDisplayName({})).toBe("Оператор реєстру");
  });

  it("falls back when the variable is blank", () => {
    expect(operatorDisplayName({ KABINET_OPERATOR_DISPLAY_NAME: "   " })).toBe("Оператор реєстру");
  });
});
