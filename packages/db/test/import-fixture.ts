import { strToU8, zipSync } from "fflate";
import type { PinnedEdition } from "../src/import/editions";
import { sha256Of } from "../src/import/editions";

/**
 * A small codifier in the real file's format, built from inline rows with the same library the
 * importer reads it with: three header rows, the seven columns, ASCII category letters, shared
 * strings, sparse cells. The real file is 1.4 MB and is not in the repository.
 */
type Row = readonly [string, string, string, string, string, string, string];

const pad = (value: number, width: number) => String(value).padStart(width, "0");
const zeros = (n: number) => "0".repeat(n);

export const oblast = (oo: string) => `UA${oo}${zeros(15)}`;
export const raion = (oo: string, rr: number) => `UA${oo}${pad(rr, 2)}${zeros(13)}`;
export const hromada = (oo: string, rr: number, ggg: number) =>
  `UA${oo}${pad(rr, 2)}${pad(ggg, 3)}${zeros(10)}`;
export const settlement = (oo: string, rr: number, ggg: number, ppp: number) =>
  `UA${oo}${pad(rr, 2)}${pad(ggg, 3)}${pad(ppp, 3)}00${zeros(5)}`;
export const cityDistrict = (oo: string, n: number) => `UA${oo}${zeros(10)}${pad(n, 5)}`;

const KYIV_OBLAST = "32";
const ODESA = "51";
const KHARKIV = "63";
const LVIV = "46";
const CRIMEA = "01";
const KYIV_CITY = "80";

const o = (oo: string, name: string): Row => [oblast(oo), "", "", "", "", "O", name];
const p = (oo: string, rr: number, name: string): Row => [
  oblast(oo),
  raion(oo, rr),
  "",
  "",
  "",
  "P",
  name,
];
const h = (oo: string, rr: number, ggg: number, name: string): Row => [
  oblast(oo),
  raion(oo, rr),
  hromada(oo, rr, ggg),
  "",
  "",
  "H",
  name,
];
const s = (
  oo: string,
  rr: number,
  ggg: number,
  ppp: number,
  category: "M" | "X" | "C",
  name: string,
): Row => [
  oblast(oo),
  raion(oo, rr),
  hromada(oo, rr, ggg),
  settlement(oo, rr, ggg, ppp),
  "",
  category,
  name,
];

