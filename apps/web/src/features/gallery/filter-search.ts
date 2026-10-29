import { placeQueryOf, searchLatinOf, searchNameOf, transliterateUk } from "@opika/domain";

/**
 * The client-side search of the Область and Місто lists. It filters the options the page already
 * holds, with the same normalisation the settlement search uses (`placeQueryOf`: case, apostrophes,
 * «м.»/«с.» prefixes, «ґ»/«г», Latin typed for Cyrillic names), so a query means the same thing here
 * as in the kabinet's picker.
 */

/** Half-open `[start, end)` offsets into the original text. */
export type Range = readonly [number, number];

export type PickerOption = {
  readonly value: string;
  readonly label: string;
  /** The second line, only for a name shared by several places. */
  readonly detail: string | null;
  readonly count: number;
  readonly selected: boolean;
};

export type Match = { readonly label: Range | null; readonly detail: Range | null };

export type PickerGroup = "has" | "none";

export type PickerRow = {
  readonly option: PickerOption;
  readonly match: Match;
  /** Null when the list is not grouped. */
  readonly group: PickerGroup | null;
};

const APOSTROPHES = /[\u{02BC}'\u{2019}\u{2018}`\u{02B9}]/u;
const SEPARATOR = /[\s\x2d\u{2010}-\u{2015}]/u;

/** The normalised key of `text` with, for each key character, the offset it came from. */
function keyWithOffsets(text: string, latin: boolean): { key: string; offsets: number[] } {
  let key = "";
  const offsets: number[] = [];
  let offset = 0;
  for (const char of text.normalize("NFC")) {
    const at = offset;
    offset += char.length;
    if (APOSTROPHES.test(char)) continue;
    let piece = char.toLocaleLowerCase("uk");
    if (SEPARATOR.test(piece)) {
      if (key.endsWith(" ")) continue;
      piece = " ";
    } else if (latin) piece = transliterateUk(piece);
    else piece = piece.replaceAll("ґ", "г");
    for (const out of piece) {
      key += out;
      offsets.push(at);
    }
  }
  return { key, offsets };
}

/** Where `query` (already a key) sits in `text`, as offsets into `text`; null when it is absent. */
function findRange(text: string, query: string, latin: boolean): Range | null {
  const { key, offsets } = keyWithOffsets(text, latin);
  const start = key.indexOf(query);
  if (start < 0) return null;
  const last = start + query.length - 1;
  const lastOffset = offsets[last];
  if (offsets[start] === undefined || lastOffset === undefined) return null;
  // The last matched character may span several code units.
  const end = lastOffset + (String.fromCodePoint(text.codePointAt(lastOffset) ?? 0).length || 1);
  return [offsets[start], end];
}

/**
 * Whether `option` matches `rawQuery`, and where, for the bold part. An empty or too-short query
 * matches everything with nothing marked. The hint counts too: «бр» finds a «Миколаївка» whose
 * hint is «Броварський р-н».
 */
export function matchOption(
  option: Pick<PickerOption, "label" | "detail">,
  rawQuery: string,
): Match | null {
  const query = placeQueryOf(rawQuery);
  if (query.kind === "too_short") return { label: null, detail: null };
  const latin = query.cyrillic === null;
  const needle = latin ? query.latin : (query.cyrillic ?? "");
  const labelKey = latin ? searchLatinOf(option.label) : searchNameOf(option.label);
  const detailKey =
    option.detail === null
      ? ""
      : latin
        ? searchLatinOf(option.detail)
        : searchNameOf(option.detail);
  const inLabel = labelKey.includes(needle);
  const inDetail = detailKey.includes(needle);
  if (!inLabel && !inDetail) return null;
  return {
    label: inLabel ? findRange(option.label, needle, latin) : null,
    detail: inDetail && option.detail !== null ? findRange(option.detail, needle, latin) : null,
  };
}

/** Splits `text` around a matched range: `[before, matched, after]`. */
export function splitAtMatch(text: string, range: Range | null): readonly [string, string, string] {
  if (range === null) return [text, "", ""];
  return [text.slice(0, range[0]), text.slice(range[0], range[1]), text.slice(range[1])];
}

/**
 * The rows to draw. Chosen ones first (by `pinned`, the set when the list opened, so a row does not
 * jump away under the pointer while it is being ticked), then by count, then by name. With
 * `grouped`, the options that have animals come first and the empty ones follow, alphabetically.
 */
export function arrangeOptions(
  options: readonly PickerOption[],
  view: { query: string; pinned: ReadonlySet<string>; grouped: boolean },
): PickerRow[] {
  const rows: PickerRow[] = [];
  for (const option of options) {
    const match = matchOption(option, view.query);
    if (match === null) continue;
    const group: PickerGroup | null = view.grouped ? (option.count > 0 ? "has" : "none") : null;
    rows.push({ option, match, group });
  }
  const byName = (a: PickerOption, b: PickerOption) => a.label.localeCompare(b.label, "uk");
  const pinnedFirst = (a: PickerOption, b: PickerOption) =>
    Number(view.pinned.has(b.value)) - Number(view.pinned.has(a.value));
  return rows.sort((a, b) => {
    if (a.group !== b.group) return a.group === "has" ? -1 : 1;
    const pin = pinnedFirst(a.option, b.option);
    if (pin !== 0) return pin;
    if (a.group === "none") return byName(a.option, b.option);
    return b.option.count - a.option.count || byName(a.option, b.option);
  });
}
