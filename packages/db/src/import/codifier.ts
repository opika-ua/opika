import type { SheetRow } from "./xlsx";

/**
 * The ministry's codifier of administrative-territorial units (КАТОТТГ), as rows of one sheet with
 * three header rows and the columns: four level codes, an extra level, the category letter, the
 * name. Every row repeats its ancestors' codes, so a unit's own code is the deepest one in its
 * level. The category letters are Latin ASCII, not the Cyrillic look-alikes: a Cyrillic "К" is
 * refused with its line, never read as "K".
 */
export const CATEGORIES = ["O", "K", "P", "H", "M", "X", "C", "B"] as const;
export type Category = (typeof CATEGORIES)[number];
export type SettlementCategory = "K" | "M" | "X" | "C";

const CODE = /^UA[0-9]{17}$/;
const CATEGORY_COLUMN = 5;
const NAME_COLUMN = 6;
/** The column holding a row's own code, per category. */
const OWN_CODE_COLUMN: Readonly<Record<Category, number>> = {
  O: 0,
  K: 0,
  P: 1,
  H: 2,
  M: 3,
  X: 3,
  C: 3,
  B: 4,
};

export type Settlement = {
  readonly code: string;
  readonly category: SettlementCategory;
  /** Apostrophes already normalised to U+02BC, this repo's. */
  readonly name: string;
  readonly regionCode: string;
  readonly raionName: string | null;
  readonly hromadaName: string | null;
  readonly line: number;
};

export type ParsedCodifier = {
  readonly settlements: readonly Settlement[];
  readonly counts: Readonly<Record<Category, number>>;
  readonly rowCount: number;
  /** Names that held U+2019 (or an ASCII apostrophe) and were converted. */
  readonly apostropheConversions: number;
  /** Settlements kept with a null raion or hromada name because that parent has no row. */
  readonly withoutParentName: number;
};

export class CodifierError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`The codifier is not in the expected shape:\n- ${problems.join("\n- ")}`);
    this.name = "CodifierError";
  }
}

const isCategory = (value: string): value is Category =>
  (CATEGORIES as readonly string[]).includes(value);

const APOSTROPHE_FOLD = /[’‘']/gu;
const MAX_PROBLEMS = 20;

export function parseCodifier(rows: readonly SheetRow[]): ParsedCodifier {
  const problems: string[] = [];
  const problem = (line: number, text: string) => {
    if (problems.length < MAX_PROBLEMS) problems.push(`line ${line}: ${text}`);
  };

  const counts: Record<Category, number> = { O: 0, K: 0, P: 0, H: 0, M: 0, X: 0, C: 0, B: 0 };
  const raionNames = new Map<string, string>();
  const hromadaNames = new Map<string, string>();
  type Pending = Omit<Settlement, "raionName" | "hromadaName"> & {
    raionCode: string;
    hromadaCode: string;
  };
  const pending: Pending[] = [];
  const seen = new Set<string>();
  let apostropheConversions = 0;
  let rowCount = 0;
  let dataStarted = false;

  for (const row of rows) {
    const cell = (column: number) => (row.cells[column] ?? "").trim();
    if (row.cells.every((c) => c.trim() === "")) continue;
    const startsData = row.cells.slice(0, 5).some((c) => c.trim().startsWith("UA"));
    if (!dataStarted && !startsData) continue; // the header rows
    dataStarted = true;
    rowCount += 1;

    const category = cell(CATEGORY_COLUMN);
    if (!isCategory(category)) {
      problem(
        row.line,
        `unknown category ${JSON.stringify(category)} (Latin letters O K P H M X C B)`,
      );
      continue;
    }
    counts[category] += 1;
    // City districts repeat their parent's code in some columns and name nothing the product uses.
    if (category === "B") continue;

    const code = cell(OWN_CODE_COLUMN[category]);
    if (!CODE.test(code)) {
      problem(row.line, `malformed code ${JSON.stringify(code)} for category ${category}`);
      continue;
    }
    const rawName = cell(NAME_COLUMN).replace(/\s+/gu, " ");
    if (rawName === "") {
      problem(row.line, `empty name for ${code}`);
      continue;
    }
    if (seen.has(code)) {
      problem(row.line, `duplicate code ${code}`);
      continue;
    }
    seen.add(code);

    const name = rawName.replace(APOSTROPHE_FOLD, "ʼ");
    if (name !== rawName) apostropheConversions += 1;

    if (category === "P") raionNames.set(code, name);
    else if (category === "H") hromadaNames.set(code, name);
    else if (category === "K" || category === "M" || category === "X" || category === "C") {
      pending.push({
        code,
        category,
        name,
        regionCode: code.slice(0, 4),
        raionCode: cell(1),
        hromadaCode: cell(2),
        line: row.line,
      });
    }
  }

  // A settlement whose raion or hromada has no row of its own is kept, with that name null: the
  // names only disambiguate in a picker, and refusing the whole file for one orphan would be worse.
  let withoutParentName = 0;
  const settlements: Settlement[] = pending.map((p) => {
    const raionName = p.category === "K" ? null : (raionNames.get(p.raionCode) ?? null);
    const hromadaName = p.category === "K" ? null : (hromadaNames.get(p.hromadaCode) ?? null);
    if (p.category !== "K" && (raionName === null || hromadaName === null)) withoutParentName += 1;
    return {
      code: p.code,
      category: p.category,
      name: p.name,
      regionCode: p.regionCode,
      raionName,
      hromadaName,
      line: p.line,
    };
  });

  if (!dataStarted) problems.push("no data rows: the first sheet holds no КАТОТТГ code");
  if (problems.length > 0) throw new CodifierError(problems);
  return { settlements, counts, rowCount, apostropheConversions, withoutParentName };
}
