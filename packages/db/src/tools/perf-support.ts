import { neon } from "@neondatabase/serverless";
import { count, desc, eq, inArray, notExists, sql } from "drizzle-orm";
import { drizzle as drizzleNeonHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgresJs } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { type Database, isNeonHost } from "../client";
import { migrateTargetCheck, parseTargetArgs } from "../migrate-args";
import {
  checkNonProductionTarget,
  computeOf,
  databaseTargetOf,
  PROD_ENDPOINT_ENV,
  PROD_FLAG,
  productionEndpoint,
  refusalMessage,
} from "../prod-guard";
import { animals } from "../schema/animals";
import { cities } from "../schema/cities";
import * as schema from "../schema/index";
import { shelters } from "../schema/shelters";

/**
 * Shared by the performance-check tools (`db:neon-perf-seed`, `db:neon-perf-report` and the web
 * app's `neon-perf-routes`): the target guard, a database handle that records every statement with
 * its start and end, and the analysis of that record (waves, repeated statements, a timeline).
 */

// ---- the guard --------------------------------------------------------------------------------

export type PerfTarget =
  | { kind: "ok"; scope: "local" | "child_branch"; flags: string[] }
  | { kind: "refused"; reason: string };

/**
 * Where a performance tool may run: a local database (no `--expect`), or a Neon compute that is
 * provably NOT production and is exactly `--expect ep-…`, reached by its direct hostname. Fails
 * closed: with `PROD_NEON_ENDPOINT` unset a Neon target is refused, and `--prod` is refused
 * outright (these tools have no production mode). `knownFlags` are the tool's own flags; any
 * other argument is refused without echoing it.
 */
export function perfTarget(
  url: string,
  argv: readonly string[],
  knownFlags: readonly string[] = [],
  env: Readonly<Record<string, string | undefined>> = process.env,
): PerfTarget {
  const args = parseTargetArgs(argv);
  if (args.kind === "refused") return args;
  if (args.production) {
    return {
      kind: "refused",
      reason: `${PROD_FLAG} is not accepted: this tool never runs against production`,
    };
  }
  const flags = args.rest.filter((a) => knownFlags.includes(a));
  if (flags.length !== args.rest.length) {
    return { kind: "refused", reason: "an unknown argument was given (not printing it)" };
  }
  // The flag is stripped inside checkNonProductionTarget; a production target therefore always
  // comes back "production_without_flag", whatever was typed.
  const check = checkNonProductionTarget(url, [], productionEndpoint(env), env);
  if (check.kind === "refused") {
    if (check.reason === "production_without_flag") {
      return {
        kind: "refused",
        reason: `this target is PRODUCTION (its Neon compute is ${PROD_ENDPOINT_ENV}); this tool never runs there`,
      };
    }
    if (check.reason === "production_unknown") {
      return {
        kind: "refused",
        reason: `${PROD_ENDPOINT_ENV} is not set, so a Neon target can't be shown not to be production. Set it to the production ep-… id`,
      };
    }
    return { kind: "refused", reason: refusalMessage(check).replace(/^ERROR: /, "") };
  }
  const expected = migrateTargetCheck(url, args.expect);
  if (expected.kind === "refused") return expected;
  const target = databaseTargetOf(url);
  if (target.kind === "neon" && computeOf(target.host) !== target.host.split(".")[0]) {
    return {
      kind: "refused",
      reason: "the pooled hostname (-pooler) is refused: use the branch's direct connection string",
    };
  }
  return { kind: "ok", scope: check.reason === "local" ? "local" : "child_branch", flags };
}

// ---- recording --------------------------------------------------------------------------------

export type Call = { sql: string; params: readonly unknown[]; start: number; end: number };

export type RecordingDatabase = {
  db: Database;
  /** Calls recorded since the last `reset()`, `start`/`end` in ms since `epoch`. */
  calls: Call[];
  reset(): void;
  close(): Promise<void>;
};

