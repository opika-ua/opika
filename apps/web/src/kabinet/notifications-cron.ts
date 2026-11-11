import { createHash, timingSafeEqual } from "node:crypto";
import { pingHealthcheck } from "./cron-healthcheck";
import { runDailyNotifications } from "./notify/daily";
import type { NotifyDeps } from "./notify/deliver";

/**
 * The daily notification batch (`apps/web/vercel.json`, 06:00 UTC): O4, the operator's note that
 * a shelter's early listing ends within 7 days, and one retry of mails that failed in the last
 * 48 hours. Same rules as the other crons (`auth-cleanup.ts`):
 *
 * - **Who may call it:** Vercel's cron, `Authorization: Bearer <CRON_SECRET>`, compared in
 *   constant time over SHA-256 digests. No `CRON_SECRET`, or an empty one, refuses every call
 *   and sends nothing: fail closed.
 * - **Not configured to send** (a preview, sign-in off): 503 and a failed check-in, never a
 *   quiet success that hides a missing provider.
 * - **What it logs:** counts only, never an address, a shelter name or an id.
 */
export type NotifyCronDeps = {
  cronSecret: string | undefined;
  /** Null when this deployment cannot send (`notifyRuntimeOf` is off). */
  notify: () => NotifyDeps | null;
  log: (line: string) => void;
  /** Healthchecks.io ping URL; unset means no check-in. */
  healthcheckUrl?: string | undefined;
  fetchImpl?: typeof fetch;
};

/**
 * The door every notification cron shares: the secret, the bearer, "can this deployment send at
 * all", the check-in and the counts-only log. `event` names the cron in the log; `run` is its work.
 */
export async function handleNotifyCron<Counts extends object>(
  request: Request,
  deps: NotifyCronDeps,
  cron: { event: string; run: (notify: NotifyDeps) => Promise<Counts> },
): Promise<Response> {
  const ping = (outcome: "ok" | "fail") =>
    pingHealthcheck(deps.healthcheckUrl, outcome, deps.fetchImpl);
  if (!deps.cronSecret) {
    deps.log(JSON.stringify({ event: cron.event, outcome: "refused_no_secret" }));
    await ping("fail");
    return new Response("Cron secret not configured", { status: 500 });
  }
  if (!bearerMatches(request.headers.get("authorization"), deps.cronSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const notify = deps.notify();
  if (notify === null) {
    deps.log(JSON.stringify({ event: cron.event, outcome: "not_configured" }));
    await ping("fail");
    return new Response("Notifications are not configured", { status: 503 });
  }
  try {
    const counts = await cron.run(notify);
    deps.log(JSON.stringify({ event: cron.event, outcome: "done", ...counts }));
    await ping("ok");
    return Response.json(counts);
  } catch (error) {
    await ping("fail");
    throw error;
  }
}

export const handleNotificationsCron = (request: Request, deps: NotifyCronDeps) =>
  handleNotifyCron(request, deps, {
    event: "kabinet_notifications",
    run: (notify) => runDailyNotifications(notify),
  });

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

function bearerMatches(header: string | null, secret: string): boolean {
  if (header === null) return false;
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
