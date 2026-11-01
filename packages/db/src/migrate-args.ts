import { databaseTargetOf, expectedTargetOf, PROD_FLAG } from "./prod-guard";

export const EXPECT_FLAG = "--expect";

/**
 * `db:migrate`'s arguments, read before anything connects (AW-F1, Oleksii: "a real --expect on
 * db:migrate"). It takes `--prod` and `--expect <ep>` and nothing else (PG-F3). The migration runs
 * in this process from this package's own migrations folder, so there is nothing to hand on, and
 * the arguments that used to reach drizzle-kit could point it at a database the guard never
 * checked: `--config` names another config file, and `dotenv_config_*` steers the env file
 * drizzle-kit loads at startup. A refusal names the kind of argument, never its value.
 */
export type MigrateArgs =
  | { kind: "ok"; expect: string | undefined; production: boolean }
  | { kind: "refused"; reason: string };

const CONFIG_FLAG = "--config";
/** drizzle-kit's bundled dotenv reads `dotenv_config_(encoding|path|debug|override|DOTENV_KEY)=…`. */
const DOTENV_ARGUMENT = /^dotenv_config_/i;

/**
 * `--prod` and `--expect` read off an argument list, everything else handed back in `rest` in its
 * order. The other target-checked tools (the settlement importer, city references) have flags of
 * their own and use this; `db:migrate` takes no others and refuses any (`parseMigrateArgs`).
 */
export type TargetArgs =
  | { kind: "ok"; expect: string | undefined; production: boolean; rest: string[] }
  | { kind: "refused"; reason: string };

export function parseTargetArgs(argv: readonly string[]): TargetArgs {
  let expect: string | undefined;
  let production = false;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === PROD_FLAG) {
      production = true;
      continue;
    }
    // `--expect ep-…` and `--expect=ep-…` read the same; anything else starting `--expect` is a typo.
    const inline = arg.startsWith(`${EXPECT_FLAG}=`)
      ? arg.slice(EXPECT_FLAG.length + 1)
      : undefined;
    if (arg === EXPECT_FLAG || inline !== undefined) {
      const value = inline ?? argv[i + 1];
      // A missing value, or another flag in its place, is a missing endpoint, never a guess.
      if (value === undefined || value === "" || value.startsWith("--")) {
        return { kind: "refused", reason: `${EXPECT_FLAG} needs an endpoint id (ep-…) after it` };
      }
      if (expect !== undefined) return { kind: "refused", reason: `${EXPECT_FLAG} is given twice` };
      expect = value;
      if (inline === undefined) i++;
      continue;
    }
    rest.push(arg);
  }
  return { kind: "ok", expect, production, rest };
}

export function parseMigrateArgs(argv: readonly string[]): MigrateArgs {
  const parsed = parseTargetArgs(argv);
  if (parsed.kind === "refused") return parsed;
  const stray = parsed.rest[0];
  if (stray === undefined) {
    return { kind: "ok", expect: parsed.expect, production: parsed.production };
  }
  if (stray === CONFIG_FLAG || stray.startsWith(`${CONFIG_FLAG}=`)) {
    return {
      kind: "refused",
      reason: `${CONFIG_FLAG} isn't accepted: db:migrate applies this package's own migrations to DATABASE_URL, and reads no config file`,
    };
  }
  if (DOTENV_ARGUMENT.test(stray)) {
    return {
      kind: "refused",
      reason:
        "a dotenv_config_* argument isn't accepted: DATABASE_URL is the only input, and no env file is loaded",
    };
  }
  // Never echoed: a stray argument could be a URL with its password.
  return {
    kind: "refused",
    reason: `it takes only ${PROD_FLAG} and ${EXPECT_FLAG} ep-… (not printing the argument it was given)`,
  };
}

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
