import type { Database } from "@opika/db";
import { kabinetActorRepo } from "@opika/db/repos";
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
import { magicLink } from "better-auth/plugins/magic-link";
import { organization } from "better-auth/plugins/organization";
import type { MagicLinkSender } from "./magic-link-sender";

/** KABINET N1: a link is good for 15 minutes. */
export const MAGIC_LINK_TTL_SECONDS = 15 * 60;

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
};

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
    session: { modelName: "auth_session" },
    account: { modelName: "auth_account" },
    verification: { modelName: "auth_verification" },
    emailAndPassword: { enabled: false },
    telemetry: { enabled: false },
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
      // Explicit, never left to the default: Better Auth turns origin and
      // callbackURL checks *off* when it detects a test runner, so a default
      // here would mean every test ran a less safe product than production
      // (reviewer, row 3, finding 2).
      disableOriginCheck: false,
      cookiePrefix: "kabinet",
      useSecureCookies: deps.secureCookies,
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
