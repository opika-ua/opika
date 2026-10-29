import type { Database } from "@opika/db";
import { authResetLinkRepo, kabinetActorRepo } from "@opika/db/repos";
import type { PasswordVerdict } from "@opika/domain";
import { APIError, isAPIError } from "better-auth/api";
import { z } from "zod";
import { clientIp } from "../api/client-ip";
import { addressRateLimitKey, ipRateLimitKey } from "../api/rate-limit-key";
import { logRateLimited } from "../api/rate-limit-log";
import { linkTo, RESET_LINK } from "./email-links";
import { field, stringField } from "./fields";
import { shelterPasswordVerdictOf } from "./password-checks";
import { AUTH_ERROR_CODES, PASSWORD_REFUSAL_CODES, SIGN_IN_DELAYED_CODE } from "./password-codes";
import {
  chargeSignInAttempt,
  clearSignInAttempts,
  type PasswordLimiters,
  type SignInAttempt,
} from "./password-limits";
import type { PasswordMailSender } from "./password-mail";
import { type PasswordWriteCheck, signInRaceCheck } from "./sign-in-race";
import { sqlStateOf } from "./sql-state";

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
      deleteSession: (token: string) => Promise<void>;
      /** Better Auth's own sign-in read (`includeAccounts`: the user, then its accounts). */
      findUserByEmail: (email: string, options: { includeAccounts: true }) => Promise<unknown>;
    };
    /** In `hooks.after`: what the endpoint answered (an `APIError` for a failure). */
    returned?: unknown;
    /** In `hooks.after`: the headers the answer will carry so far (a sign-in's session cookie). */
    responseHeaders?: Headers | undefined;
    /** The session this request created, as Better Auth's `setSessionCookie` records it. */
    newSession?: { session: { token: string } } | null;
    setNewSession?: (session: null) => void;
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

/** A SQLSTATE in parentheses for a log line, or nothing. */
const sqlStateSuffix = (code: string | null) => (code === null ? "" : ` (${code})`);

/**
 * The log line for each reason a successful password sign-in is refused (PW1-F6). None names the
 * user, the address or the session. The race itself is a warning (someone held the old password
 * as it was replaced, and the refusal is the system working); the other two are errors, someone
 * should look.
 */
