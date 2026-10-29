import {
  type NameScope,
  type SettlementKind,
  searchLatinOf,
  searchNameOf,
  transliterateUk,
} from "@opika/domain";
import { PICKER_HIDDEN_REGION_CODES, REGION_BY_CODE, REGIONS } from "../geography/regions-data";
import { uuidV5 } from "../geography/uuid-v5";
import type { Settlement, SettlementCategory } from "./codifier";

/**
 * The importer's decisions, with no I/O: what to insert, update, rename, alias and retire, given
 * the codifier and what `cities` holds. `run.ts` carries the plan out and `import-settlements.ts`
 * is the CLI. Everything the dry run prints comes from `report`.
 *
 * Identity is the КАТОТТГ code (`cities.katottg_code`). A slug is assigned once, at first insert,
 * and frozen: a name typo-fix must not move a public URL. The exceptions are the 7 seeded slugs
 * (renamed once, old slug kept as a `legacy` alias) and a rename that changes the transliterated
 * base (old slug kept as a `renamed` alias).
 */

/** The 8 cities `db:seed` created before the import existed; the only rows the importer adopts. */
export const LEGACY_SLUGS: readonly string[] = [
  "kyiv",
  "brovary",
  "irpin",
  "bucha",
  "vyshhorod",
  "boryspil",
  "fastiv",
  "bila-tserkva",
];

export const KIND_OF_CATEGORY: Readonly<Record<SettlementCategory, SettlementKind>> = {
  K: "special_status_city",
  M: "city",
  X: "selyshche",
  C: "village",
};

export type ExistingCity = {
  readonly id: string;
  readonly slug: string;
  readonly katottgCode: string | null;
  readonly nameUk: string;
  readonly nameEnText: string;
  readonly nameEnProvenance: "human" | "machine";
  readonly regionId: string;
  readonly kind: SettlementKind;
  readonly districtNameUk: string | null;
  readonly hromadaNameUk: string | null;
  readonly nameScope: NameScope;
  readonly searchName: string;
  readonly searchLatin: string;
  readonly sourceEdition: string | null;
  readonly retiredInEdition: string | null;
};

export type ExistingAlias = { readonly slug: string; readonly cityId: string };

/** A full `cities` row as the importer writes it. */
export type ImportRow = {
  readonly id: string;
  readonly slug: string;
  readonly nameUk: string;
  readonly nameEnText: string;
  readonly nameEnProvenance: "human" | "machine";
  readonly regionId: string;
  readonly kind: SettlementKind;
  readonly katottgCode: string;
  readonly districtNameUk: string | null;
  readonly hromadaNameUk: string | null;
  readonly nameScope: NameScope;
  readonly searchName: string;
  readonly searchLatin: string;
  readonly sourceEdition: string;
};

export type NewAlias = { slug: string; cityId: string; reason: "legacy" | "renamed" };

export type Plan = {
  /** Rows that don't exist yet. */
  readonly inserts: readonly ImportRow[];
  /** The legacy rows, gaining a code and their new slug; their names are kept. */
  readonly adoptions: readonly ImportRow[];
  /** Code-matched rows whose values differ (a slug change is in `slugChanges`). */
  readonly updates: readonly ImportRow[];
  readonly slugChanges: readonly { id: string; from: string; to: string }[];
  readonly aliases: readonly NewAlias[];
  readonly retirements: readonly { id: string; code: string }[];
  readonly report: PlanReport;
};

export type PlanReport = {
  readonly edition: string;
  readonly settlements: number;
  readonly byCategory: Readonly<Record<SettlementCategory, number>>;
  readonly inserted: number;
  readonly adopted: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly renamedSlugs: number;
  readonly aliasesAdded: number;
  readonly retired: number;
  readonly nameScopes: Readonly<Record<NameScope, number>>;
  readonly slugSuffixes: number;
  readonly hiddenFromPicker: number;
  readonly perRegion: Readonly<Record<string, number>>;
  /** Rows with no code that are not one of the 8 (fixtures on a child branch): left alone. */
  readonly unmanagedRows: number;
};

