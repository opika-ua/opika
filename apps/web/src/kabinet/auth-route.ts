import { clientIp } from "../api/client-ip";
import { FORWARDED_AUTH_PATHS, type KabinetAuth } from "./auth";
import { consoleInvitationSender, type InvitationSender } from "./email-senders";
import { consoleSender, type MagicLinkSender } from "./magic-link-sender";
import { consolePasswordMail, type PasswordMailSender } from "./password-mail";
import { type ProductionMail, productionMailFor } from "./production-mail";
import { type ProductionSignIn, productionSignInOf } from "./production-sign-in";
import { normalizeEmail, type SignInLimiters, signInAllowed } from "./sign-in-limit";

/**
 * Whether kabinet sign-in can run at all in this environment, and with which
 * senders.
 *
 * - **Production** (`NODE_ENV=production`): exactly when `productionSignInOf`
 *   is "on" (a production Vercel deployment, every `kabinet.*` string final,
 *   the email routes and `BETTER_AUTH_*` configured, BETTER_AUTH_URL the
 *   pinned origin). The senders are the provider-backed ones, built once per
 *   process (`productionMailFor`). Otherwise unavailable with
 *   `productionSignInOf`'s own typed reason, and every auth request answers
 *   503 and every `/kabinet` page 404: fail closed. A Preview is always
 *   refused (IN-R2), and so is `next start` off Vercel (the harness), which
 *   can't say it is production.
 * - **Development and tests**: the console senders, and still a secret and a
 *   URL: without them it's unavailable too, never a hard-coded default
 *   secret. No copy gate here: a development link reaches only the console.
 */
export type KabinetAuthAvailability =
  | {
      kind: "available";
      sender: MagicLinkSender;
      /** The operator's invitation emails (IN-Q3); the console in development, like `sender`. */
      invites: InvitationSender;
      /** PW-1: the reset link and the «пароль змінено» notice; the console in development. */
      passwordMail: PasswordMailSender;
      secret: string;
      baseURL: string;
    }
  | { kind: "unavailable"; reason: "missing_config" }
  | {
      kind: "unavailable";
      reason: "production_sign_in_off";
      /** Why, as `productionSignInOf` says it: a variable's state or the pending copy's paths, never a value. */
      off: Extract<ProductionSignIn, { kind: "off" }>;
    };

/** Each production "off" reason is logged once per process, so a 503 on a production deployment says why somewhere. */
const reportedOff = new Set<string>();

export function kabinetAuthAvailability(
  env: Readonly<Record<string, string | undefined>>,
  // Injectable so tests reach production's branch without a live catalogue
  // or a network; production always takes the defaults.
  production: {
    signIn?: (env: Readonly<Record<string, string | undefined>>) => ProductionSignIn;
    mail?: (on: Extract<ProductionSignIn, { kind: "on" }>) => ProductionMail;
  } = {},
): KabinetAuthAvailability {
  if (env.NODE_ENV === "production") {
    const signIn = (production.signIn ?? productionSignInOf)(env);
    if (signIn.kind === "off") {
      if (!reportedOff.has(signIn.reason)) {
        reportedOff.add(signIn.reason);
        console.warn(
          `[kabinet] production sign-in is off: ${signIn.reason}` +
            (signIn.reason === "copy_pending" ? ` (${signIn.pending.join(", ")})` : ""),
        );
      }
      return { kind: "unavailable", reason: "production_sign_in_off", off: signIn };
    }
    const mail = (production.mail ?? productionMailFor)(signIn);
    return {
      kind: "available",
      sender: mail.sender,
      invites: mail.invites,
      passwordMail: mail.passwordMail,
      secret: signIn.secret,
      baseURL: signIn.baseURL,
    };
  }
  if (!env.BETTER_AUTH_SECRET || !env.BETTER_AUTH_URL) {
    return { kind: "unavailable", reason: "missing_config" };
  }
  return {
    kind: "available",
    sender: consoleSender,
    invites: consoleInvitationSender,
    passwordMail: consolePasswordMail,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
  };
}

const SIGN_IN_PATH = "/api/auth/sign-in/magic-link";

/**
 * The password endpoints whose success the route answers itself (PW-1), with
 * `{ status: true }` and Better Auth's headers (its `Set-Cookie` included):
 *
 * - **the password sign-in and «Змінити пароль»**: Better Auth's body carries
 *   the new session's token, which the page's script could then read although
 *   the cookie is HttpOnly. The browser needs only the cookie.
 * - **«Забули пароль?»**: one body for every address, whatever Better Auth's
 *   own wording is in a later version (`FORGOT_ANSWER`, `password-hooks.ts`);
 *   a body that differed between addresses would say which exist (§6.3).
 *
 * The sign-in and «Забули пароль?» also get the address trimmed and
 * lower-cased, as the magic link does, so the delay's key and the stored
 * address agree. Failures pass through unchanged: their codes are what the
 * forms read.
 */
const PASSWORD_ANSWERS = {
  "/api/auth/sign-in/email": { normaliseEmail: true },
  "/api/auth/request-password-reset": { normaliseEmail: true },
  "/api/auth/change-password": { normaliseEmail: false },
} as const;

/** `response`'s status and headers with a new JSON body (its old length dropped). */
function withBody(response: Response, body: unknown): Response {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { status: response.status, headers });
}

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

  if (request.method === "POST" && path in PASSWORD_ANSWERS) {
    const step = PASSWORD_ANSWERS[path as keyof typeof PASSWORD_ANSWERS];
    let forwarded = request;
    if (step.normaliseEmail) {
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
      forwarded = new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify(
          typeof fields.email === "string"
            ? { ...fields, email: normalizeEmail(fields.email) }
            : fields,
        ),
      });
    }
    const answer = await deps.auth().handler(forwarded);
    return answer.ok ? withBody(answer, { status: true }) : answer;
  }

  return deps.auth().handler(request);
}
