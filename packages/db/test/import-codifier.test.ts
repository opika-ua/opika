import { describe, expect, it } from "vitest";
import { CodifierError, parseCodifier } from "../src/import/codifier";
import { readFirstSheet } from "../src/import/xlsx";
import { buildXlsx, FIXTURE_ROWS, FIXTURE_SETTLEMENT_COUNTS, settlement } from "./import-fixture";

const parse = (rows: readonly (readonly string[])[] = FIXTURE_ROWS) =>
  parseCodifier(readFirstSheet(buildXlsx(rows)));

describe("readFirstSheet", () => {
  it("reads shared strings by column, leaving omitted cells empty", () => {
    const rows = readFirstSheet(
      buildXlsx([
        ["a", "", "c"],
        ["", "b"],
      ]),
    );
    expect(rows).toEqual([
      { line: 1, cells: ["a", "", "c"] },
      { line: 2, cells: ["", "b"] },
    ]);
  });

  it("decodes XML entities in names", () => {
    const rows = readFirstSheet(buildXlsx([["Тварини & «друзі» <x>"]]));
    expect(rows[0]?.cells[0]).toBe("Тварини & «друзі» <x>");
  });
});

describe("parseCodifier", () => {
  it("skips the header rows, reads the settlements and counts every category", () => {
    const parsed = parse();
    expect(parsed.counts).toMatchObject({
      O: 5,
      K: FIXTURE_SETTLEMENT_COUNTS.K,
      M: FIXTURE_SETTLEMENT_COUNTS.M,
      X: FIXTURE_SETTLEMENT_COUNTS.X,
      C: FIXTURE_SETTLEMENT_COUNTS.C,
      B: 2,
    });
    expect(parsed.settlements).toHaveLength(22);
    expect(parsed.withoutParentName).toBe(0);
  });

  it("takes the raion and hromada names from the ancestors' own rows", () => {
    const brovary = parse().settlements.find((s) => s.code === settlement("32", 4, 1, 1));
    expect(brovary).toMatchObject({
      name: "Бровари",
      category: "M",
      regionCode: "UA32",
      raionName: "Броварський район",
      hromadaName: "Броварська міська громада",
    });
  });

  it("makes Kyiv and Sevastopol from their level-1 K rows, with no raion or hromada", () => {
    const special = parse().settlements.filter((s) => s.category === "K");
    expect(special.map((s) => [s.name, s.regionCode, s.raionName, s.hromadaName])).toEqual([
      ["Київ", "UA80", null, null],
      ["Севастополь", "UA85", null, null],
    ]);
  });

  it("stores U+02BC where the file has U+2019, and counts the conversions", () => {
    const parsed = parse();
    const names = parsed.settlements.map((s) => s.name);
    expect(names).toContain("Камʼянка");
    expect(names.some((n) => n.includes("’"))).toBe(false);
    // The settlement, its namesake and the hromada that holds it.
    expect(parsed.apostropheConversions).toBe(3);
  });

  it("refuses a Cyrillic look-alike for a category letter, with its line", () => {
    const rows = FIXTURE_ROWS.map((row) =>
      row[5] === "M" ? [...row.slice(0, 5), "М", row[6]] : row,
    );
    expect(() => parse(rows)).toThrow(CodifierError);
    try {
      parse(rows);
    } catch (error) {
      expect((error as CodifierError).problems[0]).toMatch(/^line \d+: unknown category "М"/);
    }
  });

  it("refuses a duplicate code and a malformed one, naming the lines", () => {
    const duplicate = [...FIXTURE_ROWS, FIXTURE_ROWS[6] as readonly string[]];
    expect(() => parse(duplicate)).toThrow(/duplicate code UA32/);
    const malformed = FIXTURE_ROWS.map((row) =>
      row[5] === "H" ? [row[0], row[1], "UA12", row[3], row[4], row[5], row[6]] : row,
    );
    expect(() => parse(malformed)).toThrow(/malformed code/);
  });

  it("keeps a settlement whose parent has no row, with the name null", () => {
    const rows = FIXTURE_ROWS.filter((row) => row[5] !== "P");
    const parsed = parse(rows);
    expect(parsed.settlements.find((s) => s.name === "Бровари")?.raionName).toBeNull();
    expect(parsed.withoutParentName).toBeGreaterThan(0);
  });

  it("refuses a sheet with no data", () => {
    expect(() => parse([["Перший рівень"]])).toThrow(/no data rows/);
  });
});
