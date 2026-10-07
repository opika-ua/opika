import { spawnSync } from "node:child_process";
import { drizzleKitArgs } from "./migrate-args";
import { assertProductionWriteAllowed } from "./prod-guard";

/**
 * `pnpm db:migrate`: the production-write guard, then `drizzle-kit migrate`,
 * unchanged. `drizzle-kit` has no hook of its own, so without this wrapper a
 * migration was the one write in this package that ran against production
 * with no check at all.
 *
 * `--prod` is consumed here, not passed through: drizzle-kit doesn't know it.
 */
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("ERROR: DATABASE_URL is not set.");
  process.exit(1);
}
assertProductionWriteAllowed(databaseUrl, process.argv);

const result = spawnSync("drizzle-kit", drizzleKitArgs(process.argv.slice(2)), {
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (result.error) {
  // e.g. ENOENT when run outside `pnpm run`, where node_modules/.bin isn't on PATH.
  console.error(`ERROR: could not start drizzle-kit: ${result.error.message}`);
}
// `status` is null when the child was killed by a signal: still a failure.
process.exit(result.status ?? 1);
