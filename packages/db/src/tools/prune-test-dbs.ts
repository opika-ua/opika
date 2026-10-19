import { realpathSync, statSync } from "node:fs";
import { hostname } from "node:os";
import { posix, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { checkProductionWrite, databaseTargetLine } from "../prod-guard";
import {
  CHECKOUT_ROOT,
  DEV_DATABASE_NAME,
  DISPOSABLE_NAME,
  dropTestDatabase,
  LOCAL_TEST_SERVER,
  parseCheckoutComment,
  testDatabaseName,
} from "../test-utils/test-database";
import { normalisePath } from "./processes";

/**
 * `pnpm db:prune-test-dbs [--yes]` (agreed with Oleksii 2026-10-13, relayed
 * by the coordinating session). Every checkout gets its own test databases
 * (#88), and a checkout deleted without its last run's teardown leaves its
 * databases behind on the local server forever: nine had piled up by
 * 2026-10-13. This lists them, and drops only the ones whose checkout is
 * provably gone:
 *
 * - Only a local server. Anything else is refused before connecting.
 * - Dry run by default; `--yes` drops.
 * - A database is dropped only when its COMMENT (written by
 *   `ensureTestDatabase`) names a checkout path on this machine that no
 *   longer exists. The name is a one-way hash of the path, so a database
 *   with no such comment ("unknown origin", e.g. one made before comments
 *   existed) is listed and never dropped. There is deliberately no flag to
 *   drop those: the legacy ones are cleared once by hand, and a flag would
 *   be dead code after that (Oleksii, relayed).
 * - Never this checkout's own databases, never the dev database `opika`,
 *   never a name outside the derived pattern.
 */

export type ListedDatabase = { name: string; comment: string | null };

/** What the filesystem says about a path; `unknown` is anything but a clean yes or no (a permissions error). */
export type PathStatus = "exists" | "missing" | "unknown";

/** Why each database is kept or dropped. Only `gone` is ever dropped. */
export type PruneVerdict =
  | { kind: "dev_database" }
  | { kind: "current_checkout" }
  | {
      kind: "unknown_origin";
      why:
        | "not_a_derived_name"
        | "no_comment"
        | "unreadable_comment"
        | "comment_does_not_match_name";
    }
  | { kind: "other_machine"; host: string; checkout: string }
  | { kind: "live"; checkout: string }
  | { kind: "unverifiable"; checkout: string; why: "root_missing" | "status_unknown" }
  | { kind: "gone"; checkout: string };

export type ClassifiedDatabase = { name: string; verdict: PruneVerdict };

export type PruneEnvironment = {
  /** This checkout's databases, by name: the derived pair, plus a `TEST_DATABASE_URL` override's. */
  currentNames: ReadonlySet<string>;
  /** Every spelling of this checkout's path (as resolved, and its real path). */
  currentCheckout: readonly string[];
  hostname: string;
  windows: boolean;
  status: (path: string) => PathStatus;
  /** Every spelling of a recorded path that exists (its real path among them); itself otherwise. */
  spellings: (path: string) => readonly string[];
};

const WINDOWS_ABSOLUTE = /^(?:[a-zA-Z]:[\\/]|\\\\)/;

export function classifyDatabase(db: ListedDatabase, env: PruneEnvironment): PruneVerdict {
  if (db.name === DEV_DATABASE_NAME) return { kind: "dev_database" };
  if (env.currentNames.has(db.name)) return { kind: "current_checkout" };
  const kind = DISPOSABLE_NAME.exec(db.name)?.[1];
  if (kind !== "test" && kind !== "harness") {
    return { kind: "unknown_origin", why: "not_a_derived_name" };
  }
  if (db.comment === null) return { kind: "unknown_origin", why: "no_comment" };
  const recorded = parseCheckoutComment(db.comment);
  if (recorded === null) return { kind: "unknown_origin", why: "unreadable_comment" };
  const { checkout, host } = recorded;
  // Another machine's path can't be checked from here; nor can a Windows path
  // from WSL or the reverse, which share a hostname and may share the server.
  if (host !== env.hostname || WINDOWS_ABSOLUTE.test(checkout) !== env.windows) {
    return { kind: "other_machine", host, checkout };
  }
  // The comment must be the one this name's hash came from. Anything else
  // (a comment edited by hand, copied with a database) claims an origin the
  // name doesn't support, and is treated as no comment at all.
  if (testDatabaseName(kind, checkout) !== db.name) {
    return { kind: "unknown_origin", why: "comment_does_not_match_name" };
  }
  const current = new Set(env.currentCheckout.map((p) => normalisePath(p, env.windows)));
  if (env.spellings(checkout).some((p) => current.has(normalisePath(p, env.windows)))) {
    return { kind: "current_checkout" };
  }
  // A missing drive (an unplugged disk, an unmapped share) says nothing
  // about the checkout on it.
  const root = (env.windows ? win32 : posix).parse(checkout).root;
  if (env.status(root) !== "exists") return { kind: "unverifiable", checkout, why: "root_missing" };
  const status = env.status(checkout);
  if (status === "exists") return { kind: "live", checkout };
  if (status === "unknown") return { kind: "unverifiable", checkout, why: "status_unknown" };
  return { kind: "gone", checkout };
}

const describeVerdict = (verdict: PruneVerdict): string => {
  switch (verdict.kind) {
    case "dev_database":
      return "kept: the dev database";
    case "current_checkout":
      return "kept: this checkout's own";
    case "unknown_origin":
      return {
        not_a_derived_name: "kept, unknown origin: not a derived opika_test_/opika_harness_ name",
        no_comment: "kept, unknown origin: no checkout recorded (made before comments existed?)",
        unreadable_comment: "kept, unknown origin: its comment isn't a recorded checkout",
        comment_does_not_match_name:
          "kept, unknown origin: the recorded checkout doesn't hash to this name",
      }[verdict.why];
    case "other_machine":
      return `kept: recorded on ${verdict.host}, not checkable here (${verdict.checkout})`;
    case "live":
      return `kept: checkout exists (${verdict.checkout})`;
    case "unverifiable":
      return verdict.why === "root_missing"
        ? `kept: the drive or root of ${verdict.checkout} isn't there, so its absence proves nothing`
        : `kept: couldn't tell whether ${verdict.checkout} exists`;
    case "gone":
      return `checkout gone (${verdict.checkout})`;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = verdict;
      throw new Error(`Unhandled verdict ${JSON.stringify(unreachable)}`);
    }
  }
};

