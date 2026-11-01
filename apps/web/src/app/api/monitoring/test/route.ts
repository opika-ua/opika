import { handleMonitoringTestError } from "../../../../api/monitoring-test-error";

/**
 * The owner's way to see one error arrive in Sentry after a deploy: a POST with
 * `Authorization: Bearer <CRON_SECRET>` throws on purpose. Without that header (or without a DSN)
 * it answers 404, so it is not a public test endpoint.
 */
export async function POST(request: Request): Promise<Response> {
  return handleMonitoringTestError(request, {
    cronSecret: process.env.CRON_SECRET,
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  });
}
