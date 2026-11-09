import { describe, expect, it } from "vitest";
import { en } from "./messages/en";
import { uk } from "./messages/uk";

/**
 * A count slot followed by a typed noun («діє {hours} години», «понад {days} днів») is right for
 * one number only: 1, 21 and 48 hours need three different nouns. The slot has to carry its own
 * noun, picked by `pluralizeUk` from a one/few/many object, so such a template fails here. The
 * one/few/many objects themselves («{count} картку») are the right place for the noun and are skipped.
 */
/** «ago» and «тому» follow a filled phrase («понад 30 років тому»); «min» is the abbreviation. */
const SPAN_SLOT =
  /\{(?:hours|minutes|seconds|days|weeks|months|years)\}\s+(?!(?:тому|ago|min)(?![\p{L}]))\p{L}{3,}/u;
/** `{count}` and `{n}` take a verb or a preposition too, so only a known counted noun counts. */
const COUNTED_NOUN =
  /\{(?:count|n)\}\s+(?:картк|тварин|фото|символ|дн|дні|рок|рік|років|годин|хвилин|cards?|animals?|photos?|characters?|days?|years?|hours?|minutes?)/u;
const FORM_KEYS = new Set(["one", "few", "many", "other"]);

export function hardcodedCountNouns(template: string): string[] {
  return [SPAN_SLOT, COUNTED_NOUN].flatMap((pattern) =>
    [...template.matchAll(new RegExp(pattern, "gu"))].map((match) => match[0]),
  );
}

function templates(value: unknown, path: string, inForms: boolean): [string, string][] {
  if (typeof value === "string") return inForms ? [] : [[path, value]];
  if (value === null || typeof value !== "object") return [];
  const entries = Object.entries(value as Record<string, unknown>);
  const isForms = entries.length > 0 && entries.every(([key]) => FORM_KEYS.has(key));
  return entries.flatMap(([key, child]) =>
    templates(child, path ? `${path}.${key}` : key, isForms),
  );
}

describe("a count slot never has a hardcoded plural noun after it", () => {
  it("finds the strings that used to (rows 7 to 10 of the proofread)", () => {
    const old = [
      "Запрошення діє {hours} години. Якщо не встигнете – я надішлю нове.",
      "Посилання спрацює один раз і діє {minutes} хвилин.",
      "{cards} ви не підтверджували понад {days} днів.",
      "Ця дата надто давня – понад {years} років тому.",
      "You haven't confirmed {cards} for more than {days} days.",
      "{count} картки",
    ];
    for (const text of old) expect(hardcodedCountNouns(text), text).not.toEqual([]);
  });

  it("lets the abbreviation, the preposition and the filled phrase through", () => {
    const fine = [
      "Посилання спрацює один раз і діє {minutes} хв.",
      "{count} з {max} символів",
      "Запрошення діє {hours}. Якщо не встигнете – я надішлю нове.",
      "Показати ці картки ({count})",
      "Усі · {count}",
      "Ця дата надто давня – понад {years} тому.",
      "Фото {n} підняте. Позиція {pos} з {total}.",
      "Link expires in {minutes} min.",
    ];
    for (const text of fine) expect(hardcodedCountNouns(text), text).toEqual([]);
  });

  it.each([
    ["uk", uk],
    ["en", en],
  ] as const)("the %s catalogue has none", (_name, catalogue) => {
    const found = templates(catalogue, "", false).flatMap(([path, text]) =>
      hardcodedCountNouns(text).map((hit) => `${path}: ${hit}`),
    );
    expect(found).toEqual([]);
  });
});
