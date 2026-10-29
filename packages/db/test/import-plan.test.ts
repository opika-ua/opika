import { describe, expect, it } from "vitest";
import { parseCodifier, type Settlement } from "../src/import/codifier";
import {
  type ExistingCity,
  englishNameOf,
  type ImportRow,
  LEGACY_SLUGS,
  PlanError,
  planImport,
  slugBaseOf,
} from "../src/import/plan";
import { readFirstSheet } from "../src/import/xlsx";
import { buildCities } from "../src/seed";
import { buildXlsx, FIXTURE_ROWS } from "./import-fixture";

const EDITION = "2099-01-01";
const settlements = parseCodifier(readFirstSheet(buildXlsx(FIXTURE_ROWS))).settlements;

/** What `db:seed` leaves behind: the 8 rows, no code yet. */
const legacyRows = (): ExistingCity[] =>
  buildCities().map((c) => ({
    id: c.id,
    slug: c.slug,
    katottgCode: null,
    nameUk: c.name.uk,
    nameEnText: c.name.en.text,
    nameEnProvenance: c.name.en.provenance,
    regionId: c.regionId,
    kind: c.kind,
    districtNameUk: null,
    hromadaNameUk: null,
    nameScope: c.nameScope,
    searchName: c.name.uk.toLocaleLowerCase("uk"),
    searchLatin: "",
    sourceEdition: null,
    retiredInEdition: null,
  }));

const asExisting = (rows: readonly ImportRow[]): ExistingCity[] =>
  rows.map((r) => ({ ...r, retiredInEdition: null }));

const plan = (existing: ExistingCity[] = [], aliases: { slug: string; cityId: string }[] = []) =>
  planImport({ edition: EDITION, settlements, existing, aliases });

const slugOf = (rows: readonly ImportRow[], name: string, region?: string) =>
  rows
    .filter((r) => r.nameUk === name && (region === undefined || r.katottgCode.startsWith(region)))
    .map((r) => r.slug)
    .sort();

describe("englishNameOf and slugBaseOf", () => {
  it("transliterates, capitalises each part, and builds an ASCII base", () => {
    expect(englishNameOf("Камʼянка-Бузька")).toBe("Kamianka-Buzka");
    expect(englishNameOf("Біла Церква")).toBe("Bila Tserkva");
    expect(slugBaseOf("Bila Tserkva")).toBe("bila-tserkva");
  });
});

