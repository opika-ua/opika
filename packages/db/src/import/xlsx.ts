import { strFromU8, unzipSync } from "fflate";

/**
 * A reader for the one thing the importer needs from an XLSX: the cell text of its first sheet.
 * Node has no unzip, and the ministry publishes the codifier as XLSX only, so `fflate` (script-only,
 * never in the app bundle) opens the archive and two XML parts are read with patterns. Only bytes
 * whose sha256 matches a pinned edition ever get here (`editions.ts`).
 */
export type SheetRow = {
  /** The row number in the sheet, 1-based, for error messages. */
  readonly line: number;
  /** Cell text by 0-based column; a missing cell is the empty string. */
  readonly cells: readonly string[];
};

const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    }
    if (body.startsWith("#")) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** The text of every `<t>` inside a fragment, joined: rich-text runs are several `<t>`. */
function textOf(fragment: string): string {
  let out = "";
  for (const match of fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) {
    out += decodeXml(match[1] ?? "");
  }
  return out;
}

function sharedStringsOf(xml: string | undefined): readonly string[] {
  if (xml === undefined) return [];
  return [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1] ?? ""));
}

/** "A" is 0, "Z" is 25, "AA" is 26. */
function columnIndexOf(reference: string): number {
  const letters = /^[A-Z]+/.exec(reference)?.[0] ?? "";
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

export function readFirstSheet(bytes: Uint8Array): readonly SheetRow[] {
  const files = unzipSync(bytes, {
    filter: (file) =>
      file.name === "xl/sharedStrings.xml" || /^xl\/worksheets\/[^/]+\.xml$/.test(file.name),
  });
  const sheetName = Object.keys(files)
    .filter((name) => name.startsWith("xl/worksheets/"))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))[0];
  const sheet = sheetName === undefined ? undefined : files[sheetName];
  if (sheet === undefined) throw new Error("The workbook has no worksheet.");
  const shared = sharedStringsOf(
    files["xl/sharedStrings.xml"] === undefined
      ? undefined
      : strFromU8(files["xl/sharedStrings.xml"]),
  );

  const rows: SheetRow[] = [];
  const xml = strFromU8(sheet);
  let fallbackLine = 0;
  for (const rowMatch of xml.matchAll(/<row(\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    fallbackLine += 1;
    const line = Number(/\sr="(\d+)"/.exec(rowMatch[1] ?? "")?.[1] ?? fallbackLine);
    const cells: string[] = [];
    for (const cellMatch of (rowMatch[2] ?? "").matchAll(
      /<c(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      const attributes = cellMatch[1] ?? "";
      const body = cellMatch[2] ?? "";
      const reference = /\sr="([A-Z]+\d+)"/.exec(attributes)?.[1];
      const column = reference === undefined ? cells.length : columnIndexOf(reference);
      const type = /\st="([^"]+)"/.exec(attributes)?.[1];
      let text: string;
      if (type === "inlineStr") text = textOf(body);
      else if (type === "s") text = shared[Number(/<v>([^<]*)<\/v>/.exec(body)?.[1])] ?? "";
      else text = decodeXml(/<v>([^<]*)<\/v>/.exec(body)?.[1] ?? "");
      while (cells.length < column) cells.push("");
      cells[column] = text;
    }
    rows.push({ line, cells });
  }
  return rows;
}
