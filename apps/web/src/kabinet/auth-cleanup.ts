import { createHash, timingSafeEqual } from "node:crypto";
import type { Database } from "@opika/db";
import { authExpiryRepo, kabinetInvitedUsersRepo } from "@opika/db/repos";

/**
 * The scheduled clean-up of dead Better Auth rows (inbox KH-Q9). Oleksii,
 * 2026-10-14, relayed, verbatim: "(b), a daily Vercel cron. (a) alone is too
 * weak: rows survive until the next sign-in, which can be weeks away." The
 * /pro sentence that expired sign-in records go within a day («…видаляються
 * протягом доби.») rests on this route running, not on Better Auth's lazy
 * deletes. It runs every 6 hours (`apps/web/vercel.json`): KH-Q12, resolved
 * 2026-10-18 by his VP-T1 answer, verbatim: "Run the sign-in clean-up every 6
 * hours on Pro, and change /pro to «…видаляються протягом доби.»". On Hobby it
 * ran once a day and /pro said «протягом двох діб» (KH-C1). A link's 15
 * minutes plus two gaps, should one run be skipped (Vercel does not retry), is
 * 12 h 15 min; `auth-cleanup.test.ts` reads the schedule from config and fails
 * if that worst case passes 24 h or the sentence changes.
 *
 * - **What goes:** exactly what `authExpiryRepo.deleteExpired` deletes, in
 *   one statement: rows past their expiry (KH-Q9), and sessions past their
 *   holder's idle limit or cap whatever their `expires_at` (EM-Q11,
 *   2026-10-14; by role since PW-1, `KABINET_SESSION_LIMITS`: 30 days idle
 *   and 90 at most for a shelter admin, 7 and 30 for the operator). Since
 *   2026-10-24 (the GDPR STOP decision, item 3: "add the expired-invitation
 *   sweep to the existing auth clean-up schedule. A dormant shelter's dead
 *   invitee is erased without any kabinet action"), also every account
 *   `kabinetInvitedUsersRepo.cleanupCandidates`/`deleteCandidates` finds
 *   eligible across every organisation — a departed invitee who never
 *   triggers a `registry.admins.*` call (no one ever removes or resends
 *   their dead invitation by hand) is erased here instead, within this
 *   cron's own 6-hour worst case, not left to wait indefinitely.
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
  const users = kabinetInvitedUsersRepo(deps.db());
  const candidates = await users.cleanupCandidates({ organizationId: null, now: deps.now });
  const erasedInvitedUsers =
    candidates.length === 0
      ? 0
      : await users.deleteCandidates(
          candidates.map((candidate) => candidate.userId),
          deps.now,
        );
  deps.log(
    JSON.stringify({
      event: "kabinet_auth_cleanup",
      outcome: "deleted",
      verifications: counts.verifications,
      sessions: counts.sessions,
      erasedInvitedUsers,
    }),
  );
  return Response.json({ ...counts, erasedInvitedUsers });
}

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

function bearerMatches(header: string | null, secret: string): boolean {
  if (header === null) return false;
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
