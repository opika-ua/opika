import { createHash, timingSafeEqual } from "node:crypto";
import type { Database } from "@opika/db";
import { authExpiryRepo } from "@opika/db/repos";

/**
 * The daily clean-up of dead Better Auth rows (inbox KH-Q9). Oleksii,
 * 2026-10-14, relayed, verbatim: "(b), a daily Vercel cron. (a) alone is too
 * weak: rows survive until the next sign-in, which can be weeks away." The
 * provisional /pro sentence that expired sign-in records go within two days
 * (KH-C1; two, not one, because the project is on Vercel Hobby, whose cron
 * runs once a day at an inexact time within the hour, KH-Q12) rests on this
 * route running, not on Better Auth's lazy deletes.
 *
 * - **What goes:** exactly what `authExpiryRepo.deleteExpired` deletes, in
 *   one statement: rows past their expiry (KH-Q9), and sessions past the
 *   kabinet's 30-day absolute cap even while their idle expiry is still
 *   ahead (EM-Q11, 2026-10-14).
 * - **Who may call it:** Vercel's cron, which sends
 *   `Authorization: Bearer <CRON_SECRET>`. Compared in constant time over
 *   SHA-256 digests (fixed length, so neither the value nor its length
 *   leaks through timing). No `CRON_SECRET`, or an empty one, refuses every
 *   call and deletes nothing: fail closed, never "no secret configured, so
 *   anyone may run it".
 * - **What it logs:** counts only, never an address, a token or an id
 *   ("Log counts only, never addresses").
 */
export async function handleAuthCleanup(
  request: Request,
  deps: {
    cronSecret: string | undefined;
    db: () => Database;
    now: Date;
    log: (line: string) => void;
  },
): Promise<Response> {
  if (!deps.cronSecret) {
    deps.log(JSON.stringify({ event: "kabinet_auth_cleanup", outcome: "refused_no_secret" }));
    return new Response("Cron secret not configured", { status: 500 });
  }
  if (!bearerMatches(request.headers.get("authorization"), deps.cronSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const counts = await authExpiryRepo(deps.db()).deleteExpired(deps.now);
  deps.log(
    JSON.stringify({
      event: "kabinet_auth_cleanup",
      outcome: "deleted",
      verifications: counts.verifications,
      sessions: counts.sessions,
    }),
  );
  return Response.json(counts);
}

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

function bearerMatches(header: string | null, secret: string): boolean {
  if (header === null) return false;
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
