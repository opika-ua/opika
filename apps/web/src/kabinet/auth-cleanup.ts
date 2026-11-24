import { createHash, timingSafeEqual } from "node:crypto";
import type { Database } from "@opika/db";
import {
  adopterRepo,
  authExpiryRepo,
  kabinetInvitedUsersRepo,
  notificationSendsRepo,
  revealRepo,
  sessionRepo,
} from "@opika/db/repos";
import { pingHealthcheck } from "./cron-healthcheck";

/**
 * The 6-hourly clean-up (KH-Q9, KH-Q12): expired auth rows, dead invitees, lapsed adopter
 * sessions, 90-day-old reveals, orphaned adopters and the send log; /pro's «протягом доби» rests on
 * it. Bearer `CRON_SECRET` compared in constant time, fail closed; logs counts only.
 */
export async function handleAuthCleanup(
  request: Request,
  deps: {
    cronSecret: string | undefined;
    db: () => Database;
    now: Date;
    log: (line: string) => void;
    /** Healthchecks.io ping URL (`HEALTHCHECK_URL_AUTH_CLEANUP`); unset means no check-in. */
    healthcheckUrl?: string | undefined;
    fetchImpl?: typeof fetch;
  },
): Promise<Response> {
  if (!deps.cronSecret) {
    deps.log(JSON.stringify({ event: "kabinet_auth_cleanup", outcome: "refused_no_secret" }));
    await pingHealthcheck(deps.healthcheckUrl, "fail", deps.fetchImpl);
    return new Response("Cron secret not configured", { status: 500 });
  }
  if (!bearerMatches(request.headers.get("authorization"), deps.cronSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const response = await runAuthCleanup(deps);
    await pingHealthcheck(deps.healthcheckUrl, "ok", deps.fetchImpl);
    return response;
  } catch (error) {
    await pingHealthcheck(deps.healthcheckUrl, "fail", deps.fetchImpl);
    throw error;
  }
}

type CleanupDeps = { db: () => Database; now: Date; log: (line: string) => void };

async function runAuthCleanup(deps: CleanupDeps): Promise<Response> {
  const failed: { step: string; error: unknown }[] = [];
  // Each step stands alone, so one failure still lets the later retention deletes run.
  const step = async <T>(name: string, work: () => Promise<T>): Promise<T | null> => {
    try {
      return await work();
    } catch (error) {
      failed.push({ step: name, error });
      return null;
    }
  };
  const counts = await step("auth_expiry", () => authExpiryRepo(deps.db()).deleteExpired(deps.now));
  const erasedInvitedUsers = await step("invited_users", async () => {
    const users = kabinetInvitedUsersRepo(deps.db());
    const candidates = await users.cleanupCandidates({ organizationId: null, now: deps.now });
    if (candidates.length === 0) return 0;
    return users.deleteCandidates(
      candidates.map((candidate) => candidate.userId),
      deps.now,
    );
  });
  const adopterSessions = await step("adopter_sessions", () =>
    sessionRepo(deps.db()).deleteLapsed(deps.now),
  );
  const agedOutReveals = await step("reveals", () => revealRepo(deps.db()).deleteExpired(deps.now));
  // After sessions and reveals, so an adopter whose last one went this run goes too.
  const orphanedAdopters = await step("orphaned_adopters", () =>
    adopterRepo(deps.db()).deleteOrphaned(deps.now),
  );
  const notificationSends = await step("notification_sends", () =>
    notificationSendsRepo(deps.db()).purgeOlderThan(deps.now),
  );
  const result = {
    verifications: counts?.verifications ?? null,
    sessions: counts?.sessions ?? null,
    erasedInvitedUsers,
    adopterSessions,
    agedOutReveals,
    orphanedAdopters,
    notificationSends,
  };
  const failedSteps = failed.map((failure) => failure.step);
  deps.log(
    JSON.stringify({
      event: "kabinet_auth_cleanup",
      outcome: failedSteps.length === 0 ? "deleted" : "partial",
      ...result,
      ...(failedSteps.length === 0 ? {} : { failedSteps }),
    }),
  );
  if (failed.length > 0) {
    throw new AggregateError(
      failed.map((failure) => failure.error),
      `auth clean-up steps failed: ${failedSteps.join(", ")}`,
    );
  }
  return Response.json(result);
}

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

function bearerMatches(header: string | null, secret: string): boolean {
  if (header === null) return false;
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