const refusalLine = (check: Exclude<PasswordWriteCheck, { kind: "unchanged" }>) => {
  switch (check.kind) {
    case "written":
      return {
        level: "warn",
        line: "[kabinet] password sign-in refused: the password was written while it ran",
      } as const;
    case "not_begun":
      return {
        level: "error",
        line: "[kabinet] password sign-in refused: no first password read",
      } as const;
    case "unreadable":
      return {
        level: "error",
        line: `[kabinet] password sign-in refused: the second password read failed${sqlStateSuffix(check.sqlState)}`,
      } as const;
  }
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

/** What a password write was, for the masked log line when voiding the links after it fails. */
const AFTER_PHRASE = {
  reset: "a reset",
  change: "a change",
  invitation: "the invitation's password",
} as const;

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
 * runs its own session revoke, so a throw here would answer an error for a password already
 * set and skip that revoke, and a stall would hold the answer. Since PW1-F5 neither leaves
 * alive a session that existed when the password was written: the write itself ended every one
 * of them, in its own statement (migration 0013's triggers). Better Auth's revoke is the second
 * line, and it also catches a session inserted between the write and its own delete, which a
 * skipped revoke would leave. A sign-in racing the write (one that checked the old password
 * before it) keeps no session without that revoke: inserted before the write's statement, the
 * trigger deletes it; after, its own after-hook's second read, which waits for a write in
 * flight (`FOR SHARE`), sees the write and deletes it (PW1-F6, `sign-in-race.ts`). A failure or
 * a timeout is one line at error level, masked (his PW1-F1
 * answer, verbatim excerpt: "A failure is logged at error level, masked. The links die within
 * the hour anyway."): no user id, no address, never the error's message (a query error's
 * message carries its parameters); only a SQLSTATE code, when there is one.
 *
 * PW-2 sets a first password at the invitation through a third path, which calls this too
 * (PW1-F1-N1).
 */
export function resetLinkVoider(
  deps: Pick<PasswordHookDeps, "db" | "logError">,
): (userId: string, after: keyof typeof AFTER_PHRASE) => Promise<void> {
  return async (userId, after) => {
    try {
      await withTimeout(
        authResetLinkRepo(deps.db).deleteUnused(userId),
        VOID_RESET_LINKS_TIMEOUT_MS,
      );
    } catch (error) {
      const code = sqlStateOf(error);
      deps.logError(
        `[kabinet] voiding the other reset links after ${AFTER_PHRASE[after]} failed${code === null ? "" : ` (${code})`}; they lapse within the hour`,
      );
    }
  };
}

/**
 * The password guards (`docs/shelter-passwords.md` §4.1, §4.3, §4.6), called
 * from `createKabinetAuth`'s hooks and callbacks. Every rule here applies to
 * any HTTP call into Better Auth and to server code calling `auth.handler`
 * alike, because both pass through the hooks.
 */
export function passwordHooks(deps: PasswordHookDeps) {
  const actors = kabinetActorRepo(deps.db);
  const race = signInRaceCheck(deps.db);

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

  const voidResetLinks = resetLinkVoider(deps);

  /** Whether this user is a shelter admin with exactly this address now (the email's recipient). */
  const isShelterAdmin = async (user: { id: string; email: string }) =>
    (await actors.shelterAdminIdByEmail(user.email)) === user.id;

  /**
   * PW1-F6: a successful password sign-in made into the failure a wrong password gets, with
   * nothing it made leaving the server (the caller throws that failure next).
   *
   * - **Every header the endpoint set is dropped**: the session cookie, and a `Location` for a
   *   `callbackURL`. A wrong password's answer carries none, so the two answers are the same
   *   status, body and headers, and the browser is told nothing (a cookie it already held is
   *   left as a wrong password leaves it).
   * - **The session goes**, by its own token only: any other session of the user now was made
   *   after the write ended them all (PW1-F5), with the new password or by a change, and is not
   *   this request's to end. Later hooks no longer see it (`setNewSession(null)`, as Better
   *   Auth's own two-factor plugin does to a sign-in it holds back).
   * - **The delay is not cleared**: the attempt was charged as it began and counts as the
   *   failure it answers, so a refused sign-in is never a way round the delay, and costs no
   *   more than a wrong password does.
   *
   * A delete that fails still refuses: the token was in nothing that left the server (the
   * cookie dropped, the body Better Auth's error), so the row is unreachable until it lapses.
   * That is logged at error level, with only a SQLSTATE.
   */
  async function refuseSignIn(
    ctx: PasswordHookContext,
    check: Exclude<PasswordWriteCheck, { kind: "unchanged" }>,
  ): Promise<void> {
    const headers = ctx.context.responseHeaders;
    if (headers !== undefined) {
      for (const name of [...headers.keys()]) headers.delete(name);
    }
    const token =
      ctx.context.newSession?.session.token ?? stringField(ctx.context.returned, "token");
    ctx.context.setNewSession?.(null);
    const { level, line } = refusalLine(check);
    (level === "warn" ? deps.log : deps.logError)(line);
    if (token === null) return;
    try {
      await ctx.context.internalAdapter.deleteSession(token);
    } catch (error) {
      deps.logError(
        `[kabinet] a refused password sign-in's session could not be deleted${sqlStateSuffix(sqlStateOf(error))}; its token never left the server`,
      );
    }
  }

  return {
    /**
     * Before any session is read. Answers the request itself (by returning a
     * body) only for «Забули пароль?»'s uniform answer; refuses by throwing.
     *
     * - `/sign-up/email`: refused for everyone, though `disableSignUp` is set
     *   too and the route forwards no sign-up (§4.1: two locks, one test each).
     * - `/sign-in/email`: the per-address delay, charged before the password
     *   is even checked; then PW1-F6's first read of the credential, before
     *   Better Auth reads the hash (`sign-in-race.ts`); then the operator
     *   guard, which makes Better Auth's user and credential reads itself
     *   (PW1-F7), burns a hash and makes the second read, so the refusal does
     *   the same work as a wrong password's (§4.6, §5).
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
          if (attempt.kind === "wait") {
            logRateLimited("kabinet-sign-in-delay");
            throw delayed(attempt.minutes);
          }
          await race.begin(ctx.context, email);
          if (await actors.operatorGrantForEmail(email)) {
            // PW1-F7: Better Auth's own two reads, through its own call, before the hash, so the
            // operator's refusal does a wrong password's work, statement for statement. What
            // they find is not used: the operator is refused whatever it is (§4.6).
            await ctx.context.internalAdapter.findUserByEmail(email, { includeAccounts: true });
            await ctx.context.password.hash(stringField(ctx.body, "password") ?? "");
            await race.settle(ctx.context);
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
     *
     * The forced `revokeOtherSessions` is load-bearing since PW1-F5: the
     * password write itself ends every session of the user, this device's
     * too (migration 0013), and this device stays signed in only because,
     * with it, Better Auth creates a new session after the write. Without it
     * every change would sign the person out where they made it.
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
     * After Better Auth answered. Every password sign-in makes PW1-F6's second read, its failures
     * too, so a success and a failure do the same reads (his words, verbatim excerpt: "Run the
     * check on every sign-in so the timing stays identical."). A failure stands as Better Auth
     * gave it, its attempt charged as it began. A success stands only if no password was written
     * while it ran (`sign-in-race.ts`): then it clears its address's delay; otherwise it becomes
     * the failure a wrong password gets (`refuseSignIn`). A successful change voids the user's
     * reset links (PW1-F1) and sends «пароль змінено» (§9 answer 4).
     */
    async after(ctx: PasswordHookContext, now: Date): Promise<void> {
      if (ctx.path === PASSWORD_PATHS.signIn) {
        const check = await race.settle(ctx.context);
        if (isAPIError(ctx.context.returned) || ctx.context.returned === undefined) return;
        if (check.kind !== "unchanged") {
          await refuseSignIn(ctx, check);
          throw invalidCredentials();
        }
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
      if (isAPIError(ctx.context.returned) || ctx.context.returned === undefined) return;
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
     * Better Auth's `onPasswordReset`, called once the new password is written (which ended the
     * user's sessions, PW1-F5) and before Better Auth's own revoke: voids the user's other reset
     * links (PW1-F1; the one just used is already consumed), then «пароль змінено» after a reset
     * too (§9 answer 4).
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