export const FIXTURE_ROWS: readonly Row[] = [
  // The three header rows of the real sheet.
  [
    "Перший рівень",
    "Другий рівень",
    "Третій рівень",
    "Четвертий рівень",
    "Додатковий рівень",
    "Категорія об’єкта",
    "Назва об’єкта",
  ],
  ["", "", "", "", "", "", ""],
  ["1", "2", "3", "4", "5", "6", "7"],

  o(KYIV_OBLAST, "Київська область"),
  p(KYIV_OBLAST, 4, "Броварський район"),
  h(KYIV_OBLAST, 4, 1, "Броварська міська громада"),
  s(KYIV_OBLAST, 4, 1, 1, "M", "Бровари"),
  p(KYIV_OBLAST, 5, "Бучанський район"),
  h(KYIV_OBLAST, 5, 1, "Ірпінська міська громада"),
  s(KYIV_OBLAST, 5, 1, 1, "M", "Ірпінь"),
  h(KYIV_OBLAST, 5, 2, "Бучанська міська громада"),
  s(KYIV_OBLAST, 5, 2, 1, "M", "Буча"),
  p(KYIV_OBLAST, 6, "Вишгородський район"),
  h(KYIV_OBLAST, 6, 1, "Вишгородська міська громада"),
  s(KYIV_OBLAST, 6, 1, 1, "M", "Вишгород"),
  p(KYIV_OBLAST, 7, "Бориспільський район"),
  h(KYIV_OBLAST, 7, 1, "Бориспільська міська громада"),
  s(KYIV_OBLAST, 7, 1, 1, "M", "Бориспіль"),
  p(KYIV_OBLAST, 8, "Фастівський район"),
  h(KYIV_OBLAST, 8, 1, "Фастівська міська громада"),
  s(KYIV_OBLAST, 8, 1, 1, "M", "Фастів"),
  p(KYIV_OBLAST, 9, "Білоцерківський район"),
  h(KYIV_OBLAST, 9, 1, "Білоцерківська міська громада"),
  s(KYIV_OBLAST, 9, 1, 1, "M", "Біла Церква"),
  s(KYIV_OBLAST, 9, 1, 2, "C", "Кам’янка"),

  // Kyiv and Sevastopol: level-1 K rows, and the B rows that repeat the K code.
  ["UA80000000000093317", "", "", "", "", "K", "Київ"],
  [
    "UA80000000000093317",
    "UA80000000000093317",
    "UA80000000000093317",
    "UA80000000000093317",
    cityDistrict(KYIV_CITY, 1),
    "B",
    "Шевченківський район",
  ],
  [
    "UA80000000000093317",
    "UA80000000000093317",
    "UA80000000000093317",
    "UA80000000000093317",
    cityDistrict(KYIV_CITY, 2),
    "B",
    "Голосіївський район",
  ],
  ["UA85000000000065278", "", "", "", "", "K", "Севастополь"],

  // The same name in three oblasts: unique within each.
  o(ODESA, "Одеська область"),
  p(ODESA, 1, "Березівський район"),
  h(ODESA, 1, 1, "Березівська міська громада"),
  h(ODESA, 1, 2, "Любопільська сільська громада"),
  s(ODESA, 1, 1, 1, "C", "Іванівка"),
  // Two villages with one name in one raion: only the hromada tells them apart.
  s(ODESA, 1, 1, 2, "C", "Миколаївка"),
  s(ODESA, 1, 2, 1, "C", "Миколаївка"),
  // Two in one oblast, different raions: the raion is enough.
  s(ODESA, 1, 1, 3, "C", "Дзвінка"),
  p(ODESA, 2, "Подільський район"),
  h(ODESA, 2, 1, "Подільська міська громада"),
  s(ODESA, 2, 1, 1, "C", "Дзвінка"),
  // The same name as a legacy city, in another oblast.
  s(ODESA, 2, 1, 2, "C", "Бровари"),

  o(KHARKIV, "Харківська область"),
  p(KHARKIV, 1, "Харківський район"),
  h(KHARKIV, 1, 1, "Борівська селищна громада"),
  s(KHARKIV, 1, 1, 1, "X", "Борова"),
  s(KHARKIV, 1, 1, 2, "C", "Іванівка"),

  o(LVIV, "Львівська область"),
  p(LVIV, 1, "Червоноградський район"),
  h(LVIV, 1, 1, "Кам’янка-Бузька міська громада"),
  s(LVIV, 1, 1, 1, "M", "Кам’янка-Бузька"),
  s(LVIV, 1, 1, 2, "C", "Іванівка"),
  s(LVIV, 1, 1, 3, "C", "Миколаївка"),

  // Crimea: kept, never offered.
  o(CRIMEA, "Автономна Республіка Крим"),
  p(CRIMEA, 1, "Бахчисарайський район"),
  h(CRIMEA, 1, 1, "Бахчисарайська міська громада"),
  s(CRIMEA, 1, 1, 1, "C", "Левітанівка"),
];

export const FIXTURE_SETTLEMENT_COUNTS = { K: 2, M: 8, X: 1, C: 11 } as const;

const columnLetter = (index: number) => String.fromCharCode(65 + index);
const xmlEscape = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** The rows as an XLSX workbook; empty cells are left out, as Excel leaves them. */
export function buildXlsx(rows: readonly (readonly string[])[] = FIXTURE_ROWS): Uint8Array {
  const strings: string[] = [];
  const indexOf = new Map<string, number>();
  const stringIndex = (text: string) => {
    const known = indexOf.get(text);
    if (known !== undefined) return known;
    indexOf.set(text, strings.length);
    strings.push(text);
    return strings.length - 1;
  };
  const sheetRows = rows
    .map((row, r) => {
      const cells = row
        .map((text, c) =>
          text === ""
            ? ""
            : `<c r="${columnLetter(c)}${r + 1}" t="s"><v>${stringIndex(text)}</v></c>`,
        )
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`;
  const shared = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings
    .map((text) => `<si><t xml:space="preserve">${xmlEscape(text)}</t></si>`)
    .join("")}</sst>`;
  return zipSync({
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
    ),
    "xl/workbook.xml": strToU8("<workbook/>"),
    "xl/sharedStrings.xml": strToU8(shared),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  });
}

/** A pin for fixture bytes: the real pin names the ministry's file, which is not in the repo. */
export function pinFor(
  bytes: Uint8Array,
  settlements: PinnedEdition["settlements"] = FIXTURE_SETTLEMENT_COUNTS,
): PinnedEdition {
  return {
    id: "2099-01-01",
    order: "0",
    fileName: "fixture.xlsx",
    sha256: sha256Of(bytes),
    settlements,
  };
}