describe("planImport on an empty database", () => {
  it("inserts every settlement, with the slug tier its name scope calls for", () => {
    const { inserts } = plan();
    expect(inserts).toHaveLength(22);
    expect(slugOf(inserts, "Київ")).toEqual(["kyiv"]);
    expect(slugOf(inserts, "Севастополь")).toEqual(["sevastopol"]);
    // Unique in its oblast (the name exists elsewhere): name and oblast.
    expect(slugOf(inserts, "Бровари")).toEqual(["brovary-kyivska", "brovary-odeska"]);
    expect(slugOf(inserts, "Іванівка")).toEqual([
      "ivanivka-kharkivska",
      "ivanivka-lvivska",
      "ivanivka-odeska",
    ]);
    // Twice in one oblast, different raions: the raion tells them apart.
    expect(slugOf(inserts, "Дзвінка")).toEqual([
      "dzvinka-berezivskyi-odeska",
      "dzvinka-podilskyi-odeska",
    ]);
    // Twice in one raion: the hromada too.
    expect(slugOf(inserts, "Миколаївка", "UA51")).toEqual([
      "mykolaivka-berezivska-berezivskyi-odeska",
      "mykolaivka-liubopilska-berezivskyi-odeska",
    ]);
    expect(slugOf(inserts, "Миколаївка", "UA46")).toEqual(["mykolaivka-lvivska"]);
  });

  it("computes the name scope across the whole dataset", () => {
    const { inserts } = plan();
    const scope = (name: string, region: string) =>
      inserts.find((r) => r.nameUk === name && r.katottgCode.startsWith(region))?.nameScope;
    expect(scope("Київ", "UA80")).toBe("unique_in_ukraine");
    expect(scope("Бровари", "UA32")).toBe("unique_in_region");
    expect(scope("Дзвінка", "UA51")).toBe("unique_in_district");
    expect(scope("Миколаївка", "UA51")).toBe("shared_in_district");
  });

  it("writes the kind from the category, the region from the code, and no centroid", () => {
    const { inserts } = plan();
    const row = (name: string) => inserts.find((r) => r.nameUk === name) as ImportRow;
    expect(row("Київ").kind).toBe("special_status_city");
    expect(row("Борова").kind).toBe("selyshche");
    expect(row("Левітанівка").kind).toBe("village");
    expect(row("Бровари").districtNameUk).toBe("Броварський район");
    expect(Object.keys(row("Бровари"))).not.toContain("centroidLat");
    expect(row("Бровари").nameEnProvenance).toBe("machine");
  });

  it("keeps Crimea and Sevastopol in the plan and counts them as hidden", () => {
    const { inserts, report } = plan();
    expect(inserts.map((r) => r.nameUk)).toEqual(
      expect.arrayContaining(["Левітанівка", "Севастополь"]),
    );
    expect(report.hiddenFromPicker).toBe(2);
  });

  it("gives the same plan twice and every slug once", () => {
    const first = plan().inserts;
    expect(plan().inserts).toEqual(first);
    expect(new Set(first.map((r) => r.slug)).size).toBe(first.length);
    expect(new Set(first.map((r) => r.id)).size).toBe(first.length);
  });

  it("appends a numeric suffix when two settlements still collide", () => {
    const twin = (code: string, line: number): Settlement => ({
      code,
      category: "C",
      name: "Тест",
      regionCode: "UA51",
      raionName: "Березівський район",
      hromadaName: "Березівська міська громада",
      line,
    });
    const { inserts, report } = planImport({
      edition: EDITION,
      settlements: [twin("UA51010010010000001", 1), twin("UA51010010020000002", 2)],
      existing: [],
      aliases: [],
    });
    // Same name, raion and hromada: the tiers cannot separate them, so the second takes -2.
    expect(inserts.map((r) => r.slug)).toEqual([
      "test-berezivska-berezivskyi-odeska",
      "test-berezivska-berezivskyi-odeska-2",
    ]);
    expect(report.slugSuffixes).toBe(1);
  });
});

describe("the 8 legacy cities", () => {
  it("are adopted in place, 7 are renamed with a legacy alias, Kyiv keeps its slug", () => {
    const legacy = legacyRows();
    const result = plan(legacy);
    expect(result.adoptions).toHaveLength(8);
    expect(result.inserts).toHaveLength(22 - 8);
    expect(result.adoptions.map((r) => r.id).sort()).toEqual(legacy.map((c) => c.id).sort());
    const slug = (name: string) => result.adoptions.find((r) => r.nameUk === name)?.slug;
    expect(slug("Київ")).toBe("kyiv");
    expect(slug("Бровари")).toBe("brovary-kyivska");
    expect(slug("Біла Церква")).toBe("bila-tserkva-kyivska");
    expect(result.aliases).toHaveLength(7);
    expect(result.aliases.every((a) => a.reason === "legacy")).toBe(true);
    expect(result.aliases.map((a) => a.slug).sort()).toEqual(
      LEGACY_SLUGS.filter((s) => s !== "kyiv").sort(),
    );
  });

  it("keep their own names and their human English name", () => {
    const row = plan(legacyRows()).adoptions.find((r) => r.nameUk === "Бровари") as ImportRow;
    expect(row.nameEnProvenance).toBe("human");
    expect(row.nameEnText).toBe("Brovary");
  });

  it("claim their slug before a same-named village elsewhere", () => {
    const result = plan(legacyRows());
    expect(slugOf(result.inserts, "Бровари")).toEqual(["brovary-odeska"]);
  });

  it("never leave a slug both canonical and an alias", () => {
    const result = plan(legacyRows());
    const canonical = new Set([
      ...result.adoptions.map((r) => r.slug),
      ...result.inserts.map((r) => r.slug),
    ]);
    for (const alias of result.aliases) expect(canonical.has(alias.slug)).toBe(false);
  });

  it("refuse the whole run when one matches no codifier entry", () => {
    const rows = FIXTURE_ROWS.filter((row) => row[6] !== "Буча");
    const without = parseCodifier(readFirstSheet(buildXlsx(rows))).settlements;
    expect(() =>
      planImport({ edition: EDITION, settlements: without, existing: legacyRows(), aliases: [] }),
    ).toThrow(/legacy city bucha: 0 codifier entries/);
  });

  it("refuse the whole run when one matches two entries", () => {
    const twin = FIXTURE_ROWS.filter((row) => row[6] === "Буча").map((row) =>
      row.map((cell, i) => (i === 3 ? cell.replace(/\d{3}00\d{5}$/, "99900" + "00000") : cell)),
    );
    const doubled = parseCodifier(readFirstSheet(buildXlsx([...FIXTURE_ROWS, ...twin])));
    expect(() =>
      planImport({
        edition: EDITION,
        settlements: doubled.settlements,
        existing: legacyRows(),
        aliases: [],
      }),
    ).toThrow(PlanError);
  });
});

