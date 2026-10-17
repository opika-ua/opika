import { spawnSync } from "node:child_process";
import { migrateTargetCheck, parseMigrateArgs } from "./migrate-args";
import { assertProductionWriteAllowed, databaseTargetLine } from "./prod-guard";

/**
 * `pnpm db:migrate`: the production-write guard, then `drizzle-kit migrate`,
 * unchanged. `drizzle-kit` has no hook of its own, so without this wrapper a
 * migration was the one write in this package that ran against production
 * with no check at all.
 *
 * `--prod` and `--expect <ep>` are consumed here, not passed through: drizzle-kit doesn't know
 * them. A non-local target needs `--expect` naming its exact Neon compute (AW-F1).
 */
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("ERROR: DATABASE_URL is not set.");
  process.exit(1);
}
const args = parseMigrateArgs(process.argv.slice(2));
if (args.kind === "refused") {
  console.error(`ERROR: ${args.reason}.`);
  process.exit(1);
}
assertProductionWriteAllowed(databaseUrl, process.argv);
// After the production guard, before anything is printed or run (AW-F1): a non-local target
// must be exactly the Neon compute `--expect` names. Never prints the URL or the endpoint.
const expected = migrateTargetCheck(databaseUrl, args.expect);
if (expected.kind === "refused") {
  console.error(`ERROR: ${expected.reason}. Refusing (not printing the URL).`);
  process.exit(1);
}
// After the guards (a refused target gets nothing but the refusal), before
// drizzle-kit: its output says what ran, this line says where (Oleksii, 2026-10-13).
console.log(databaseTargetLine(databaseUrl));

const result = spawnSync("drizzle-kit", args.drizzleArgs, {
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (result.error) {
  // e.g. ENOENT when run outside `pnpm run`, where node_modules/.bin isn't on PATH.
  console.error(`ERROR: could not start drizzle-kit: ${result.error.message}`);
}
// `status` is null when the child was killed by a signal: still a failure.
process.exit(result.status ?? 1);
