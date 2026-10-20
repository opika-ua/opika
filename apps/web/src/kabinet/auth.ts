import type { Database } from "@opika/db";
import { KABINET_SESSION_LIMITS, kabinetActorRepo, kabinetInvitedUsersRepo } from "@opika/db/repos";
import {
  authAccount,
  authInvitation,
  authMember,
  authOrganization,
  authSession,
  authUser,
  authVerification,
} from "@opika/db/schema";
import { PASSWORD_MAX_CHARACTERS, PASSWORD_MIN_CHARACTERS } from "@opika/domain";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { magicLink } from "better-auth/plugins/magic-link";
import { organization } from "better-auth/plugins/organization";
import { clientIp } from "../api/client-ip";
import { ipRateLimitKey } from "../api/rate-limit-key";
import { MAGIC_LINK_TTL_SECONDS, type MagicLinkSender } from "./magic-link-sender";
import { PASSWORD_PATHS, passwordHooks } from "./password-hooks";
import type { PasswordLimiters } from "./password-limits";
import { type PasswordMailSender, RESET_PASSWORD_TTL_SECONDS } from "./password-mail";
import { type KabinetLimiters, kabinetUserKey } from "./rate-limits";
import { sessionHasLapsed } from "./session-lapse";

/** KABINET N1: a link is good for 15 minutes. Defined beside the sender, re-exported here. */
export { MAGIC_LINK_TTL_SECONDS } from "./magic-link-sender";

/**
 * Where an emailed magic link lands (IN-Q11): a page whose GET only shows a
 * button, so a mail scanner following the link consumes nothing. Better
 * Auth's own verify URL consumes on GET, which is why it's never emailed and
 * no longer forwarded (`docs/h2-invite-confirm-shapes.md`).
 */
export const CONFIRM_PATH = "/kabinet/vkhid/pidtverdzhennia";

export const confirmUrlOf = (baseURL: string, token: string): string => {
  const url = new URL(CONFIRM_PATH, baseURL);
  url.searchParams.set("token", token);
  return url.toString();
};

/**
 * The kabinet session: a `__Host-` cookie (decision #13's pattern, HS-Q8),
 * living by its holder's limits (`KABINET_SESSION_LIMITS`, `@opika/db`): a
 * shelter admin 30 days since the last visit and 90 at most (F-B9, §9 answer
 * 6), the operator 7 and 30 (§9 answer 3).
 *
 * - **Better Auth's own expiry is set to the longest any session may live**,
 *   the shelter admin's 90 days (`expiresInSeconds`). It also sets the
 *   cookie's lifetime, from sign-in, and nothing renews the cookie later: the
 *   kabinet reads sessions server-side (`auth.api.getSession` in the pages,
 *   the API and the proxy), which refreshes the row but throws its
 *   `Set-Cookie` away. Were Better Auth's expiry the 30-day idle limit, every
 *   session would end 30 days after sign-in, used or not: not rolling at all.
 * - **The limits are ours.** Every kabinet request refreshes the row
 *   (`updated_at`; `refreshSeconds` is 0, PW1-Q2), so "30 days from the last
 *   visit" is exact; `hooks.before` deletes a session past
 *   its holder's idle limit or cap before the request sees it (`get-session`
 *   then reports none, and nothing Better Auth serves can act on it), and
 *   `kabinetSessionUserIdOf` refuses it as a second line (reviewer, HS-Q8,
 *   finding 1). The clean-up deletes it within six hours (`authExpiryRepo`).
 *   Oleksii, 2026-10-20, verbatim: "PW1-Q2: (b). Refresh the session on every
 *   kabinet request, so "30 days from the last visit" is exactly true. Kabinet
 *   sessions only, not the rest of the site." This instance serves the kabinet
 *   only; the adopter session is separate (decision #13).
 */
export const KABINET_SESSION = {
  expiresInSeconds: KABINET_SESSION_LIMITS.shelterAdmin.absoluteMs / 1000,
  refreshSeconds: 0,
} as const;

/**
 * `__Host-` in production, as decision #13 does for adopters: it forbids a
 * `Domain` attribute and requires `Secure` and `Path=/`, so no subdomain can
 * set or overwrite it. Over plain HTTP (local dev) browsers refuse `__Host-`,
 * so dev gets the bare name, exactly as the adopter cookie falls back to
 * `session`. Better Auth's own `__Secure-` prefixing is switched off so the
 * two prefixes never stack.
 */
