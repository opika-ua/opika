import { describe, expect, it } from "vitest";
import {
  inSentenceOperatorName,
  operatorDisplayName,
  operatorNameOf,
  standaloneOperatorName,
} from "./operator";

/**
 * RS-Q2 (Oleksii): missing var → the catalogue's fallback, never a boot failure. The fallback
 * is the role since R-UI answer 9 (2026-10-17), verbatim: "Role label «адміністратор сайту»
 * (also replaces the «Оператор реєстру» fallback)." Standing alone it is capitalised, round 2
 * answer 6, verbatim: "Email signature fallback: capitalise it → «— Адміністратор сайту»."
 * Expected text typed from his words, never read from the catalogue.
 */
describe("operatorNameOf", () => {
  it("uses the configured name, trimmed", () => {
    expect(operatorNameOf({ KABINET_OPERATOR_DISPLAY_NAME: "  Олексій " })).toEqual({
      kind: "configured",
      name: "Олексій",
    });
  });

  it("is the fallback when the variable is unset or blank", () => {
    expect(operatorNameOf({})).toEqual({ kind: "fallback" });
    expect(operatorNameOf({ KABINET_OPERATOR_DISPLAY_NAME: "   " })).toEqual({
      kind: "fallback",
    });
  });
});

describe("the name, standing alone and inside a sentence", () => {
  it("is the configured name either way", () => {
    const configured = { kind: "configured", name: "Олексій Колотенко" } as const;
    expect(standaloneOperatorName(configured)).toBe("Олексій Колотенко");
    expect(inSentenceOperatorName(configured)).toBe("Олексій Колотенко");
  });

  it("unset: capitalised standing alone, lower case inside a sentence", () => {
    expect(standaloneOperatorName({ kind: "fallback" })).toBe("Адміністратор сайту");
    expect(inSentenceOperatorName({ kind: "fallback" })).toBe("адміністратор сайту");
  });
});

describe("operatorDisplayName (what signs both emails)", () => {
  it("uses the configured name, trimmed", () => {
    expect(operatorDisplayName({ KABINET_OPERATOR_DISPLAY_NAME: "  Олексій " })).toBe("Олексій");
  });

  it("falls back to «Адміністратор сайту» when the variable is unset or blank", () => {
    expect(operatorDisplayName({})).toBe("Адміністратор сайту");
    expect(operatorDisplayName({ KABINET_OPERATOR_DISPLAY_NAME: "   " })).toBe(
      "Адміністратор сайту",
    );
  });
});