/**
 * The last word before a DROP, re-checked here and not only in
 * `classifyDatabase`: whatever a classification says, this checkout's own
 * databases and any name outside the derived pattern never reach one. The
 * dev database `opika` is outside the pattern by construction (the test
 * below asserts it is refused here), and `dropTestDatabase` refuses it once
 * more at the DROP itself.
 */
export const mayDrop = (db: ClassifiedDatabase, env: PruneEnvironment): boolean =>
  db.verdict.kind === "gone" && !env.currentNames.has(db.name) && DISPOSABLE_NAME.test(db.name);

export type PruneOptions = {
  /** A URL on the server to prune (its database part is ignored); must be local. */
  serverUrl: string;
  yes: boolean;
  env: PruneEnvironment;
  list: (serverUrl: string) => Promise<ListedDatabase[]>;
  drop: (serverUrl: string, name: string) => Promise<void>;
  log: (line: string) => void;
};

/** The server must be local, and the URL must carry nothing that could redirect a connection. */
function localServerOrNull(serverUrl: string): URL | null {
  const check = checkProductionWrite(serverUrl, [], undefined);
  if (check.kind !== "allowed" || check.reason !== "local") return null;
  const parsed = new URL(serverUrl);
  // Stricter than the guard, which accepts `sslmode` and `channel_binding`: a
  // local server needs neither, and postgres.js sends any other key to the
  // server as a startup parameter (`?database=` replaces the path's database).
  if (parsed.search !== "" || parsed.hash !== "") return null;
  return parsed;
}

