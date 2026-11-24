import { type ApplicationCleanupReport, type Database, runApplicationCleanup } from "@opika/db";
import { bearerMatches } from "../api/bearer";
import { pingHealthcheck } from "./cron-healthcheck";

/**
 * The scheduled half of the application clean-up (D8, §14 Q4): `packages/db/src/application-
 * cleanup.ts` is the manual half and the owner's production dry run. Off until he has run that
 * dry run: only `APPLICATION_CLEANUP_ENABLED=on`, exactly, switches it on; anything else answers
 * 200 «off» and touches nothing. Same bearer rule as the other crons; logs counts only.
 */
export const APPLICATION_CLEANUP_SWITCH = "APPLICATION_CLEANUP_ENABLED";

export const applicationCleanupEnabled = (env: Readonly<Record<string, string | undefined>>) =>
  env[APPLICATION_CLEANUP_SWITCH] === "on";

export async function handleApplicationCleanupCron(
  request: Request,
  deps: {
    cronSecret: string | undefined;
    enabled: boolean;
    db: () => Database;
    now: Date;
    log: (line: string) => void;
    logError?: (line: string) => void;
    /** Healthchecks.io ping URL (`HEALTHCHECK_URL_APPLICATION_CLEANUP`); unset means no check-in. */
    healthcheckUrl?: string | undefined;
    fetchImpl?: typeof fetch;
    run?: typeof runApplicationCleanup;
  },
): Promise<Response> {
  const ping = (outcome: "ok" | "fail") =>
    pingHealthcheck(deps.healthcheckUrl, outcome, deps.fetchImpl);
  if (!deps.cronSecret) {
    deps.log(JSON.stringify({ event: "application_cleanup", outcome: "refused_no_secret" }));
    await ping("fail");
    return new Response("Cron secret not configured", { status: 500 });
  }
  if (!bearerMatches(request.headers.get("authorization"), deps.cronSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!deps.enabled) {
    deps.log(JSON.stringify({ event: "application_cleanup", outcome: "off" }));
    await ping("ok");
    return Response.json({ outcome: "off" });
  }

  let report: ApplicationCleanupReport;
  try {
    report = await (deps.run ?? runApplicationCleanup)(deps.db(), deps.now, { commit: true });
  } catch (error) {
    await ping("fail");
    throw error;
  }
  const counts = {
    due: report.due.length,
    deferred: report.deferred.length,
    deleted: report.deleted.length,
    notDue: report.notDue.length,
    failed: report.failed.length,
  };
  const line = JSON.stringify({ event: "application_cleanup", outcome: "ran", ...counts });
  if (counts.failed > 0) (deps.logError ?? deps.log)(line);
  else deps.log(line);
  await ping(counts.failed > 0 ? "fail" : "ok");
  return Response.json(counts);
}