export function kabinetCookieName(base: "session_token" | "dont_remember", secure: boolean) {
  return `${secure ? "__Host-" : ""}kabinet.${base}`;
}

export type KabinetAuthDeps = {
  db: Database;
  sender: MagicLinkSender;
  /**
   * Runs work after the response has gone out (`after` from `next/server` in
   * the route; immediate in tests). The send, and the lookup deciding whether
   * to send at all, both happen here, so the sign-in response takes the same
   * time whether or not the address belongs to anyone (N1: "identical
   * response for any address", including how long it takes). «Забули
   * пароль?» works the same way (§4.4): the role lookup, the reset token and
   * the email all run here (`password-hooks.ts`).
   */
  schedule: (work: () => Promise<void>) => void;
  baseURL: string;
  secret: string;
  secureCookies: boolean;
  /** The clock for the session limits and the password delays; injectable so tests can move it. */
  now?: () => Date;
  /**
   * The kabinet's own limiters (HS-Q10), charged on every HTTP call to
   * `LIMITED_AUTH_PATHS` (KH-Q6 follow-up). The served instance passes
   * `kabinetLimiters`, the same budgets `/api/kabinet/*` and `/kabinet`
   * page loads draw on.
   */
  limiters: KabinetLimiters;
  /** PW-1's own budgets and the sign-in delay (§4.3); the served instance passes `passwordLimiters`. */
  passwordLimiters: PasswordLimiters;
  /** PW-1: the reset link and the «пароль змінено» notice (§4.4). */
  passwordMail: PasswordMailSender;
  /** Where a failure nobody sees on screen is logged (masked); defaults to `console.warn`. */
  log?: (line: string) => void;
  /** The same at error level (masked), for a failure someone should look at; defaults to `console.error`. */
  logError?: (line: string) => void;
};

/**
 * The Better Auth endpoints the kabinet limiters guard (Oleksii, 2026-10-14:
 * "magic-link/verify, get-session and sign-out go behind the existing kabinet
 * limiters"). Better Auth's own limiter is off: `disableIpTracking` (KH-Q6)
 * turns it off with the IP, so without these the three would have no limit
 * at all once the 503 lifts.
 *
 * `sign-in/magic-link` is not here: the route charges it against
 * `signInLimiters` (HS-Q5) and, over the limit, answers exactly as a success
 * does, so a 429 from here would undo that.
 *
 * **Why the kabinet limiters, for all three, and not `signInLimiters`.**
 * Those budget link *sends* (5 an hour per address, 20 per IP). Charging a
 * verify there would make every sign-in cost two of the IP's 20, and a
 * get-session or sign-out is a read or a logout, like an API call, not a
 * request for mail. A verify's own abuse case is guessing tokens, and a
 * 32-letter token can't be guessed at 300 a minute or at any rate; what's
 * left to protect is the database each call reads, which is exactly what
 * the kabinet budgets were set for.
 *
 * **Why in `hooks.before`, not in the `/api/auth` route.** Every HTTP call
 * into Better Auth passes here, whoever makes it: the `/api/auth` route and
 * any server code that calls `auth.handler` with a request, such as a
 * confirm page that runs the verify server-side on a button's POST. A check
 * in the route alone would leave that second path unlimited.
 *
 * **Why only with a request.** Server code also calls `auth.api.getSession`
 * directly, on every `/kabinet` page load and every `/api/kabinet/*` call,
 * to find the user. Those calls have no `ctx.request`, and are already
 * charged where they arrive (`proxy.ts` per page load, `handleKabinetRpc`
 * per API call). Charging them here as well would bill one page load two or
 * three times. A browser's own `/api/auth/get-session` is an HTTP call and is
 * charged, once: the proxy doesn't charge `/api/auth/*`. The verify, which
 * the route no longer forwards (IN-Q11), is charged once too: here, on the
 * confirm page's server-built request, while the proxy leaves that POST
 * uncharged (`isChargedKabinetPageLoad`).
 *
 * **The password endpoints (PW-1, §4.1)** are here too: the password sign-in,
 * «Забули пароль?», a reset link's POST and «Змінити пароль». Each also has
 * its own budget on top (`password-hooks.ts`, §4.3): the per-address delay,
 * 20 an hour per IP and 3 per address, 20 an hour per IP; the change is behind
 * the per-user budget below. A per-IP refusal here answers 429 with no
 * minutes, and the sign-in form reads it as one minute: this budget's window
 * is 60 s, so «через 1 хв.» is true of it.
 */