export class PlanError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`The import was refused:\n- ${problems.join("\n- ")}`);
    this.name = "PlanError";
  }
}

const UNIT_WORDS = /\s*(?:район|громада|міська|селищна|сільська|територіальна)(?=\s|$)/giu;

function capitalised(latin: string): string {
  return latin.replace(
    /(^|[\s-])([a-z])/gu,
    (_m, lead: string, letter: string) => lead + letter.toUpperCase(),
  );
}

/** The English name stored for an imported settlement (machine transliteration, KMU 2010). */
export function englishNameOf(nameUk: string): string {
  return capitalised(transliterateUk(nameUk)).replace(/\s+/gu, " ").trim();
}

export function slugBaseOf(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

/** «Броварський район» is «brovarskyi»; the kind of unit is not part of a slug. */
function adjectiveSlugOf(unitName: string | null): string | null {
  if (unitName === null) return null;
  const slug = slugBaseOf(transliterateUk(unitName.replace(UNIT_WORDS, "")));
  return slug === "" ? null : slug;
}

const nameKeyOf = (name: string) => name.toLocaleLowerCase("uk");
const regionSlugOfCode = (code: string): string => REGION_BY_CODE.get(code)?.slug ?? "";

export function planImport(input: {
  edition: string;
  settlements: readonly Settlement[];
  existing: readonly ExistingCity[];
  aliases: readonly ExistingAlias[];
}): Plan {
  const { edition, settlements, existing, aliases } = input;
  const problems: string[] = [];

  for (const s of settlements) {
    if (!REGION_BY_CODE.has(s.regionCode)) {
      problems.push(
        `line ${s.line}: ${s.code} is in region ${s.regionCode}, which is not one of the 27`,
      );
    }
  }
  const sorted = [...settlements].sort((a, b) => (a.code < b.code ? -1 : 1));

  // --- name scope, across the whole dataset -------------------------------------------------
  const nationwide = new Map<string, number>();
  const inRegion = new Map<string, number>();
  const inRaion = new Map<string, number>();
  const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
  for (const s of sorted) {
    const key = nameKeyOf(s.name);
    bump(nationwide, key);
    bump(inRegion, `${s.regionCode}|${key}`);
    bump(inRaion, `${s.regionCode}|${s.raionName ?? ""}|${key}`);
  }
  const scopeOf = (s: Settlement): NameScope => {
    const key = nameKeyOf(s.name);
    if (nationwide.get(key) === 1) return "unique_in_ukraine";
    if (inRegion.get(`${s.regionCode}|${key}`) === 1) return "unique_in_region";
    if (inRaion.get(`${s.regionCode}|${s.raionName ?? ""}|${key}`) === 1) {
      return "unique_in_district";
    }
    return "shared_in_district";
  };

  // --- existing rows -------------------------------------------------------------------------
  const existingByCode = new Map<string, ExistingCity>();
  for (const row of existing) {
    if (row.katottgCode !== null) existingByCode.set(row.katottgCode, row);
  }
  const taken = new Set<string>([...existing.map((e) => e.slug), ...aliases.map((a) => a.slug)]);
  const aliasOwner = new Map(aliases.map((a) => [a.slug, a.cityId]));

  // --- the 8 legacy cities: each must match exactly one entry -------------------------------
  const legacy = existing.filter((e) => e.katottgCode === null && LEGACY_SLUGS.includes(e.slug));
  const unmanagedRows = existing.filter(
    (e) => e.katottgCode === null && !LEGACY_SLUGS.includes(e.slug),
  ).length;
  const legacyMatch = new Map<string, { city: ExistingCity; settlement: Settlement }>();
  for (const city of legacy) {
    const regionCode = REGIONS.find((r) => r.id === city.regionId)?.code;
    const candidates = sorted.filter(
      (s) =>
        KIND_OF_CATEGORY[s.category] === city.kind &&
        s.regionCode === regionCode &&
        searchNameOf(s.name) === searchNameOf(city.nameUk),
    );
    if (candidates.length !== 1) {
      problems.push(
        `legacy city ${city.slug}: ${candidates.length} codifier entries match its name, region and kind, expected exactly 1`,
      );
      continue;
    }
    const settlement = candidates[0] as Settlement;
    if (existingByCode.has(settlement.code)) {
      problems.push(
        `legacy city ${city.slug}: its match ${settlement.code} already belongs to another row`,
      );
      continue;
    }
    legacyMatch.set(settlement.code, { city, settlement });
  }

  // --- slugs ----------------------------------------------------------------------------------
  let slugSuffixes = 0;
  const claim = (candidate: string): string => {
    let slug = candidate;
    for (let n = 2; taken.has(slug); n++) {
      slug = `${candidate}-${n}`;
      slugSuffixes += 1;
    }
    taken.add(slug);
    return slug;
  };
  const slugCandidateOf = (
    s: Settlement,
    scope: NameScope,
    nameEn: string,
    forceDefault: boolean,
  ) => {
    const base = slugBaseOf(nameEn);
    if (s.category === "K") return base;
    const region = regionSlugOfCode(s.regionCode);
    const raion = adjectiveSlugOf(s.raionName);
    const hromada = adjectiveSlugOf(s.hromadaName);
    if (forceDefault || scope === "unique_in_ukraine" || scope === "unique_in_region") {
      return `${base}-${region}`;
    }
    if (scope === "unique_in_district" || hromada === null) {
      return [base, raion, region].filter(Boolean).join("-");
    }
    return [base, hromada, raion, region].filter(Boolean).join("-");
  };

  const rowOf = (
    s: Settlement,
    id: string,
    slug: string,
    scope: NameScope,
    names: { nameUk: string; nameEnText: string; nameEnProvenance: "human" | "machine" },
  ): ImportRow => ({
    id,
    slug,
    ...names,
    regionId: REGION_BY_CODE.get(s.regionCode)?.id ?? "",
    kind: KIND_OF_CATEGORY[s.category],
    katottgCode: s.code,
    districtNameUk: s.raionName,
    hromadaNameUk: s.hromadaName,
    nameScope: scope,
    searchName: searchNameOf(names.nameUk),
    searchLatin: searchLatinOf(names.nameUk),
    sourceEdition: edition,
  });

  const inserts: ImportRow[] = [];
  const adoptions: ImportRow[] = [];
  const updates: ImportRow[] = [];
  const slugChanges: { id: string; from: string; to: string }[] = [];
  const newAliases: NewAlias[] = [];
  const addAlias = (alias: NewAlias) => {
    const owner = aliasOwner.get(alias.slug);
    if (owner !== undefined) {
      if (owner !== alias.cityId)
        problems.push(`alias ${alias.slug} already points at a different city`);
      return;
    }
    aliasOwner.set(alias.slug, alias.cityId);
    newAliases.push(alias);
  };

  // Legacy rows claim their slugs first, so a same-named village cannot take `brovary-kyivska`.
  const legacyInOrder = [...legacyMatch.values()].sort((a, b) =>
    a.settlement.code < b.settlement.code ? -1 : 1,
  );
  for (const { city, settlement } of legacyInOrder) {
    const scope = scopeOf(settlement);
    const candidate = slugCandidateOf(settlement, scope, city.nameEnText, true);
    let slug = city.slug;
    if (candidate !== city.slug) {
      slug = claim(candidate);
      addAlias({ slug: city.slug, cityId: city.id, reason: "legacy" });
    }
    adoptions.push(
      rowOf(settlement, city.id, slug, scope, {
        nameUk: city.nameUk,
        nameEnText: city.nameEnText,
        nameEnProvenance: city.nameEnProvenance,
      }),
    );
  }

  let unchanged = 0;
  for (const s of sorted) {
    if (legacyMatch.has(s.code)) continue;
    const scope = scopeOf(s);
    const current = existingByCode.get(s.code);
    if (current === undefined) {
      const nameEnText = englishNameOf(s.name);
      if (slugBaseOf(nameEnText) === "") {
        problems.push(`line ${s.line}: ${s.code} has no Latin letters to build a slug from`);
        continue;
      }
      const slug = claim(slugCandidateOf(s, scope, nameEnText, false));
      inserts.push(
        rowOf(s, uuidV5(s.code), slug, scope, {
          nameUk: s.name,
          nameEnText,
          nameEnProvenance: "machine",
        }),
      );
      continue;
    }
    const nameEnText =
      current.nameEnProvenance === "human" ? current.nameEnText : englishNameOf(s.name);
    const base = slugBaseOf(nameEnText);
    let slug = current.slug;
    if (base !== "" && slug !== base && !slug.startsWith(`${base}-`)) {
      slug = claim(slugCandidateOf(s, scope, nameEnText, false));
      slugChanges.push({ id: current.id, from: current.slug, to: slug });
      addAlias({ slug: current.slug, cityId: current.id, reason: "renamed" });
    }
    const desired = rowOf(s, current.id, slug, scope, {
      nameUk: s.name,
      nameEnText,
      nameEnProvenance: current.nameEnProvenance,
    });
    const same =
      current.slug === desired.slug &&
      current.nameUk === desired.nameUk &&
      current.nameEnText === desired.nameEnText &&
      current.regionId === desired.regionId &&
      current.kind === desired.kind &&
      current.districtNameUk === desired.districtNameUk &&
      current.hromadaNameUk === desired.hromadaNameUk &&
      current.nameScope === desired.nameScope &&
      current.searchName === desired.searchName &&
      current.searchLatin === desired.searchLatin &&
      current.sourceEdition === desired.sourceEdition &&
      current.retiredInEdition === null;
    if (same) unchanged += 1;
    else updates.push(desired);
  }

  const fileCodes = new Set(sorted.map((s) => s.code));
  const retirements = existing
    .filter(
      (e) => e.katottgCode !== null && e.retiredInEdition === null && !fileCodes.has(e.katottgCode),
    )
    .map((e) => ({ id: e.id, code: e.katottgCode as string }));

  // --- a slug is canonical or an alias, never both ---------------------------------------------
  const finalSlugOf = new Map<string, string>(existing.map((e) => [e.id, e.slug]));
  for (const change of slugChanges) finalSlugOf.set(change.id, change.to);
  for (const row of adoptions) finalSlugOf.set(row.id, row.slug);
  const canonical = new Set<string>(finalSlugOf.values());
  for (const row of inserts) canonical.add(row.slug);
  for (const alias of [...aliases.map((a) => a.slug), ...newAliases.map((a) => a.slug)]) {
    if (canonical.has(alias)) problems.push(`slug ${alias} would be both canonical and an alias`);
  }
  if (problems.length > 0) throw new PlanError(problems);

  const nameScopes: Record<NameScope, number> = {
    unique_in_ukraine: 0,
    unique_in_region: 0,
    unique_in_district: 0,
    shared_in_district: 0,
  };
  const byCategory: Record<SettlementCategory, number> = { K: 0, M: 0, X: 0, C: 0 };
  const perRegion: Record<string, number> = {};
  let hiddenFromPicker = 0;
  for (const s of sorted) {
    nameScopes[scopeOf(s)] += 1;
    byCategory[s.category] += 1;
    perRegion[s.regionCode] = (perRegion[s.regionCode] ?? 0) + 1;
    if (PICKER_HIDDEN_REGION_CODES.includes(s.regionCode)) hiddenFromPicker += 1;
  }

  return {
    inserts,
    adoptions,
    updates,
    slugChanges,
    aliases: newAliases,
    retirements,
    report: {
      edition,
      settlements: sorted.length,
      byCategory,
      inserted: inserts.length,
      adopted: adoptions.length,
      updated: updates.length,
      unchanged,
      renamedSlugs: slugChanges.length,
      aliasesAdded: newAliases.length,
      retired: retirements.length,
      nameScopes,
      slugSuffixes,
      hiddenFromPicker,
      perRegion,
      unmanagedRows,
    },
  };
}
