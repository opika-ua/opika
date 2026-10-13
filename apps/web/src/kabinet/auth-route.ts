import { clientIp } from "../api/client-ip";
import { FORWARDED_AUTH_PATHS, type KabinetAuth } from "./auth";
import { consoleSender, type MagicLinkSender } from "./magic-link-sender";
import { normalizeEmail, type SignInLimiters, signInAllowed } from "./sign-in-limit";

/**
 * Whether kabinet sign-in can run at all in this environment.
 *
 * Production has **no** sender in this slice (HS-Q2), so it is always
 * unavailable there and every auth request answers 503: nobody can be sent a
 * link, so nobody can sign in, and saying so beats pretending to send. The
 * invite PR adds the provider. Development uses the console sender, and still
 * needs a secret and a URL: without them it's unavailable too, never a
 * hard-coded default secret.
 */
export type KabinetAuthAvailability =
  | { kind: "available"; sender: MagicLinkSender; secret: string; baseURL: string }
  | { kind: "unavailable"; reason: "no_sender_in_production" | "missing_config" };

export function kabinetAuthAvailability(env: {
  NODE_ENV?: string | undefined;
  BETTER_AUTH_SECRET?: string | undefined;
  BETTER_AUTH_URL?: string | undefined;
}): KabinetAuthAvailability {
  if (env.NODE_ENV === "production")
    return { kind: "unavailable", reason: "no_sender_in_production" };
  if (!env.BETTER_AUTH_SECRET || !env.BETTER_AUTH_URL) {
    return { kind: "unavailable", reason: "missing_config" };
  }
  return {
    kind: "available",
    sender: consoleSender,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
  };
}

const SIGN_IN_PATH = "/api/auth/sign-in/magic-link";

/**
 * Everything the `/api/auth/*` route does, as one function the tests call
 * with a real `Request`.
 *
 * 1. Unavailable → 503.
 * 2. Not an allowlisted path → 404, before Better Auth sees it.
 * 3. A magic-link request: charge both sign-in budgets; over either, answer
 *    exactly as a success does and send nothing. Otherwise forward it with
 *    the email normalised, so the stored address and the limiter key agree.
 */
export async function handleKabinetAuth(
  request: Request,
  deps: {
    availability: KabinetAuthAvailability;
    auth: () => KabinetAuth;
    limiters: SignInLimiters;
    now: Date;
  },
): Promise<Response> {
  if (deps.availability.kind === "unavailable") {
    return new Response("Kabinet sign-in is not available", { status: 503 });
  }
  const path = new URL(request.url).pathname;
  if (!(FORWARDED_AUTH_PATHS as readonly string[]).includes(path)) {
    return new Response("Not Found", { status: 404 });
  }

  if (request.method === "POST" && path === SIGN_IN_PATH) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response("Bad Request", { status: 400 });
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return new Response("Bad Request", { status: 400 });
    }
    const fields = body as Record<string, unknown>;
    const email = fields.email;
    if (typeof email !== "string") return new Response("Bad Request", { status: 400 });

    if (!(await signInAllowed(deps.limiters, { email, ip: clientIp(request) }, deps.now))) {
      return Response.json({ status: true });
    }
    const forwarded = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({ ...fields, email: normalizeEmail(email) }),
    });
    return deps.auth().handler(forwarded);
  }

  return deps.auth().handler(request);
}