export const LIMITED_AUTH_PATHS: readonly string[] = [
  "/magic-link/verify",
  "/get-session",
  "/sign-out",
  PASSWORD_PATHS.signIn,
  PASSWORD_PATHS.forgot,
  PASSWORD_PATHS.reset,
  PASSWORD_PATHS.change,
];

/**
 * Better Auth for the kabinet only (proposal §2, HS-Q1..Q7).
 *
 * - **Shelter admins sign in with a password or a magic link; the operator by
 *   link only** (PW-1, `docs/shelter-passwords.md`). Email and password is on
 *   with sign-up off, scrypt (Better Auth's default) for hashing, the policy
 *   and every guard in `password-hooks.ts`, and the reset token stored hashed.
 *   No social sign-in.
 * - **No sign-up.** A user exists because the operator invited them, never
 *   because someone typed an address. Better Auth still "sends" to unknown
 *   addresses (it only refuses at verify time), so the sender below skips any
 *   address with no user, after the response. The password sign-up is refused
 *   twice: `disableSignUp`, and `hooks.before` for everyone.
 * - **Ids are generated here, not by the database** (reviewer, rows 1–2,
 *   finding 1): with `generateId: "uuid"` on Postgres, Better Auth leaves the
 *   id out and expects a database default, which these `text` keys don't
 *   have. A function makes Better Auth fill it in, as every other id in this
 *   repo is filled in by the app.
 * - **Organization plugin, with nobody able to create an organization or
 *   invite through it.** Invitations and organizations are written
 *   server-side by `kabinetInvitationRepo`, and acceptance is our own
 *   statement (`kabinetInvitationAcceptRepo`, IN-Q13, superseding HS-Q7's
 *   use of the plugin's `accept-invitation` for this step). The plugin stays
 *   for its schema and its reads; the route forwards none of its paths
 *   (`FORWARDED_AUTH_PATHS`).
 * - **No `admin` plugin** (HS-T2): it keeps a `role` on the user, and the
 *   super_admin role lives in `super_admins` only. A test fails if it's added.
 * - **Origin checks always on**, in tests too (`disableOriginCheck: false`).
 * - **No transactions.** Production's neon-http driver has none; on Postgres
 *   the Drizzle adapter runs statements one after another without them. So
 *   ending a user's sessions when their password is written, which must not
 *   fail on its own, is the database's job, in the write's own statement
 *   (PW1-F5, migration 0013's triggers), with Better Auth's revoke after it as
 *   a second line.
 */
