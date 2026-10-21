import { describe, expect, it } from "vitest";
import { shelterWordsOf } from "./shelter-words";

const words = (description: string, sentence: string | null) =>
  shelterWordsOf({
    description: { uk: description, en: null },
    freshnessSentence: sentence === null ? null : { uk: sentence, en: null },
  });

describe("shelterWordsOf", () => {
  it("keeps both parts the shelter wrote", () => {
    expect(words("Опис.", "Оновлюємо щосуботи.")).toEqual({
      description: "Опис.",
      sentence: "Оновлюємо щосуботи.",
    });
  });

  it("keeps either part alone", () => {
    expect(words("Опис.", null)).toEqual({ description: "Опис.", sentence: null });
    expect(words(" ", "Оновлюємо щосуботи.")).toEqual({
      description: null,
      sentence: "Оновлюємо щосуботи.",
    });
  });

  it("is null when the shelter wrote neither, so no heading stands over nothing", () => {
    expect(words("  ", null)).toBeNull();
    expect(words("", "   ")).toBeNull();
  });

  it.each([["{імʼя}"], ["{ім'я}"], ["{ІМ’Я}"]])(
    "leaves out a stored sentence still carrying %s (DR1-Q5)",
    (token) => {
      expect(words("Опис.", `Чи ${token} ще з нами?`)).toEqual({
        description: "Опис.",
        sentence: null,
      });
    },
  );
});
