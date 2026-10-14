import type { Database } from "@opika/db";
import { kabinetActorRepo, kabinetInvitedUsersRepo } from "@opika/db/repos";
import {
  authAccount,
  authInvitation,
  authMember,
  authOrganization,
  authSession,
  authUser,
  authVerification,
} from "@opika/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { magicLink } from "better-auth/plugins/magic-link";
import { organization } from "better-auth/plugins/organization";
import { clientIp } from "../api/client-ip";
import type { MagicLinkSender } from "./magic-link-sender";
import { type KabinetLimiters, kabinetIpKey, kabinetUserKey } from "./rate-limits";

/** KABINET N1: a link is good for 15 minutes. */
export const MAGIC_LINK_TTL_SECONDS = 15 * 60;

const DAY_SECONDS = 24 * 60 * 60;

/**
 * The kabinet session, mirroring decision #13's adopter session (HS-Q8,
 * Oleksii: "mirror decision #13"): a `__Host-` cookie, 30 days absolute, 7
 * days idle.
 *
 * - **Idle** is Better Auth's sliding expiry: a session expires `idleSeconds`
 *   after its last refresh, and a request refreshes it once it's older than
 *   `refreshSeconds`. So a session lapses between 6 and 7 days after its last
 *   use, never later.
 * - **Absolute** is not something Better Auth enforces (a sliding session
 *   used daily never expires), so a `hooks.before` on every Better Auth
 *   request deletes a session older than `absoluteMs` before the request
 *   sees it: `get-session` then reports no session, and nothing Better Auth
 *   serves (sign-out, later accept-invitation) can act on it. `kabinetIdentityOf`
 *   checks the same cap again as a second line (reviewer, HS-Q8, finding 1).
 */
export const KABINET_SESSION = {
  absoluteMs: 30 * DAY_SECONDS * 1000,
  idleSeconds: 7 * DAY_SECONDS,
  refreshSeconds: DAY_SECONDS,
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
   * response for any address", including how long it takes).
   */
  schedule: (work: () => Promise<void>) => void;
  baseURL: string;
  secret: string;
  secureCookies: boolean;
  /** The clock for the absolute session cap; injectable so tests can move it. */
  now?: () => Date;
  /**
   * The kabinet's own limiters (HS-Q10), charged on every HTTP call to
   * `LIMITED_AUTH_PATHS` (KH-Q6 follow-up). The served instance passes
   * `kabinetLimiters`, the same budgets `/api/kabinet/*` and `/kabinet`
   * page loads draw on.
   */
  limiters: KabinetLimiters;
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
 * charged, once: the proxy doesn't charge `/api/auth/*`.
 */
export const LIMITED_AUTH_PATHS: readonly string[] = [
  "/magic-link/verify",
  "/get-session",
  "/sign-out",
];

/**
 * Better Auth for the kabinet only (proposal §2, HS-Q1..Q7).
 *
 * - **Magic link only.** No password, no social sign-in.
 * - **No sign-up.** A user exists because the operator invited them, never
 *   because someone typed an address. Better Auth still "sends" to unknown
 *   addresses (it only refuses at verify time), so the sender below skips any
 *   address with no user, after the response.
 * - **Ids are generated here, not by the database** (reviewer, rows 1–2,
 *   finding 1): with `generateId: "uuid"` on Postgres, Better Auth leaves the
 *   id out and expects a database default, which these `text` keys don't
 *   have. A function makes Better Auth fill it in, as every other id in this
 *   repo is filled in by the app.
 * - **Organization plugin, with nobody able to create an organization or
 *   invite through it.** Only its `accept-invitation` endpoint is meant to
 *   run (HS-Q7); invitations and organizations are written server-side by
 *   `kabinetInvitationRepo`. The route forwards none of the plugin's paths in
 *   this slice (`FORWARDED_AUTH_PATHS`), so even acceptance is reachable only
 *   from tests until the registry PR.
 * - **No `admin` plugin** (HS-T2): it keeps a `role` on the user, and the
 *   super_admin role lives in `super_admins` only. A test fails if it's added.
 * - **Origin checks always on**, in tests too (`disableOriginCheck: false`).
 * - **No transactions.** Production's neon-http driver has none; on Postgres
 *   the Drizzle adapter runs statements one after another without them.
 */
export function createKabinetAuth(deps: KabinetAuthDeps) {
  const actors = kabinetActorRepo(deps.db);

  return betterAuth({
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
      expiresIn: KABINET_SESSION.idleSeconds,
      updateAge: KABINET_SESSION.refreshSeconds,
      // No cookie cache: every request reads the session row, so a revoked
      // or expired session stops working at once, not after the cache's TTL.
      cookieCache: { enabled: false },
    },
    account: { modelName: "auth_account" },
    verification: { modelName: "auth_verification" },
    emailAndPassword: { enabled: false },
    databaseHooks: {
      session: {
        create: {
          /**
           * The first sign-in of a user an invitation created (RG-Q3, RS-Q0):
           * stamped once, and from then on the clean-up never deletes them.
           * A no-op for every other user.
           */
          after: async (session) => {
            await kabinetInvitedUsersRepo(deps.db).markFirstSession(
              session.userId,
              (deps.now ?? (() => new Date()))(),
            );
          },
        },
      },
    },
    hooks: {
      // Runs before any plugin's own before-hooks. A plugin that rewrites the
      // `cookie` header (a bearer plugin, say) would inject the session after
      // this check, leaving the 30-day cap to `kabinetIdentityOf` alone: adding one
      // means moving this cap into a plugin hook that runs last (reviewer,
      // HS-Q8 pass 2).
      //
      // In the API's order (`handleKabinetRpc`): per IP first, before any
      // query, then per user once the cookie names a live session. For a
      // verify that is a browser already signed in; a verify from a fresh
      // browser has no user until it succeeds, and its per-address cap is
      // the 5 links an hour `signInLimiters` lets anyone be sent.
      before: createAuthMiddleware(async (ctx) => {
        const now = (deps.now ?? (() => new Date()))();
        const limited = ctx.request !== undefined && LIMITED_AUTH_PATHS.includes(ctx.path);
        if (
          limited &&
          ctx.request !== undefined &&
          !(await deps.limiters.perIp.check(kabinetIpKey(clientIp(ctx.request)), now))
        ) {
          throw new APIError("TOO_MANY_REQUESTS");
        }
        const token = await ctx.getSignedCookie(
          ctx.context.authCookies.sessionToken.name,
          ctx.context.secret,
        );
        if (!token) return;
        const found = await ctx.context.internalAdapter.findSession(token);
        if (found === null) return;
        const age = now.getTime() - found.session.createdAt.getTime();
        if (age > KABINET_SESSION.absoluteMs) {
          await ctx.context.internalAdapter.deleteSession(token);
          return;
        }
        if (
          limited &&
          !(await deps.limiters.perUser.check(kabinetUserKey(found.session.userId), now))
        ) {
          throw new APIError("TOO_MANY_REQUESTS");
        }
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
        sendMagicLink: async ({ email, url }) => {
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
  "/api/auth/magic-link/verify",
  "/api/auth/get-session",
  "/api/auth/sign-out",
] as const;
