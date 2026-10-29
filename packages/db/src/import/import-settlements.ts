import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { placeQueryOf } from "@opika/domain";
import { createDatabase, type Database } from "../client";
import { migrateTargetCheck, parseMigrateArgs } from "../migrate-args";
import { assertNotProductionTarget, databaseTargetLine } from "../prod-guard";
import { citySearchRepo } from "../repos/city-search-repo";
import { type ImportOutcome, runImport } from "./importer";
import type { PlanReport } from "./plan";

/**
 * `pnpm --filter @opika/db db:import-settlements --file <codifier.xlsx> [--expect ep-...] [--commit]`
 *
 * Dry run by default; `--commit` writes. CHILD BRANCHES AND LOCAL DATABASES ONLY, until the gallery
 * and the pickers stop reading the full city list (nationwide N3 and N4): a production target is
 * refused whatever flags are given, `--prod` included. The production import is a later sitting
 * with its own change to this guard.
 */
export type ImportArgs =
  | { kind: "ok"; file: string; commit: boolean; expect: string | undefined }
  | { kind: "refused"; reason: string };

export function parseImportArgs(argv: readonly string[]): ImportArgs {
  const base = parseMigrateArgs(argv);
  if (base.kind === "refused") return base;
  const rest = base.drizzleArgs.slice(1); // drop the "migrate" word the shared parser prepends
  let file: string | undefined;
  let commit = false;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--commit") commit = true;
    else if (arg === "--file") {
      file = rest[i + 1];
      i++;
    } else if (arg?.startsWith("--file=")) file = arg.slice("--file=".length);
    else return { kind: "refused", reason: `unknown argument ${JSON.stringify(arg)}` };
  }
  if (file === undefined || file === "" || file.startsWith("--")) {
    return { kind: "refused", reason: "--file <path to the codifier .xlsx> is required" };
  }
  return { kind: "ok", file, commit, expect: base.expect };
}

const n = (value: number) => value.toLocaleString("en-US");

export function reportLines(report: PlanReport): string[] {
  const c = report.byCategory;
  return [
    `Edition ${report.edition}: ${n(report.settlements)} settlements (K ${c.K}, M ${n(c.M)}, X ${n(c.X)}, C ${n(c.C)})`,
    `Plan: insert ${n(report.inserted)}, adopt ${report.adopted} legacy, update ${n(report.updated)}, unchanged ${n(report.unchanged)}, retire ${report.retired}`,
    `Slugs: ${report.renamedSlugs} renamed, ${report.aliasesAdded} aliases to add, ${report.slugSuffixes} numeric suffixes`,
    `Name scope: unique_in_ukraine ${n(report.nameScopes.unique_in_ukraine)}, unique_in_region ${n(report.nameScopes.unique_in_region)}, unique_in_district ${n(report.nameScopes.unique_in_district)}, shared_in_district ${n(report.nameScopes.shared_in_district)}`,
    `Hidden from the picker (Crimea, Sevastopol): ${n(report.hiddenFromPicker)}`,
    `Rows without a code that are not the 8 legacy cities (left alone): ${report.unmanagedRows}`,
    `Per region: ${Object.entries(report.perRegion)
      .map(([code, count]) => `${code} ${n(count)}`)
      .join(", ")}`,
  ];
}

function print(outcome: ImportOutcome): number {
  if (outcome.kind === "refused") {
    console.error("REFUSED, nothing was written:");
    for (const reason of outcome.reasons) console.error(`- ${reason}`);
    return 1;
  }
  for (const line of reportLines(outcome.plan.report)) console.log(line);
  console.log(
    `Names whose apostrophe was converted to U+02BC: ${n(outcome.source.apostropheConversions)}`,
  );
  console.log(
    `Settlements with no raion or hromada name (parent has no row): ${n(outcome.source.withoutParentName)}`,
  );
  if (outcome.kind === "planned") {
    console.log("Dry run: nothing was written. Pass --commit to write.");
    return 0;
  }
  const stored = outcome.stored;
  console.log(
    `Stored: ${n(stored?.withCode ?? 0)} rows with a code, ${stored?.withoutCode ?? 0} without, ${stored?.aliases ?? 0} slug aliases, ${stored?.retired ?? 0} retired`,
  );
  console.log(`A second plan wants to change: ${outcome.remaining} rows (expected 0)`);
  return outcome.remaining === 0 ? 0 : 1;
}

/** Representative searches against the imported data: counts and milliseconds, no assertions. */
const PROBES = [
  "Київ",
  "Миколаївка",
  "Камʼянське",
  "kyiv",
  "Бровр",
  "Іванівка",
  "Біла Цер",
  "lviv",
];
async function probeSearch(db: Database): Promise<void> {
  console.log("Search probes (rows, ms; the first call also pays the connection):");
  for (const raw of PROBES) {
    const query = placeQueryOf(raw);
    if (query.kind !== "ok") continue;
    const started = performance.now();
    const rows = await citySearchRepo(db).search(query, { regionBias: null });
    console.log(`  ${raw}: ${rows.length} rows, ${Math.round(performance.now() - started)} ms`);
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }
  const args = parseImportArgs(process.argv.slice(2));
  if (args.kind === "refused") {
    console.error(`ERROR: ${args.reason}.`);
    process.exit(1);
  }
  // First, before anything is printed or read: production is refused with or without --prod.
  assertNotProductionTarget(url, process.argv, "Importing settlements");
  const expected = migrateTargetCheck(url, args.expect);
  if (expected.kind === "refused") {
    console.error(`ERROR: ${expected.reason}. Refusing (not printing the URL).`);
    process.exit(1);
  }
  console.log(databaseTargetLine(url));
  const bytes = new Uint8Array(readFileSync(args.file));
  const db = createDatabase(url);
  const outcome = await runImport({ db, bytes, commit: args.commit });
  const code = print(outcome);
  if (outcome.kind === "committed") await probeSearch(db);
  process.exit(code);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