export function createKabinetAuth(deps: KabinetAuthDeps) {
  const actors = kabinetActorRepo(deps.db);
  const clock = deps.now ?? (() => new Date());
  const passwords = passwordHooks({
    db: deps.db,
    limiters: deps.passwordLimiters,
    mail: deps.passwordMail,
    schedule: deps.schedule,
    // Only ever called after `auth` exists: from work a request it serves scheduled.
    requestReset: async (email: string): Promise<void> => {
      await auth.api.requestPasswordReset({ body: { email } });
    },
    baseURL: deps.baseURL,
    log: deps.log ?? ((line) => console.warn(line)),
    logError: deps.logError ?? ((line) => console.error(line)),
  });

  const auth = betterAuth({
    baseURL: deps.baseURL,
    basePath: "/api/auth",
    secret: deps.secret,
    database: drizzleAdapter(deps.db, {
      provider: "pg",
      transaction: false,
      schema: {
        auth_user: authUser,
        auth_session: authSession,
        auth_account: authAccount,
        auth_verification: authVerification,
        auth_organization: authOrganization,
        auth_member: authMember,
        auth_invitation: authInvitation,
      },
    }),
    user: { modelName: "auth_user" },
    session: {
      modelName: "auth_session",
      expiresIn: KABINET_SESSION.expiresInSeconds,
      updateAge: KABINET_SESSION.refreshSeconds,
      // No cookie cache: every request reads the session row, so a revoked
      // or expired session stops working at once, not after the cache's TTL.
      cookieCache: { enabled: false },
    },
    account: { modelName: "auth_account" },
    verification: {
      modelName: "auth_verification",
      // Oleksii's scope item 6: "single-use token, 1h, stored hashed". The row
      // keeps SHA-256 of `reset-password:<token>` (Better Auth 1.6.33's
      // `storeIdentifier`), never the token; magic-link rows are hashed by the
      // plugin itself (`storeToken`), so the default stays plain for them.
      storeIdentifier: { default: "plain", overrides: { "reset-password:": "hashed" } },
    },
    emailAndPassword: {
      enabled: true,
      // An account exists only through the operator's invitation (commitment #6).
      disableSignUp: true,
      autoSignIn: false,
      // A second line under the policy (`passwordVerdictOf`, run first in the
      // hooks). Better Auth counts UTF-16 units, the policy counts characters
      // as a reader does: Better Auth's floor never refuses what the policy
      // passes, and its ceiling can only refuse a password of at most 128
      // characters that is over 128 units (emoji-heavy), which it answers as
      // too long.
      minPasswordLength: PASSWORD_MIN_CHARACTERS,
      maxPasswordLength: PASSWORD_MAX_CHARACTERS,
      resetPasswordTokenExpiresIn: RESET_PASSWORD_TTL_SECONDS,
      // Scope item 6: "On reset: all other sessions are revoked." Better Auth
      // deletes every session of the user; the reset itself holds none. A
      // second line since PW1-F5: the password write has already ended them,
      // in its own statement (migration 0013), so a failure here leaves none.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: (input) => passwords.sendResetPassword(input),
      // Voids the user's other reset links (PW1-F1), then the notice. The change does the same
      // from `hooks.after`.
      onPasswordReset: (input) => passwords.onPasswordReset(input),
    },
    databaseHooks: {
      session: {
        create: {
          /**
           * The first sign-in of a user an invitation created (RG-Q3, RS-Q0):
           * stamped once, and from then on the clean-up never deletes them.
           * A no-op for every other user.
           */
          after: async (session) => {
            await kabinetInvitedUsersRepo(deps.db).markFirstSession(session.userId, clock());
          },
        },
      },
    },
    hooks: {
      // Runs before any plugin's own before-hooks. A plugin that rewrites the
      // `cookie` header (a bearer plugin, say) would inject the session after
      // this check, leaving the session limits to `kabinetSessionUserIdOf`
      // alone: adding one means moving this check into a plugin hook that runs
      // last (reviewer, HS-Q8 pass 2).
      //
      // In the API's order (`handleKabinetRpc`): per IP first, before any
      // query, then the password guards that need no session (`password-hooks.ts`:
      // the sign-up refusal, the sign-in delay and operator guard, «Забули
      // пароль?», a reset's token and policy), then per user once the cookie
      // names a live session, and last «Змінити пароль»'s role and policy. The
      // verify reaches here only through the confirm page's server-side call,
      // which forwards no cookie, so for it the per-user check never runs: it
      // is charged per IP only, and its per-address cap is the 5 links an hour
      // `signInLimiters` lets anyone be sent.
      before: createAuthMiddleware(async (ctx) => {
        const now = clock();
        const limited = ctx.request !== undefined && LIMITED_AUTH_PATHS.includes(ctx.path);
        if (
          limited &&
          ctx.request !== undefined &&
          !(await deps.limiters.perIp.check(ipRateLimitKey(clientIp(ctx.request)), now))
        ) {
          throw new APIError("TOO_MANY_REQUESTS");
        }
        const answered = await passwords.beforeSession(ctx, now);
        if (answered !== undefined) return answered;
        const token = await ctx.getSignedCookie(
          ctx.context.authCookies.sessionToken.name,
          ctx.context.secret,
        );
        if (!token) return undefined;
        const found = await ctx.context.internalAdapter.findSession(token);
        if (found === null) return undefined;
        const userId = found.session.userId;
        if (
          await sessionHasLapsed(found.session, now, () => actors.hasActiveOperatorGrant(userId))
        ) {
          await ctx.context.internalAdapter.deleteSession(token);
          return undefined;
        }
        if (limited && !(await deps.limiters.perUser.check(kabinetUserKey(userId), now))) {
          throw new APIError("TOO_MANY_REQUESTS");
        }
        if (ctx.path === PASSWORD_PATHS.change) return passwords.beforeChange(ctx, userId);
        return undefined;
      }),
      after: createAuthMiddleware(async (ctx) => {
        await passwords.after(ctx, clock());
      }),
    },
    telemetry: { enabled: false },
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
      // Explicit, never left to the default: Better Auth turns origin and
      // callbackURL checks *off* when it detects a test runner, so a default
      // here would mean every test ran a less safe product than production
      // (reviewer, row 3, finding 2).
      disableOriginCheck: false,
      // KH-Q6: no client IP on the session row. Better Auth 1.6.33 then
      // writes `ip_address = ''` (its `getIp(...) || ""`), never an address.
      // The same switch turns off Better Auth's own built-in rate limiter
      // (`resolveRateLimitConfig` returns null without an IP). Every limit
      // here is ours, keyed on the request's IP in the limiter store, never
      // in this table: `signInLimiters` on magic-link requests (HS-Q5), and
      // the kabinet limiters on verify, get-session and sign-out (the
      // `hooks.before` above, `LIMITED_AUTH_PATHS`). Better Auth has no option
      // for the user agent: `createSession` always copies the `user-agent`
      // header as is, and Oleksii chose to keep it rather than have our code
      // rewrite Better Auth's session row (KH-Q6, answered 2026-10-14).
      // `auth.test.ts` asserts what the row holds after a sign-in.
      ipAddress: { disableIpTracking: true },
      // Prefixes are ours (`kabinetCookieName`), not Better Auth's. The
      // `kabinet` prefix still names any cookie not listed below, so nothing
      // falls back to a shared `better-auth.*` name on this origin.
      cookiePrefix: "kabinet",
      useSecureCookies: false,
      defaultCookieAttributes: { secure: deps.secureCookies, sameSite: "lax", path: "/" },
      cookies: {
        session_token: { name: kabinetCookieName("session_token", deps.secureCookies) },
        dont_remember: { name: kabinetCookieName("dont_remember", deps.secureCookies) },
      },
    },
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_TTL_SECONDS,
        disableSignUp: true,
        // The link is a credential; the database keeps only its hash.
        storeToken: "hashed",
        // Better Auth's `url` is its consuming verify endpoint; the email
        // carries the confirm page instead (IN-Q11).
        sendMagicLink: async ({ email, token }) => {
          const url = confirmUrlOf(deps.baseURL, token);
          deps.schedule(async () => {
            if (await actors.hasUserWithEmail(email)) await deps.sender.send({ email, url });
          });
        },
      }),
      organization({
        allowUserToCreateOrganization: false,
        schema: {
          organization: { modelName: "auth_organization" },
          member: { modelName: "auth_member" },
          invitation: { modelName: "auth_invitation" },
        },
      }),
    ],
  });
  return auth;
}

export type KabinetAuth = ReturnType<typeof createKabinetAuth>;

/**
 * The only Better Auth paths the route forwards (deny-by-default, the same
 * idea as `pick` over `omit`). Anything else under `/api/auth` is 404, so an
 * endpoint a future Better Auth version adds, or one a plugin brings in, is
 * unreachable until someone adds it here on purpose.
 */
export const FORWARDED_AUTH_PATHS = [
  "/api/auth/sign-in/magic-link",
  // Not "/api/auth/magic-link/verify": it consumes the token on a GET, so a
  // mail scanner would burn the link. The confirm page's POST reaches it
  // server-side instead (`confirm-route.ts`, IN-Q11).
  "/api/auth/get-session",
  "/api/auth/sign-out",
  // PW-1 (§4.1). Not "/api/auth/reset-password/:token": Better Auth's
  // redirecting GET is never emailed and never forwarded (the reset page's
  // GET only shows the form, its POST reaches "/api/auth/reset-password").
  // Not "/api/auth/sign-up/email": there is no sign-up (commitment #6).
  "/api/auth/sign-in/email",
  "/api/auth/request-password-reset",
  "/api/auth/reset-password",
  "/api/auth/change-password",
] as const;
