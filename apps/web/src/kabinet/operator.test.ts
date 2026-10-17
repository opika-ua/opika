import { describe, expect, it } from "vitest";
import { operatorDisplayName } from "./operator";

/**
 * RS-Q2 (Oleksii): missing var → the catalogue's fallback, never a boot failure. The fallback
 * is «адміністратор сайту» since R-UI answer 9 (2026-10-17), verbatim: "Role label «адміністратор
 * сайту» (also replaces the «Оператор реєстру» fallback)."
 */
describe("operatorDisplayName", () => {
  it("uses the configured name, trimmed", () => {
    expect(operatorDisplayName({ KABINET_OPERATOR_DISPLAY_NAME: "  Олексій " })).toBe("Олексій");
  });

  it("falls back to «адміністратор сайту» when the variable is unset", () => {
    expect(operatorDisplayName({})).toBe("адміністратор сайту");
  });

  it("falls back when the variable is blank", () => {
    expect(operatorDisplayName({ KABINET_OPERATOR_DISPLAY_NAME: "   " })).toBe(
      "адміністратор сайту",
    );
  });
});