describe("a second run", () => {
  const firstRun = () => {
    const first = plan(legacyRows());
    return {
      first,
      stored: asExisting([...first.adoptions, ...first.inserts]),
      aliases: first.aliases.map((a) => ({ slug: a.slug, cityId: a.cityId })),
    };
  };

  it("changes nothing", () => {
    const { stored, aliases } = firstRun();
    const second = plan(stored, aliases);
    expect(second).toMatchObject({
      inserts: [],
      adoptions: [],
      updates: [],
      slugChanges: [],
      aliases: [],
      retirements: [],
    });
    expect(second.report.unchanged).toBe(22);
  });

  it("renames a settlement whose transliteration changed, keeping the old slug as an alias", () => {
    const { stored, aliases } = firstRun();
    const renamed = settlements.map((s) =>
      s.name === "Борова" ? { ...s, name: "Боровенька" } : s,
    );
    const result = planImport({
      edition: EDITION,
      settlements: renamed,
      existing: stored,
      aliases,
    });
    expect(result.slugChanges).toEqual([
      {
        id: stored.find((r) => r.nameUk === "Борова")?.id,
        from: "borova-kharkivska",
        to: "borovenka-kharkivska",
      },
    ]);
    expect(result.aliases).toMatchObject([{ slug: "borova-kharkivska", reason: "renamed" }]);
    expect(result.updates.find((r) => r.nameUk === "Боровенька")?.slug).toBe(
      "borovenka-kharkivska",
    );
  });

  it("keeps the slug when only the case or an apostrophe of the name changed", () => {
    const { stored, aliases } = firstRun();
    const respelt = settlements.map((s) =>
      s.name === "Камʼянка" ? { ...s, name: "КамʼЯнка" } : s,
    );
    const result = planImport({
      edition: EDITION,
      settlements: respelt,
      existing: stored,
      aliases,
    });
    expect(result.slugChanges).toEqual([]);
    expect(result.aliases).toEqual([]);
  });

  it("retires a code that vanished, never deleting its row", () => {
    const { stored, aliases } = firstRun();
    const fewer = settlements.filter((s) => s.name !== "Борова");
    const result = planImport({ edition: EDITION, settlements: fewer, existing: stored, aliases });
    expect(result.retirements).toEqual([
      { id: stored.find((r) => r.nameUk === "Борова")?.id, code: expect.stringMatching(/^UA63/) },
    ]);
  });

  it("refuses an alias that would point at a different city", () => {
    const { stored, aliases } = firstRun();
    const renamed = settlements.map((s) =>
      s.name === "Борова" ? { ...s, name: "Боровенька" } : s,
    );
    const stolen = [...aliases, { slug: "borova-kharkivska", cityId: "someone-else" }];
    expect(() =>
      planImport({ edition: EDITION, settlements: renamed, existing: stored, aliases: stolen }),
    ).toThrow(/already points at a different city/);
  });

  it("leaves a row with no code that is not one of the 8 alone, and says so", () => {
    const stray: ExistingCity = {
      ...(legacyRows()[0] as ExistingCity),
      id: "00000000-0000-4000-8000-0000000000ff",
      slug: "c-stray",
      nameUk: "Тест",
    };
    const result = plan([...legacyRows(), stray]);
    expect(result.report.unmanagedRows).toBe(1);
    expect([...result.adoptions, ...result.updates].map((r) => r.id)).not.toContain(stray.id);
  });
});
