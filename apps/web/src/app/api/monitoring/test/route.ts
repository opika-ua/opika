import { clientIp } from "../../../../api/client-ip";
import { handleMonitoringTestError } from "../../../../api/monitoring-test-error";
import { sharedRateLimiter } from "../../../../api/rate-limit";
import { ipRateLimitKey } from "../../../../api/rate-limit-key";

/** Its own small budget; fails open in an outage, where the long `CRON_SECRET` is the protection. */
const limiter = sharedRateLimiter({
  name: "monitoring-test",
  windowMs: 60_000,
  maxRequests: 5,
  onUnavailable: "allow",
});

/**
 * The owner's way to see one error arrive in Sentry after a deploy: a POST with
 * `Authorization: Bearer <CRON_SECRET>` throws on purpose. Without that header (or without a DSN)
 * it answers 404, so it is not a public test endpoint.
 */
export async function POST(request: Request): Promise<Response> {
  return handleMonitoringTestError(request, {
    cronSecret: process.env.CRON_SECRET,
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    ipKey: ipRateLimitKey(clientIp(request)),
    limiter,
    now: new Date(),
  });
}
