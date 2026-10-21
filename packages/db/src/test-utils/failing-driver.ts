import { createServer } from "node:net";
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeonHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgresJs } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Database } from "../client";
import * as schema from "../schema/index";

/**
 * Query failures forced below Drizzle, at the driver, so the error a test sees is the one
 * production gets: drizzle-orm 0.45.2's `DrizzleQueryError` (no `name` of its own, the SQL and its
 * parameters in its message and as its own `query` and `params`), wrapping the driver's error as
 * `cause`. A failure injected above Drizzle (`steppedDatabase`'s `failWhen`) has neither. By the
 * statement's text, never by timing (CLAUDE.md, agent rules). For tests only.
 */

/** The fields of a Postgres error report, as postgres-js's `PostgresError` carries them. */
export type PostgresErrorFields = {
  message: string;
  code: string;
  severity?: string;
  detail?: string;
  where?: string;
  schema_name?: string;
  table_name?: string;
  column_name?: string;
  constraint_name?: string;
};

/** postgres-js's own error class, as its parser builds one from a server's error report. */
export const postgresError = (fields: PostgresErrorFields): Error =>
  new postgres.PostgresError(fields as never);

/**
 * A query postgres-js has sent and the server refused: awaited directly or through `.values()`, as
 * Drizzle uses it. Marked handled, so a path that only calls `.values()` leaves no unhandled
 * rejection behind; awaiting it still rejects.
 */
const refused = (error: Error) => {
  const rejection = Promise.reject(error);
  rejection.catch(() => {});
  return Object.assign(rejection, { values: () => Promise.reject(error) });
};

/**
 * `db`'s own connection, through a postgres-js client that refuses each statement `failWhen`
 * returns an error for (given the SQL text and its parameters), and runs every other one.
 */
export function failingDriverDatabase(
  db: Database,
  failWhen: (query: string, params: readonly unknown[]) => Error | undefined,
): Database {
  const client = (db as unknown as { $client: postgres.Sql }).$client;
  const failing = new Proxy(client, {
    get(target, property, receiver) {
      if (property !== "unsafe") return Reflect.get(target, property, receiver);
      return (query: string, params: unknown[] = [], ...rest: unknown[]) => {
        const failure = failWhen(query, params);
        return failure === undefined
          ? (target.unsafe as (...args: unknown[]) => unknown)(query, params, ...rest)
          : refused(failure);
      };
    },
  });
  return drizzlePostgresJs(failing, { schema });
}

/**
 * A database whose server is down: a postgres-js client pointed at a local port nothing listens
 * on, so every statement fails as an outage does (`ECONNREFUSED`, wrapped by Drizzle with the
 * statement's parameters). `end()` closes the client.
 */
export async function downDatabase(): Promise<{ db: Database; end: () => Promise<void> }> {
  const port = await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() =>
        typeof address === "object" && address !== null
          ? resolve(address.port)
          : reject(new Error("no port")),
      );
    });
  });
  const client = postgres(`postgres://down:down@127.0.0.1:${port}/down`, {
    max: 1,
    connect_timeout: 2,
    onnotice: () => {},
  });
  return { db: drizzlePostgresJs(client, { schema }), end: () => client.end({ timeout: 0 }) };
}

/** A Postgres error report as Neon's HTTP endpoint answers it (its JSON body). */
export type NeonErrorReport = {
  message: string;
  code: string;
  severity?: string;
  detail?: string;
  where?: string;
  schema?: string;
  table?: string;
  column?: string;
  constraint?: string;
};

/**
 * A neon-http database (`@neondatabase/serverless`'s own client, Drizzle's neon-http driver) whose
 * every statement is answered with `report` as an HTTP 400, as Neon answers a failed query: the
 * client builds its real `NeonDbError` from it. Nothing leaves the process: the fetch is replaced
 * and the endpoint is a `.invalid` host. `restore()` puts the global `neonConfig` back.
 */
export function neonHttpDatabaseAnswering(report: NeonErrorReport): {
  db: Database;
  requests: () => number;
  restore: () => void;
} {
  const before = {
    fetchEndpoint: neonConfig.fetchEndpoint,
    fetchFunction: neonConfig.fetchFunction,
  };
  let requests = 0;
  neonConfig.fetchEndpoint = () => "https://neon-http.invalid/sql";
  neonConfig.fetchFunction = async () => {
    requests += 1;
    return new Response(JSON.stringify(report), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  };
  const db = drizzleNeonHttp(neon("postgresql://test:test@neon-http.invalid/test"), { schema });
  return {
    db: db as unknown as Database,
    requests: () => requests,
    restore: () => {
      neonConfig.fetchEndpoint = before.fetchEndpoint;
      neonConfig.fetchFunction = before.fetchFunction;
    },
  };
}