export async function pruneTestDatabases(options: PruneOptions): Promise<number> {
  const { env, log } = options;
  const server = localServerOrNull(options.serverUrl);
  if (server === null) {
    log(
      "ERROR: db:prune-test-dbs only works on a local server (it drops databases), with no query string. Refusing (not printing the URL).",
    );
    return 1;
  }
  server.pathname = "/postgres";
  log(databaseTargetLine(server.toString()));

  const classified: ClassifiedDatabase[] = (await options.list(server.toString())).map((db) => ({
    name: db.name,
    verdict: classifyDatabase(db, env),
  }));
  if (classified.length === 0) {
    log("No test databases on this server.");
    return 0;
  }
  const width = Math.max(...classified.map((db) => db.name.length));
  for (const db of classified) log(`  ${db.name.padEnd(width)}  ${describeVerdict(db.verdict)}`);

  const doomed = classified.filter((db) => mayDrop(db, env));
  if (doomed.length === 0) {
    log("Nothing to drop.");
    return 0;
  }
  if (!options.yes) {
    log(`Dry run: ${doomed.length} would be dropped. Re-run with --yes to drop them.`);
    return 0;
  }
  let failed = 0;
  for (const db of doomed) {
    try {
      await options.drop(server.toString(), db.name);
      log(`Dropped ${db.name}.`);
    } catch (error) {
      failed += 1;
      log(`FAILED to drop ${db.name}: ${(error as Error).message}`);
    }
  }
  log(`Dropped ${doomed.length - failed} of ${doomed.length}.`);
  return failed === 0 ? 0 : 1;
}

/** Every database a test run could have made, named or not as the current code names them. */
export async function listTestDatabases(serverUrl: string): Promise<ListedDatabase[]> {
  const sql = postgres(serverUrl, { max: 1, onnotice: () => {} });
  try {
    return await sql<ListedDatabase[]>`
      SELECT datname AS name, shobj_description(oid, 'pg_database') AS comment
      FROM pg_database
      WHERE datname ~ '^opika_(test|harness)'
      ORDER BY datname`;
  } finally {
    await sql.end();
  }
}

/**
 * Through `dropTestDatabase`, so the local, derived-name check runs once more
 * at the DROP itself. Forced, unlike the after-run teardown: only a database
 * whose checkout is gone reaches here, so no run can legitimately still hold
 * it, and a session that does is a leftover (an orphaned server or worker
 * from the deleted checkout) that would otherwise keep it forever.
 */
export async function dropListedDatabase(serverUrl: string, name: string): Promise<void> {
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  await dropTestDatabase(url.toString(), "force");
}

export const pathStatus = (path: string): PathStatus => {
  try {
    return statSync(path, { throwIfNoEntry: false }) === undefined ? "missing" : "exists";
  } catch {
    return "unknown";
  }
};

/** Windows has a short (8.3) and a long spelling for many folders; the real path is the long one. */
const spellingsOf = (path: string): string[] => {
  try {
    return [path, realpathSync.native(path)];
  } catch {
    return [path];
  }
};

/** This checkout's environment, as the CLI sees it. */
export function localPruneEnvironment(
  processEnv: Readonly<Record<string, string | undefined>> = process.env,
): PruneEnvironment {
  const currentNames = new Set([
    testDatabaseName("test", CHECKOUT_ROOT),
    testDatabaseName("harness", CHECKOUT_ROOT),
  ]);
  const override = processEnv.TEST_DATABASE_URL;
  if (override) {
    try {
      currentNames.add(new URL(override).pathname.slice(1));
    } catch {
      // An unparseable override is refused as the server URL anyway.
    }
  }
  return {
    currentNames,
    currentCheckout: spellingsOf(CHECKOUT_ROOT),
    hostname: hostname(),
    windows: process.platform === "win32",
    status: pathStatus,
    spellings: spellingsOf,
  };
}

async function main(): Promise<void> {
  const code = await pruneTestDatabases({
    // Where this checkout's tests put their databases: the vitest override's
    // server if one is set, the local `docker compose` server otherwise.
    serverUrl: process.env.TEST_DATABASE_URL ?? LOCAL_TEST_SERVER,
    yes: process.argv.slice(2).includes("--yes"),
    env: localPruneEnvironment(),
    list: listTestDatabases,
    drop: dropListedDatabase,
    log: (line) => console.log(line),
  });
  process.exit(code);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
