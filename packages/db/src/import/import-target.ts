import { migrateTargetCheck } from "../migrate-args";
import {
  checkProductionWrite,
  PROD_ENDPOINT_ENV,
  PROD_FLAG,
  productionEndpoint,
  refusalMessage,
} from "../prod-guard";
import { type ReadinessScan, readinessRefusal, scanFullListReads } from "./readiness";

export type ImportScope = "local" | "child_branch" | "production";

/** Where a run may go: a local database, a child branch, or exactly production with every key turned. */
export type ImportTarget =
  | { kind: "ok"; scope: ImportScope; filesScanned: number | null }
  | { kind: "refused"; reason: string };

/**
 * Decides, before anything connects or prints, whether `db:import-settlements` may run against
 * this target. Production is allowed only when ALL of these hold, and each one is a refusal of its
 * own: `--prod` is given; `PROD_NEON_ENDPOINT` is known (an unknown production is never assumed to
 * be somewhere else, so `--prod` cannot open a Neon target when it is unset); `--expect ep-...`
 * names that same compute and the target is it (the shared `db:migrate` check); and the readiness
 * scan finds no full-list city read left in the source tree. Any other Neon compute (a child
 * branch) needs `--expect` alone, and a local database takes none; anything the production guard
 * cannot classify is refused as it is for every writer. `--prod` on a target that is not
 * production is refused too: naming production while pointing elsewhere is a mistake to stop.
 *
 * The typed confirmation before `--commit` is the sitting's job, not this function's.
 */
export function decideImportTarget(input: {
  url: string;
  argv: readonly string[];
  expect: string | undefined;
  env?: Readonly<Record<string, string | undefined>>;
  /** The readiness scan; tests pass a fixture's, the CLI the real tree's. */
  scan?: () => ReadinessScan;
}): ImportTarget {
  const env = input.env ?? process.env;
  const prodEndpoint = productionEndpoint(env);
  const flagged = input.argv.includes(PROD_FLAG);
  const check = checkProductionWrite(input.url, input.argv, prodEndpoint, env);

  if (check.kind === "refused") {
    if (check.reason === "production_without_flag") {
      return {
        kind: "refused",
        reason: `this target is PRODUCTION (its Neon compute is ${PROD_ENDPOINT_ENV}). Importing into it needs ${PROD_FLAG} and --expect ep-... naming that same compute`,
      };
    }
    return {
      kind: "refused",
      reason: refusalMessage(check)
        .replace(/^ERROR: /, "")
        .replace(/\.$/, ""),
    };
  }

  const expected = migrateTargetCheck(input.url, input.expect);
  if (expected.kind === "refused") return { kind: "refused", reason: expected.reason };

  if (check.reason !== "production_flagged") {
    if (flagged) {
      return {
        kind: "refused",
        reason: `${PROD_FLAG} was given but this target is not production, so one of the two is not what you meant`,
      };
    }
    return {
      kind: "ok",
      scope: check.reason === "local" ? "local" : "child_branch",
      filesScanned: null,
    };
  }

  // From here the target is production, or a Neon target while production is unknown.
  if (prodEndpoint === undefined || prodEndpoint.trim() === "") {
    return {
      kind: "refused",
      reason: `${PROD_ENDPOINT_ENV} is not set (environment or the root .env.local), so a Neon target can't be shown to be production, and ${PROD_FLAG} does not open it. Set it to the production compute`,
    };
  }
  // Here target == production (the guard) and target == --expect (the shared check), so --expect
  // names the production compute; no separate comparison can differ.
  const scan = (input.scan ?? scanFullListReads)();
  if (scan.kind !== "clear") return { kind: "refused", reason: readinessRefusal(scan) };
  return { kind: "ok", scope: "production", filesScanned: scan.filesScanned };
}
