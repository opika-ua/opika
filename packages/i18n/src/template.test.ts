import { describe, expect, it } from "vitest";
import { fillTemplate } from "./template";

describe("fillTemplate", () => {
  it("fills ASCII slots by name", () => {
    expect(fillTemplate("{count} / {max}", { count: "12", max: "280" })).toBe("12 / 280");
  });

  it("never touches the literal Cyrillic braces the copy carries, even given a value by that name", () => {
    // His `errors.unknownToken`, transcribed: `{імʼя}` is text, `{token}` the slot.
    const text = "Підставляється лише {імʼя}. Приберіть «{token}» або напишіть без фігурних дужок.";
    expect(fillTemplate(text, { token: "{дата}", імʼя: "Рекс" })).toBe(
      "Підставляється лише {імʼя}. Приберіть «{дата}» або напишіть без фігурних дужок.",
    );
  });

  it("does not rescan a filled value, and inserts $& literally", () => {
    expect(fillTemplate("«{token}» · {max}", { token: "{max}", max: "280" })).toBe("«{max}» · 280");
    expect(fillTemplate("{host} ↗", { host: "$&.example" })).toBe("$&.example ↗");
  });

  it("leaves a slot with no value visible", () => {
    expect(fillTemplate("Збережено о {time}", {})).toBe("Збережено о {time}");
  });
});
