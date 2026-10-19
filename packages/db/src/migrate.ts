import { applyMigrations, dotenvFilesIn, runMigrate } from "./migrate-run";
import { assertProductionWriteAllowed } from "./prod-guard";

/**
 * `pnpm db:migrate`: the production-write guard, then the committed migrations, applied in this
 * process to the URL the guard checked (`migrate-run.ts`, PG-F3).
 *
 * `--prod` and `--expect <ep>` are its only arguments. A non-local target needs `--expect`
 * naming its exact Neon compute (AW-F1); production also needs `--prod`.
 */
process.exit(
  await runMigrate(process.argv.slice(2), process.env, {
    guard: (url, argv, env) => assertProductionWriteAllowed(url, argv, env),
    applyMigrations,
    dotenvFiles: () => dotenvFilesIn(process.cwd()),
    log: (line) => console.log(line),
    error: (line) => console.error(line),
  }),
);
