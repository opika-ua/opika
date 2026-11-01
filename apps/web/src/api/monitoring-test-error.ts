import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

/** Throws only for the exact bearer secret; every other caller sees a plain 404. */
export async function handleMonitoringTestError(
  request: Request,
  deps: { cronSecret: string | undefined; dsn: string | undefined },
): Promise<Response> {
  const header = request.headers.get("authorization");
  const secret = deps.cronSecret;
  const allowed =
    !!deps.dsn?.trim() &&
    secret !== undefined &&
    secret !== "" &&
    header !== null &&
    timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
  if (!allowed) return new Response("Not Found", { status: 404 });
  throw new Error("Sentry test error: thrown on purpose by POST /api/monitoring/test");
}
