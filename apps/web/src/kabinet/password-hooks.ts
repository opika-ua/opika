import type { Database } from "@opika/db";
import { authResetLinkRepo, kabinetActorRepo } from "@opika/db/repos";
import type { PasswordVerdict } from "@opika/domain";
import { APIError, isAPIError } from "better-auth/api";
import { z } from "zod";
import { clientIp } from "../api/client-ip";
import { addressRateLimitKey, ipRateLimitKey } from "../api/rate-limit-key";
import { linkTo, RESET_LINK } from "./email-links";
import { shelterPasswordVerdictOf } from "./password-checks";
import { AUTH_ERROR_CODES, PASSWORD_REFUSAL_CODES, SIGN_IN_DELAYED_CODE } from "./password-codes";
import {
  chargeSignInAttempt,
  clearSignInAttempts,
  type PasswordLimiters,
  type SignInAttempt,
} from "./password-limits";
import type { PasswordMailSender } from "./password-mail";

/** Better Auth's password endpoints, as `ctx.path` names them. */
export const PASSWORD_PATHS = {
  signIn: "/sign-in/email",
  signUp: "/sign-up/email",
  forgot: "/request-password-reset",
  reset: "/reset-password",
  change: "/change-password",
} as const;

/**
 * What the password guards read from a Better Auth hook's context: a
 * structural slice of it, so this module doesn't depend on Better Auth's
 * generic middleware types. Better Auth's own context satisfies it.
 */
export type PasswordHookContext = {
  path: string;
  body?: unknown;
  query?: unknown;
  request?: Request | undefined;
  context: {
    password: { hash: (password: string) => Promise<string> };
    internalAdapter: {
      findVerificationValue: (
        identifier: string,
      ) => Promise<{ value: string; expiresAt: Date } | null>;
      deleteVerificationByIdentifier: (identifier: string) => Promise<void>;
    };
    returned?: unknown;
  };
};

export type PasswordHookDeps = {
  db: Database;
  limiters: PasswordLimiters;
  mail: PasswordMailSender;
  /** After the response (`after()` in the route; immediate in tests), as the magic link's send. */
  schedule: (work: () => Promise<void>) => void;
  /**
   * Better Auth's own `requestPasswordReset`, called server-side (no request) for an address
   * «Забули пароль?» was asked for, from the work scheduled after the response. The token and
   * the email are Better Auth's, through the same statements an HTTP call to it runs.
   */
  requestReset: (email: string) => Promise<void>;
  baseURL: string;
  /** Where a failure that reaches nobody on screen is written; never a password, a token or an address. */
  log: (line: string) => void;
  /** The same, at error level: a failure someone should look at (PW1-F1). */
  logError: (line: string) => void;
};

/** The one answer «Забули пароль?» gives for any address (§6.3); the route reduces Better Auth's own to the same. */
export const FORGOT_ANSWER = { status: true } as const;

/** How long the delay store may take before a sign-in is refused rather than waited on (fail closed, as RL-1). */
const DELAY_STORE_TIMEOUT_MS = 1_000;

/**
 * How long voiding a user's reset links may hold a reset or a change (PW1-F1): one DELETE on a
 * table holding a few hours' links answers in tens of milliseconds, so a second means a stalled
 * database, and the links lapse within the hour anyway.
 */
const VOID_RESET_LINKS_TIMEOUT_MS = 1_000;

const isEmail = (value: unknown): value is string =>
  typeof value === "string" && z.email().safeParse(value).success;

const field = (source: unknown, name: string): unknown =>
  typeof source === "object" && source !== null
    ? (source as Record<string, unknown>)[name]
    : undefined;

const stringField = (source: unknown, name: string): string | null => {
  const value = field(source, name);
  return typeof value === "string" ? value : null;
};

/**
 * Better Auth's own 401 for a failed sign-in, built the same way
 * (`APIError.from("UNAUTHORIZED", BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD)`:
 * message first, then code), so the operator's refusal is byte for byte the
 * refusal anyone else gets (§5).
 */
const invalidCredentials = () =>
  new APIError("UNAUTHORIZED", {
    message: "Invalid email or password",
    code: AUTH_ERROR_CODES.invalidCredentials,
  });

/** Better Auth's own answer to an unknown or used reset token. */
const invalidToken = () =>
  new APIError("BAD_REQUEST", { message: "Invalid token", code: AUTH_ERROR_CODES.invalidToken });