/**
 * The same driver choice as `createDatabase` (neon-http for a Neon host, postgres-js otherwise),
 * with each statement's start and end recorded. The recording sits under the driver, so a repository
 * or a handler can't skip it. Batches (`inOneTransaction`) are not recorded: no read path uses them.
 */
export function createRecordingDatabase(url: string): RecordingDatabase {
  const calls: Call[] = [];
  let epoch = performance.now();
  const open = (sql: string, params: readonly unknown[]) => {
    const call: Call = { sql, params, start: performance.now() - epoch, end: Number.NaN };
    calls.push(call);
    return () => {
      call.end = performance.now() - epoch;
    };
  };
  const reset = () => {
    calls.length = 0;
    epoch = performance.now();
  };

  if (isNeonHost(url)) {
    const raw = neon(url, { isolationLevel: "ReadCommitted" });
    const query = (text: string, params: unknown[], opts: unknown) => {
      const done = open(text, params ?? []);
      return (raw.query as (...a: unknown[]) => Promise<unknown>)(text, params, opts).finally(done);
    };
    const client = Object.assign((...a: unknown[]) => (raw as (...a: unknown[]) => unknown)(...a), {
      query,
      transaction: raw.transaction,
    });
    const db = drizzleNeonHttp(client as unknown as typeof raw, { schema }) as unknown as Database;
    return { db, calls, reset, close: async () => {} };
  }

  const sql = postgres(url, { max: 4 });
  const patched = new WeakSet<object>();
  // postgres-js queries are lazy thenables: the clock starts at the first `then` and stops when it settles.
  const timed = <Q extends PromiseLike<unknown>>(
    pending: Q,
    text: string,
    params: unknown[],
  ): Q => {
    // `.values()` hands back the same object: it is wrapped once.
    if (patched.has(pending)) return pending;
    patched.add(pending);
    const original = pending.then.bind(pending);
    let done: (() => void) | undefined;
    // biome-ignore lint/suspicious/noThenProperty: wraps the driver's own thenable to time it
    Object.defineProperty(pending, "then", {
      value: (ok?: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => {
        done ??= open(text, params);
        return original(
          (v) => {
            done?.();
            return ok ? ok(v) : v;
          },
          (e) => {
            done?.();
            if (bad) return bad(e);
            throw e;
          },
        );
      },
    });
    return pending;
  };
  const wrapped = new Proxy(sql, {
    get(target, prop, receiver) {
      if (prop === "unsafe") {
        return (text: string, params: unknown[] = [], ...rest: unknown[]) =>
          timed(
            (target.unsafe as (...a: unknown[]) => PromiseLike<unknown>)(text, params, ...rest),
            text,
            params,
          );
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  const db = drizzlePostgresJs(wrapped as unknown as postgres.Sql, { schema });
  return { db, calls, reset, close: () => sql.end({ timeout: 2 }) };
}

// ---- analysis ---------------------------------------------------------------------------------

/** Statements with the same text this many times or more in one route are reported as a repeat. */
export const REPEAT_THRESHOLD = 3;

export type Repeat = { sql: string; count: number; distinctParams: number };

/**
 * N+1 shape: one statement text issued REPEAT_THRESHOLD or more times with different parameters.
 * Identical text and identical parameters (a pure repeat) counts too, as `distinctParams: 1`.
 */
export function findRepeatedStatements(calls: readonly Pick<Call, "sql" | "params">[]): Repeat[] {
  const byText = new Map<string, { count: number; params: Set<string> }>();
  for (const { sql, params } of calls) {
    const entry = byText.get(sql) ?? { count: 0, params: new Set<string>() };
    entry.count++;
    entry.params.add(JSON.stringify(params, (_k, v) => (typeof v === "bigint" ? String(v) : v)));
    byText.set(sql, entry);
  }
  return [...byText]
    .filter(([, e]) => e.count >= REPEAT_THRESHOLD)
    .map(([sql, e]) => ({ sql, count: e.count, distinctParams: e.params.size }));
}

/** Calls grouped into sequential waves: a call joins the wave it overlaps in time, else starts the next. */
export function wavesOf<T extends Pick<Call, "start" | "end">>(calls: readonly T[]): T[][] {
  const sorted = [...calls].sort((a, b) => a.start - b.start);
  const waves: T[][] = [];
  let waveEnd = Number.NEGATIVE_INFINITY;
  for (const call of sorted) {
    const wave = waves.at(-1);
    if (wave && call.start < waveEnd) {
      wave.push(call);
      waveEnd = Math.max(waveEnd, call.end);
    } else {
      waves.push([call]);
      waveEnd = call.end;
    }
  }
  return waves;
}

/** A statement reduced to a short label: its first verb and the first table after FROM/INTO/UPDATE. */
export function labelOf(sql: string): string {
  const verb = /^[\s(]*(\w+)/.exec(sql)?.[1]?.toUpperCase() ?? "?";
  const table = /\b(?:from|into|update)\s+"?(\w+)"?/i.exec(sql)?.[1] ?? "-";
  const extra = /count\(\*\) over\(\)/i.test(sql)
    ? " +page"
    : /count\(\*\) filter/i.test(sql)
      ? " +facets"
      : "";
  return `${verb} ${table}${extra}`;
}

const ms = (n: number) => (Math.round(n * 10) / 10).toString();

/** One line per call: wave number, start offset, duration, label. */
export function timelineLines(calls: readonly Call[]): string[] {
  const waves = wavesOf(calls);
  return waves.flatMap((wave, w) =>
    wave.map(
      (c) =>
        `  wave ${w + 1}  +${ms(c.start).padStart(6)} ms  ${ms(c.end - c.start).padStart(6)} ms  ${labelOf(c.sql)}`,
    ),
  );
}

/** Removes anything shaped like a connection string from a line, as a last defence for output. */
export const scrubbed = (line: string): string =>
  line.replace(/postgres(?:ql)?:\/\/\S+/gi, "<url removed>");

// ---- picking rows to probe --------------------------------------------------------------------

export type PerfPick = {
  busyShelter: string | null;
  emptyShelter: string | null;
  animalId: string | null;
  animalIds: string[];
  cityId: string | null;
  citySlug: string | null;
};

/** Plain reads (query builder) that choose real ids on the branch: the busiest shelter and city, an empty shelter, a published animal. */
export async function pickPerfData(db: Database): Promise<PerfPick> {
  const busy = async (column: typeof animals.shelterId | typeof animals.cityId) => {
    const [row] = await db
      .select({ id: column, n: count() })
      .from(animals)
      .where(inArray(animals.listingKind, ["published", "reserved"]))
      .groupBy(column)
      .orderBy(desc(count()))
      .limit(1);
    return row?.id ?? null;
  };
  const [empty] = await db
    .select({ id: shelters.id })
    .from(shelters)
    .where(
      notExists(db.select({ one: sql`1` }).from(animals).where(eq(animals.shelterId, shelters.id))),
    )
    .orderBy(shelters.id)
    .limit(1);
  const published = await db
    .select({ id: animals.id })
    .from(animals)
    .where(eq(animals.listingKind, "published"))
    .orderBy(animals.id)
    .limit(60);
  const cityId = await busy(animals.cityId);
  const [city] = cityId
    ? await db
        .select({ slug: cities.slug })
        .from(cities)
        .where(eq(cities.id, cityId as never))
    : [];
  return {
    busyShelter: await busy(animals.shelterId),
    emptyShelter: empty?.id ?? null,
    animalId: published[Math.floor(published.length / 2)]?.id ?? null,
    animalIds: published.slice(0, 12).map((r) => r.id),
    cityId,
    citySlug: city?.slug ?? null,
  };
}
