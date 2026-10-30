import { describe, expect, it } from "vitest";
import { arrangeOptions, matchOption, type PickerOption, splitAtMatch } from "./filter-search";

const option = (
  value: string,
  label: string,
  count: number,
  extra: Partial<PickerOption> = {},
): PickerOption => ({ value, label, detail: null, count, selected: false, ...extra });

describe("matchOption", () => {
  it("matches everything, marking nothing, for an empty or one-letter query", () => {
    expect(matchOption({ label: "Бровари", detail: null }, "")).toEqual({
      label: null,
      detail: null,
    });
    expect(matchOption({ label: "Бровари", detail: null }, "б")).toEqual({
      label: null,
      detail: null,
    });
  });

  it("ignores case and marks the matched part of the label", () => {
    const match = matchOption({ label: "Бровари", detail: null }, "БР");
    expect(match?.label).toEqual([0, 2]);
    expect(splitAtMatch("Бровари", match?.label ?? null)).toEqual(["", "Бр", "овари"]);
  });

  it("matches inside a name, not only at its start", () => {
    expect(matchOption({ label: "Біла Церква", detail: null }, "цер")?.label).toEqual([5, 8]);
  });

  it("ignores apostrophes of every kind in the name and the query", () => {
    const label = "Зʼїзд";
    expect(matchOption({ label, detail: null }, "з'їз")).not.toBeNull();
    expect(matchOption({ label, detail: null }, "зїзд")).not.toBeNull();
  });

  it("drops a typed settlement-kind prefix", () => {
    expect(matchOption({ label: "Миколаївка", detail: null }, "с. мик")).not.toBeNull();
    expect(matchOption({ label: "Бровари", detail: null }, "м. бровари")).not.toBeNull();
  });

  it("finds a Cyrillic name from Latin input", () => {
    expect(matchOption({ label: "Бровари", detail: null }, "brov")).not.toBeNull();
    expect(matchOption({ label: "Львів", detail: null }, "kyiv")).toBeNull();
  });

  it("folds ґ to г", () => {
    expect(matchOption({ label: "Ґрунь", detail: null }, "грунь")).not.toBeNull();
  });

  it("matches through the hint and marks it there", () => {
    const match = matchOption(
      { label: "Миколаївка", detail: "Броварський р-н, Київська обл." },
      "бр",
    );
    expect(match?.label).toBeNull();
    expect(match?.detail).toEqual([0, 2]);
  });

  it("returns null when nothing matches", () => {
    expect(matchOption({ label: "Бровари", detail: null }, "одес")).toBeNull();
  });
});

describe("arrangeOptions", () => {
  const options = [
    option("a", "Буча", 1),
    option("b", "Бровари", 3),
    option("c", "Ірпінь", 8),
    option("d", "Боярка", 8),
    option("e", "Біла Церква", 1),
  ];
  const labels = (rows: ReturnType<typeof arrangeOptions>) => rows.map((r) => r.option.label);

  it("orders by count descending, then name", () => {
    const rows = arrangeOptions(options, { query: "", pinned: new Set(), grouped: false });
    expect(labels(rows)).toEqual(["Боярка", "Ірпінь", "Бровари", "Біла Церква", "Буча"]);
  });

  it("puts the pinned (chosen when the list opened) first, then the same order", () => {
    const rows = arrangeOptions(options, {
      query: "",
      pinned: new Set(["a", "b"]),
      grouped: false,
    });
    expect(labels(rows)).toEqual(["Бровари", "Буча", "Боярка", "Ірпінь", "Біла Церква"]);
  });

  it("filters while typing and keeps the count order", () => {
    const rows = arrangeOptions(options, { query: "бр", pinned: new Set(), grouped: false });
    expect(labels(rows)).toEqual(["Бровари"]);
  });

  it("groups: those with animals by count, then the empty ones alphabetically", () => {
    const regions = [
      option("k", "Київська", 19),
      option("l", "Львівська", 4),
      option("v", "Вінницька", 0),
      option("c", "АР Крим", 0),
      option("s", "Севастополь", 0),
    ];
    const rows = arrangeOptions(regions, { query: "", pinned: new Set(), grouped: true });
    expect(rows.map((r) => [r.option.label, r.group])).toEqual([
      ["Київська", "has"],
      ["Львівська", "has"],
      ["АР Крим", "none"],
      ["Вінницька", "none"],
      ["Севастополь", "none"],
    ]);
  });

  it("returns no rows when nothing matches", () => {
    expect(arrangeOptions(options, { query: "одес", pinned: new Set(), grouped: false })).toEqual(
      [],
    );
  });
});
