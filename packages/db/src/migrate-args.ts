import { databaseTargetOf, expectedTargetOf, PROD_FLAG } from "./prod-guard";

export const EXPECT_FLAG = "--expect";

/**
 * `db:migrate`'s own arguments, read before anything connects (AW-F1, Oleksii: "a real --expect
 * on db:migrate"). `--prod` and `--expect <ep>` are this package's flags and never reach
 * drizzle-kit, which refuses options it doesn't know; everything else passes through unchanged.
 */
export type MigrateArgs =
  | { kind: "ok"; expect: string | undefined; drizzleArgs: string[] }
  | { kind: "refused"; reason: string };

export function parseMigrateArgs(argv: readonly string[]): MigrateArgs {
  const passThrough: string[] = [];
  let expect: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === PROD_FLAG) continue;
    if (arg === EXPECT_FLAG) {
      const value = argv[i + 1];
      // A missing value, or another flag in its place, is a missing endpoint, never a guess.
      if (value === undefined || value.startsWith("--")) {
        return { kind: "refused", reason: `${EXPECT_FLAG} needs an endpoint id (ep-…) after it` };
      }
      if (expect !== undefined) return { kind: "refused", reason: `${EXPECT_FLAG} is given twice` };
      expect = value;
      i++;
      continue;
    }
    passThrough.push(arg as string);
  }
  return { kind: "ok", expect, drizzleArgs: ["migrate", ...passThrough] };
}

/** What `migrate.ts` hands to drizzle-kit (kept for callers that only need the arguments). */
export const drizzleKitArgs = (argv: readonly string[]): string[] => {
  const parsed = parseMigrateArgs(argv);
  return parsed.kind === "ok" ? parsed.drizzleArgs : ["migrate"];
};

/**
 * Whether the target is the database the caller named. A local database (tests, a developer's
 * Docker) needs no `--expect` and takes none: it names a Neon compute. Any other target must be
 * exactly the Neon compute `--expect` names, so a migration lands where it was meant to even when
 * the shell's `DATABASE_URL` points somewhere else; production additionally still needs `--prod`
 * (the guard runs first).
 */
export type MigrateTarget = { kind: "ok" } | { kind: "refused"; reason: string };

export function migrateTargetCheck(url: string, expect: string | undefined): MigrateTarget {
  if (databaseTargetOf(url).kind === "local") {
    return expect === undefined
      ? { kind: "ok" }
      : {
          kind: "refused",
          reason: `${EXPECT_FLAG} names a Neon endpoint, but the target is local`,
        };
  }
  return expectedTargetOf(url, expect);
}
