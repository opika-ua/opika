import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { createDatabase } from "../client";
import { productionEndpoint } from "../prod-guard";
import { executeRows } from "../raw-rows";
import { type SmokeTarget, smokeTarget } from "../test-utils/smoke-target";

/**
 * Read-only pre-check before migration 0022 (`DROP TABLE swipes CASCADE`) on a child branch: CASCADE
 * would silently take a foreign key or a view/rule that depends on the table, so any such object
 * must be seen first. SELECTs only. Same target guard as `db:neon-smoke`; never `--prod`.
 */

export type PrecheckFindings = {
  tablePresent: boolean;
  referencingTables: readonly string[];
  dependentObjects: readonly string[];
};

/** Pure: the report and the exit code from what the queries returned. */
export function renderPrecheck(f: PrecheckFindings): { text: string; exitCode: 0 | 1 } {
  if (!f.tablePresent) {
    return {
      text: "public.swipes does not exist on this database: nothing to check, nothing for 0022 to drop.",
      exitCode: 0,
    };
  }
  const part = (title: string, rows: readonly string[]) =>
    `${title}\n${rows.length === 0 ? "  none" : rows.map((r) => `  ${r}`).join("\n")}`;
  const text = [
    part("(a) tables with a foreign key pointing at swipes:", f.referencingTables),
    part("(b) views or rules depending on swipes:", f.dependentObjects),
  ].join("\n");
  if (f.referencingTables.length + f.dependentObjects.length === 0) return { text, exitCode: 0 };
  return {
    text: `${text}\nSTOP: something depends on swipes; 0022's CASCADE would drop it too. Do not migrate; paste this output.`,
    exitCode: 1,
  };
}

/** Pure: `--prod` is refused outright, then the smoke guard's rules. */
export function precheckTarget(
  url: string,
  argv: readonly string[],
  prodEndpoint: string | undefined,
): SmokeTarget {
  if (argv.includes("--prod")) {
    return {
      kind: "refused",
      reason: "--prod is not accepted: this check runs on a child branch only",
    };
  }
  const at = argv.indexOf("--expect");
  return smokeTarget(url, at > -1 ? argv[at + 1] : undefined, prodEndpoint);
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    process.stderr.write("ERROR: DATABASE_URL is not set.\n");
    process.exit(1);
  }
  const target = precheckTarget(url, process.argv, productionEndpoint());
  if (target.kind === "refused") {
    process.stderr.write(`REFUSED: ${target.reason}. Nothing was run.\n`);
    process.exit(1);
  }
  process.stdout.write(`Target host: ${target.host}\n`);
  const db = createDatabase(url);
  const [present] = await executeRows<{ present: boolean }>(
    db,
    sql`SELECT to_regclass('public.swipes') IS NOT NULL AS present`,
  );
  const tablePresent = present?.present === true;
  const referencingTables = tablePresent
    ? (
        await executeRows<{ name: string }>(
          db,
          sql`SELECT conrelid::regclass::text AS name FROM pg_constraint WHERE confrelid = 'public.swipes'::regclass`,
        )
      ).map((r) => r.name)
    : [];
  const dependentObjects = tablePresent
    ? (
        await executeRows<{ name: string }>(
          db,
          sql`SELECT DISTINCT c.relname AS name
              FROM pg_depend d
              JOIN pg_rewrite r ON d.classid = 'pg_rewrite'::regclass AND d.objid = r.oid
              JOIN pg_class c ON c.oid = r.ev_class
              WHERE d.refobjid = 'public.swipes'::regclass AND c.oid <> 'public.swipes'::regclass`,
        )
      ).map((r) => r.name)
    : [];
  const { text, exitCode } = renderPrecheck({ tablePresent, referencingTables, dependentObjects });
  process.stdout.write(`${text}\n`);
  process.exit(exitCode);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
