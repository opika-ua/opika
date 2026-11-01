import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { migrateTargetCheck, parseMigrateArgs } from "./migrate-args";
import { AMBIENT_CONNECTION_VARIABLES, databaseTargetLine } from "./prod-guard";

/**
 * `pnpm db:migrate`, in this process through drizzle-orm's `migrate()` on the one URL the guard
 * checked (PG-F3). Not drizzle-kit: its config and env-file loading could replace that URL.
 */

/** This package's migrations: the folder `db:generate` writes and drizzle.config.ts names. */
export const MIGRATIONS_DIR = resolve(fileURLToPath(import.meta.url), "../../drizzle");
const PACKAGE_DIR = resolve(fileURLToPath(import.meta.url), "../..");

export type MigrateEnvironment = Readonly<Record<string, string | undefined>>;

export type MigrateIo = {
  /** The production guard: returns only when the write is allowed (`assertProductionWriteAllowed`). */
  guard: (url: string, argv: readonly string[], env: MigrateEnvironment) => void;
  /** Applies every committed migration not yet applied, to exactly this URL. */
  applyMigrations: (url: string) => Promise<void>;
  /** The `.env` files drizzle-kit would have loaded, as display paths, if any exist. */
  dotenvFiles: () => readonly string[];
  log: (line: string) => void;
  error: (line: string) => void;
};

const DOTENV_VARIABLE = /^DOTENV_CONFIG_/i;

/** libpq variables that move the connection: the guard's list plus PGPASSFILE. PGSSLMODE and the
 * like stay allowed: they tune the connection to the URL's host and cannot choose another. */
const CONNECTION_VARIABLES: ReadonlySet<string> = new Set([
  ...AMBIENT_CONNECTION_VARIABLES,
  "PGPASSFILE",
]);

/** The URL and its password are cut out of a message even if a driver put them in. */
function messageOf(error: unknown, url: string): string {
  // drizzle wraps the driver's error as "Failed query: …"; the cause says why (code, message).
  let message = error instanceof Error ? error.message : "an error with no message";
  const cause = error instanceof Error ? error.cause : undefined;
  if (cause instanceof Error) {
    const code = (cause as { code?: unknown }).code;
    const nested = cause instanceof AggregateError ? cause.errors.map(String) : [];
    const reason = [typeof code === "string" ? code : "", cause.message, ...nested]
      .filter(Boolean)
      .join(": ");
    if (reason) message = `${message} (${reason})`;
  }
  const secrets = [url];
  try {
    const parsed = new URL(url);
    secrets.push(parsed.password, decodeURIComponent(parsed.password));
  } catch {
    // An unparseable URL never reaches here: the guard refused it first.
  }
  for (const secret of secrets) {
    if (secret) message = message.split(secret).join("[redacted]");
  }
  return message;
}

export async function runMigrate(
  argv: readonly string[],
  env: MigrateEnvironment,
  io: MigrateIo,
): Promise<number> {
  // Read once, here, and passed on as this value: the guard checks it and the migration connects
  // with it. Nothing after this line reads DATABASE_URL.
  const url = env.DATABASE_URL;
  if (!url) {
    io.error("ERROR: DATABASE_URL is not set.");
    return 1;
  }
  const args = parseMigrateArgs(argv);
  if (args.kind === "refused") {
    io.error(`ERROR: ${args.reason}.`);
    return 1;
  }
  const dotenvVariables = Object.keys(env).filter((name) => DOTENV_VARIABLE.test(name));
  if (dotenvVariables.length > 0) {
    io.error(
      `ERROR: set in the environment: ${dotenvVariables.join(", ")}. db:migrate reads DATABASE_URL and no env file. Unset ${dotenvVariables.length === 1 ? "it" : "them"}. Refusing (not printing any value).`,
    );
    return 1;
  }
  const connectionVariables = Object.keys(env).filter((name) =>
    CONNECTION_VARIABLES.has(name.toUpperCase()),
  );
  if (connectionVariables.length > 0) {
    io.error(
      `ERROR: set in the environment: ${connectionVariables.join(", ")}. db:migrate connects with DATABASE_URL alone. Unset ${connectionVariables.length === 1 ? "it" : "them"}. Refusing (not printing any value).`,
    );
    return 1;
  }
  // Nothing loads these any more: noted outside production, refused for a production write.
  const dotenvFiles = io.dotenvFiles();
  const production = args.production;
  if (dotenvFiles.length > 0 && production) {
    io.error(
      `ERROR: an env file is present: ${dotenvFiles.join(", ")}. A production migration reads DATABASE_URL and no env file; move the file away. Refusing (not reading or printing it).`,
    );
    return 1;
  }
  io.guard(url, argv, env);
  // After the production guard, before anything is printed or run (AW-F1): a non-local target
  // must be exactly the Neon compute `--expect` names. Never prints the URL or the endpoint.
  const expected = migrateTargetCheck(url, args.expect);
  if (expected.kind === "refused") {
    io.error(`ERROR: ${expected.reason}. Refusing (not printing the URL).`);
    return 1;
  }
  // After the guards (a refused target gets nothing but the refusal), before the migration: this
  // line says where it ran (Oleksii, 2026-10-13).
  io.log(databaseTargetLine(url));
  if (dotenvFiles.length > 0) {
    io.log(`Ignored (never read): ${dotenvFiles.join(", ")}. Only DATABASE_URL is used.`);
  }
  try {
    await io.applyMigrations(url);
  } catch (error) {
    // The driver's and the migrator's messages carry the server's text or a host, never the URL.
    io.error(`ERROR: the migration failed: ${messageOf(error, url)}`);
    return 1;
  }
  io.log("Migrations: every committed migration is now applied.");
  return 0;
}

/** Same calls drizzle-kit made for Postgres, and the same migrator the test setup uses, so the
 * recorded hashes are the ones db:check-hashes reads. */
export async function applyMigrations(url: string): Promise<void> {
  const client = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await client.end();
  }
}

/** The cwd's `.env` and this package's own; existence only, never read. */
export function dotenvFilesIn(workingDirectory: string): string[] {
  const candidates = [
    ...new Set([resolve(workingDirectory, ".env"), resolve(PACKAGE_DIR, ".env")]),
  ];
  return candidates
    .filter((path) => existsSync(path))
    .map((path) => relative(workingDirectory, path) || ".env");
}
