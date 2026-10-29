import { transliterateUk } from "./transliterate";

/**
 * One normalisation, used at import (stored `cities.search_name`, `cities.search_latin`) and at
 * query time (`placeQueryOf`), so a query is compared with a key built the same way.
 * Lowercasing happens here, in TypeScript, and never in SQL: `lower()` on Cyrillic depends on the
 * database's ctype.
 */

const APOSTROPHES = /[\u{02BC}'\u{2019}\u{2018}`\u{02B9}]/gu;
const SEPARATORS = /[\s\x2d\u{2010}-\u{2015}]+/gu;
/** A settlement-kind word the user may type before the name. Word forms need a space after. */
const KIND_PREFIX = /^(?:м\.\s*|с\.\s*|смт\.?\s+|місто\s+|селище\s+|село\s+|с-ще\s+)/u;
const CYRILLIC = /[\u{0400}-\u{04FF}]/u;

export const MIN_PLACE_QUERY_LENGTH = 2;

function normalised(raw: string): string {
  const lowered = raw.normalize("NFC").toLocaleLowerCase("uk").replace(APOSTROPHES, "");
  const withoutPrefix = lowered.trimStart().replace(KIND_PREFIX, "");
  return withoutPrefix.replace(SEPARATORS, " ").trim();
}

/** Cyrillic key: also folds "ґ" to "г" so a user without that key still matches. */
export function searchNameOf(nameUk: string): string {
  return normalised(nameUk).replaceAll("ґ", "г");
}

/** Latin key: the transliteration of the name, keeping "ґ" as "g". */
export function searchLatinOf(nameUk: string): string {
  return transliterateUk(normalised(nameUk)).replace(SEPARATORS, " ").trim();
}

export type PlaceQuery =
  | { kind: "too_short" }
  | { kind: "ok"; cyrillic: string | null; latin: string };

/** `cyrillic` is null for a purely Latin query, which is matched against `search_latin` only. */
export function placeQueryOf(raw: string): PlaceQuery {
  const key = normalised(raw);
  if (key.length < MIN_PLACE_QUERY_LENGTH) return { kind: "too_short" };
  if (CYRILLIC.test(key)) {
    return { kind: "ok", cyrillic: key.replaceAll("ґ", "г"), latin: transliterateUk(key) };
  }
  return { kind: "ok", cyrillic: null, latin: key };
}