const refusal = (verdict: Exclude<PasswordVerdict, { kind: "ok" }>) =>
  new APIError("BAD_REQUEST", {
    message: "Password refused",
    code: PASSWORD_REFUSAL_CODES[verdict.kind],
  });

/** The delay's refusal: the same body for every address, the minutes for «через {minutes} хв.». */
const delayed = (minutes: number) =>
  new APIError(
    "TOO_MANY_REQUESTS",
    {
      message: "Too many sign-in attempts",
      code: SIGN_IN_DELAYED_CODE,
      retryAfterMinutes: minutes,
    },
    { "Retry-After": String(minutes * 60) },
  );

/**
 * A database error's SQLSTATE (five digits or capitals: `57P01`, `08006`), from the driver's
 * error or the one Drizzle wraps, or null. Nothing else of the error is ever logged.
 */
const sqlStateOf = (error: unknown): string | null => {
  const code = field(field(error, "cause"), "code") ?? field(error, "code");
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : null;
};

const withTimeout = <T>(work: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

/**
 * The password guards (`docs/shelter-passwords.md` §4.1, §4.3, §4.6), called
 * from `createKabinetAuth`'s hooks and callbacks. Every rule here applies to
 * any HTTP call into Better Auth and to server code calling `auth.handler`
 * alike, because both pass through the hooks.
 */
export function passwordHooks(deps: PasswordHookDeps) {
  const actors = kabinetActorRepo(deps.db);

  /** The delay, failing closed: a store that errors or stalls refuses the attempt for a minute. */
  async function chargeAttempt(email: string, now: Date): Promise<SignInAttempt> {
    try {
      return await withTimeout(
        chargeSignInAttempt(deps.limiters.signInDelay, addressRateLimitKey(email), now),
        DELAY_STORE_TIMEOUT_MS,
      );
    } catch {
      deps.log("[kabinet] sign-in delay store unavailable: attempt refused (fail closed)");
      return { kind: "wait", minutes: 1 };
    }
  }

  /**
   * Work nobody waits for on screen: a failure is one log line naming only `what` (never the
   * address, a token or a link), never an unhandled rejection or Better Auth's own error log.
   */
  async function quietly(what: string, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch {
      deps.log(`[kabinet] ${what} failed after the response`);
    }
  }

  /** Work after the response (`deps.schedule`), failing `quietly`. */
  function later(what: string, work: () => Promise<void>) {
    deps.schedule(() => quietly(what, work));
  }

  /**
   * PW1-F1: once a new password is written, every reset link the user still holds is deleted, so
   * a link asked for earlier can't set another one. Oleksii, PW1-Q6, verbatim: "PW1-Q6: (a).
   * Delete the user's other unused reset links on any successful reset or change, in the same
   * transaction. Do it in PW-1 if it's a few lines; otherwise as the first follow-up." Not in the
   * same transaction: Better Auth's write is its own statement, and his PW1-F1 answer chose option
   * (ii) instead (verbatim excerpt: "(ii), a delete in our hook."), a second statement right after
   * that write, so a link used in the moment between the two still works. Awaited, before the
   * response, to keep that moment short.
   *
   * It never fails the reset or the change, and never holds one past
   * `VOID_RESET_LINKS_TIMEOUT_MS`: on a reset Better Auth awaits `onPasswordReset` and only then
   * revokes the sessions, so a throw here would leave them alive, and a stall would hold the
   * revoke (and leave the sessions alive if the function were killed meanwhile). A failure or a
   * timeout is one line at error level, masked (his PW1-F1 answer, verbatim excerpt: "A failure
   * is logged at error level, masked. The links die within the hour anyway."): no user id, no
   * address, never the error's message (a query error's message carries its parameters); only a
   * SQLSTATE code, when there is one.
   */
  async function voidResetLinks(userId: string, after: "reset" | "change"): Promise<void> {
    try {
      await withTimeout(
        authResetLinkRepo(deps.db).deleteUnused(userId),
        VOID_RESET_LINKS_TIMEOUT_MS,
      );
    } catch (error) {
      const code = sqlStateOf(error);
      deps.logError(
        `[kabinet] voiding the other reset links after a ${after} failed${code === null ? "" : ` (${code})`}; they lapse within the hour`,
      );
    }
  }

  /** Whether this user is a shelter admin with exactly this address now (the email's recipient). */
  const isShelterAdmin = async (user: { id: string; email: string }) =>
    (await actors.shelterAdminIdByEmail(user.email)) === user.id;

  return {
    /**
     * Before any session is read. Answers the request itself (by returning a
     * body) only for «Забули пароль?»'s uniform answer; refuses by throwing.
     *
     * - `/sign-up/email`: refused for everyone, though `disableSignUp` is set
     *   too and the route forwards no sign-up (§4.1: two locks, one test each).
     * - `/sign-in/email`: the per-address delay, charged before the password
     *   is even checked; then the operator guard, which burns a hash so the
     *   refusal takes as long as anyone's (§4.6, §5).
     * - `/request-password-reset` over HTTP: 20 an hour per IP, 3 per address,
     *   for any address; then the one answer, at once, for every well-formed
     *   address, with nothing else done before it (§4.4: "the answer takes the
     *   same time either way"). Who the address belongs to is asked only after
     *   the response, in the scheduled work, which calls Better Auth's own
     *   `requestPasswordReset` server-side.
     * - That server-side call (no request): a reset token only for a shelter
     *   admin. Everyone else (nobody, the operator, a roleless user) gets the
     *   same answer and no token (§4.6).
     * - `/reset-password`: 20 an hour per IP; the token must name a shelter
     *   admin (never the operator); the new password must pass the policy. All
     *   of it before Better Auth consumes the token, so a refused password
     *   leaves the link usable.
     */
    async beforeSession(
      ctx: PasswordHookContext,
      now: Date,
    ): Promise<typeof FORGOT_ANSWER | undefined> {
      switch (ctx.path) {
        case PASSWORD_PATHS.signUp:
          throw new APIError("FORBIDDEN", { message: "Sign-up is closed", code: "SIGN_UP_CLOSED" });

        case PASSWORD_PATHS.signIn: {
          const email = stringField(ctx.body, "email");
          if (!isEmail(email)) return undefined; // Better Auth's own 400
          const attempt = await chargeAttempt(email, now);
          if (attempt.kind === "wait") throw delayed(attempt.minutes);
          if (await actors.operatorGrantForEmail(email)) {
            await ctx.context.password.hash(stringField(ctx.body, "password") ?? "");
            throw invalidCredentials();
          }
          return undefined;
        }

        case PASSWORD_PATHS.forgot: {
          const email = stringField(ctx.body, "email");
          if (ctx.request === undefined) {
            // The call scheduled below, after the response has gone: a token
            // for a shelter admin only, never the operator (§4.6).
            if (!isEmail(email)) return undefined; // Better Auth's own 400
            return (await actors.shelterAdminIdByEmail(email)) === null ? FORGOT_ANSWER : undefined;
          }
          // Both limits cost every address the same: one store call each, the
          // address's key an HMAC whoever holds it.
          const charges = [
            deps.limiters.forgotPerIp.check(ipRateLimitKey(clientIp(ctx.request)), now),
            ...(email === null
              ? []
              : [deps.limiters.forgotPerAddress.check(addressRateLimitKey(email), now)]),
          ];
          if ((await Promise.all(charges)).includes(false)) {
            throw new APIError("TOO_MANY_REQUESTS");
          }
          if (!isEmail(email)) return undefined; // Better Auth's own 400
          // No lookup and no write before the answer: the role, the token and
          // the email all wait for the response, as the magic link's do (N1).
          later("the reset request", () => deps.requestReset(email));
          return FORGOT_ANSWER;
        }

        case PASSWORD_PATHS.reset: {
          if (
            ctx.request !== undefined &&
            !(await deps.limiters.resetPerIp.check(ipRateLimitKey(clientIp(ctx.request)), now))
          ) {
            throw new APIError("TOO_MANY_REQUESTS");
          }
          const token = stringField(ctx.body, "token") ?? stringField(ctx.query, "token");
          if (token === null) return undefined; // Better Auth's own INVALID_TOKEN
          const identifier = `reset-password:${token}`;
          const verification = await ctx.context.internalAdapter.findVerificationValue(identifier);
          if (verification === null || verification.expiresAt.getTime() < now.getTime()) {
            throw invalidToken();
          }
          const subject = await actors.passwordSubjectOf(verification.value);
          if (subject === null) {
            // Never created for the operator (`forgot` above), so this is a role
            // that changed within the hour, or a planted row: the token goes, and
            // the answer is the generic one.
            await ctx.context.internalAdapter.deleteVerificationByIdentifier(identifier);
            throw invalidToken();
          }
          const password = stringField(ctx.body, "newPassword");
          if (password === null) return undefined; // Better Auth's own 400
          const verdict = shelterPasswordVerdictOf(password, subject);
          if (verdict.kind !== "ok") throw refusal(verdict);
          return undefined;
        }

        default:
          return undefined;
      }
    },

    /**
     * «Змінити пароль», once `hooks.before` has found a live session for
     * `userId`. Only a shelter admin may: the operator and a support view (an
     * operator's session) get 403, as does a roleless user (§4.6). The new
     * password must pass the policy, and other sessions are always revoked
     * (Oleksii's scope item 7: "requires the current one; revokes other
     * sessions"), whatever the request asked for.
     */
    async beforeChange(
      ctx: PasswordHookContext,
      userId: string,
    ): Promise<{ context: { body: Record<string, unknown> } } | undefined> {
      const subject = await actors.passwordSubjectOf(userId);
      if (subject === null) throw new APIError("FORBIDDEN");
      const password = stringField(ctx.body, "newPassword");
      if (password === null) return undefined; // Better Auth's own 400
      const verdict = shelterPasswordVerdictOf(password, subject);
      if (verdict.kind !== "ok") throw refusal(verdict);
      const body = typeof ctx.body === "object" && ctx.body !== null ? ctx.body : {};
      return { context: { body: { ...body, revokeOtherSessions: true } } };
    },

    /**
     * After Better Auth answered. A successful sign-in clears its address's
     * delay (a failure needs nothing: the attempt was charged as it started);
     * a successful change voids the user's reset links (PW1-F1) and sends
     * «пароль змінено» (§9 answer 4).
     */
    async after(ctx: PasswordHookContext, now: Date): Promise<void> {
      if (isAPIError(ctx.context.returned) || ctx.context.returned === undefined) return;
      if (ctx.path === PASSWORD_PATHS.signIn) {
        const email = stringField(ctx.body, "email");
        if (email === null) return;
        try {
          await withTimeout(
            clearSignInAttempts(deps.limiters.signInDelay, addressRateLimitKey(email), now),
            DELAY_STORE_TIMEOUT_MS,
          );
        } catch {
          deps.log("[kabinet] sign-in delay store unavailable: a success was not cleared");
        }
        return;
      }
      if (ctx.path === PASSWORD_PATHS.change) {
        const user = field(ctx.context.returned, "user");
        const id = stringField(user, "id");
        const email = stringField(user, "email");
        if (id === null || email === null) return;
        await voidResetLinks(id, "change");
        later("the password-changed notice", async () => {
          if (await isShelterAdmin({ id, email })) await deps.mail.sendChanged({ email });
        });
      }
    },

    /**
     * Better Auth's `sendResetPassword`: called only for the shelter admins
     * `beforeSession` let through, and only inside the server-side call the
     * forgot answer scheduled (an HTTP «Забули пароль?» never reaches Better
     * Auth's endpoint), so it is already after the response and sends at once
     * rather than scheduling again. Checked once more (a second lock: never
     * the operator, §4.6); links to the reset page, never Better Auth's
     * redirecting GET. A failure is ours to log, `quietly`: left to Better
     * Auth, its background-task log would print the error itself.
     */
    async sendResetPassword(input: {
      user: { id: string; email: string };
      token: string;
    }): Promise<void> {
      const url = linkTo(deps.baseURL, RESET_LINK, input.token);
      await quietly("the reset email", async () => {
        if (await isShelterAdmin(input.user)) {
          await deps.mail.sendReset({ email: input.user.email, url });
        }
      });
    },

    /**
     * Better Auth's `onPasswordReset`, called once the new password is written and before the
     * sessions are revoked: voids the user's other reset links (PW1-F1; the one just used is
     * already consumed), then «пароль змінено» after a reset too (§9 answer 4).
     */
    async onPasswordReset(input: { user: { id: string; email: string } }): Promise<void> {
      await voidResetLinks(input.user.id, "reset");
      later("the password-changed notice", async () => {
        if (await isShelterAdmin(input.user))
          await deps.mail.sendChanged({ email: input.user.email });
      });
    },
  };
}

export type PasswordHooks = ReturnType<typeof passwordHooks>;
