import { pendingCopyPaths, uk } from "@opika/i18n";
import {
  SHELTER_WRITE_POLICY,
  type ShelterWritePolicy,
  testShelterCopyExemptUnder,
} from "./access";
import type { EmailRoutes } from "./email-provider";
import { operatorDisplayName } from "./operator";
import { signInConfigOf } from "./sign-in-env";

/**
 * When production sign-in is on (IN-Q6, Oleksii: "Q6: accepted, plus:
 * previews never send real email (provider key unset in Preview → auth
 * off). Test that BETTER_AUTH_URL equals the production origin."; and IN-R2,
 * Decision 2: "PRODUCTION_ORIGIN=https://opika.org.ua (apex), pinned
 * explicitly. Don't use VERCEL_PROJECT_PRODUCTION_URL for this. Fail closed:
 * if the environment can't be identified, sign-in is refused, never
 * skipped." and "Previews: refuse sign-in outright."):
 *
 * - only on a deployment that says it is production (`VERCEL_ENV` is
 *   `production`). A Preview is refused outright, and so is any environment
 *   that can't be identified (unset or unknown `VERCEL_ENV`, as off Vercel):
 *   fail closed, never skipped;
 * - only when no `kabinet.*` string, the email templates included, is still
 *   `[COPY PENDING]` (one exception since CG-Q1: `kabinet.testShelterOnly.*`,
 *   while the write policy is the refusal; see
 *   `testShelterCopyExemptUnder`) (Oleksii, 2026-10-14, answer 7, verbatim: "Yes.
 *   Production sign-in stays off while any kabinet.* or email-template string
 *   is [COPY PENDING]. Test it."). The email templates live under
 *   `kabinet.email`, so one walk of `uk.kabinet` covers both. Checked after
 *   the environment is identified, so it only ever turns production off:
 *   development and tests never reach this function's "on" (they take
 *   `kabinetAuthAvailability`'s development branch), and a Preview or an
 *   unidentified environment is already off for its own reason;
 * - only when the variables make a working configuration (`signInConfigOf`,
 *   `sign-in-env.ts`): both email routes configured (each reads its
 *   provider's own key, so no route ever pairs a provider with another's
 *   key), BETTER_AUTH_SECRET of at least 32 characters (IN-Q6) and
 *   BETTER_AUTH_URL equal to PRODUCTION_ORIGIN, the pinned apex. Magic links
 *   are built from BETTER_AUTH_URL, so a wrong one would email links to a
 *   host that isn't the site. The build and boot checks (IN-R2, Decision 1)
 *   read the same predicate, so a production deploy whose variables would
 *   leave this off never builds.
 *
 * **Wired** into `kabinetAuthAvailability`'s production branch
 * (`auth-route.ts`) by the commit that turns production sign-in on: "on"
 * there means `/api/auth`, `/api/kabinet` and `/kabinet` serve, and the
 * provider-backed senders (`production-mail.ts`) send. `no-self-serve-yet.test.ts`
 * (RG-Q9's successor, IN-Q4) pins the /prytulkam copy that had to land with it.
 */
export type ProductionSignIn =
  | {
      kind: "on";
      /**
       * One provider config per template (`emailRoutesOf`, EM-B6):
       * `production-mail.ts` passes `email.signIn` to `providerMagicLinkSender`
       * and `email.invite` to the invitation sender and `cachedBlockList`
       * (EM-T22).
       */
      email: EmailRoutes;
      secret: string;
      baseURL: string;
      /**
       * Signs both emails (`— {operator}`): `operatorDisplayName(env)`, so
       * `KABINET_OPERATOR_DISPLAY_NAME` (nominative) or the catalogue's
       * fallback. Never a reason to stay off (RS-Q2). `production-mail.ts`
       * hands it to `providerMagicLinkSender` (EM-T18); the invite takes the
       * same value from the RPC route's `operatorDisplayName`.
       */
      operatorName: string;
    }
  | {
      kind: "off";
      reason:
        | "preview_never_sends"
        | "environment_unidentified"
        | "provider_not_configured"
        | "provider_invalid"
        | "auth_config_missing"
        | "auth_secret_too_short"
        | "auth_url_not_production_origin"
        | "value_padded";
    }
  | { kind: "off"; reason: "copy_pending"; pending: readonly string[] };

/** Every `kabinet.*` string still `[COPY PENDING]`, by full path; empty once the copy has landed. */
export const kabinetPendingCopy = (): string[] => pendingCopyPaths(uk.kabinet, "kabinet");

/**
 * The one namespace whose pending strings may leave sign-in on (CG-Q1,
 * Oleksii, verbatim: "Pending strings only under
 * uk.kabinet.testShelterOnly.*"). A path prefix with its trailing dot, so a
 * sibling key that merely starts with the same letters is not exempt. Only
 * `features/kabinet/test-shelter-only/` may render the namespace
 * (`test-shelter-only.test.ts` scans for it), and that folder mounted only
 * for a shelter the K-Q17 allowlist let write, which PR 6 deleted.
 */
export const TEST_SHELTER_ONLY_PREFIX = "kabinet.testShelterOnly.";

/** The pending paths that keep production sign-in off under `policy`. */
export function signInBlockingCopy(
  pendingCopy: readonly string[],
  policy: ShelterWritePolicy,
): readonly string[] {
  if (!testShelterCopyExemptUnder(policy)) return pendingCopy;
  return pendingCopy.filter((path) => !path.startsWith(TEST_SHELTER_ONLY_PREFIX));
}

export function productionSignInOf(
  env: Readonly<Record<string, string | undefined>>,
  // Injectable so the other conditions are testable without waiting for the
  // copy; production always takes the default, the live catalogue.
  pendingCopy: readonly string[] = kabinetPendingCopy(),
  // The served write policy, the same constant the kabinet route and pages
  // pass, so the copy gate and the routes can never disagree about who may
  // write.
  writePolicy: ShelterWritePolicy = SHELTER_WRITE_POLICY,
): ProductionSignIn {
  if (env.VERCEL_ENV === "preview") return { kind: "off", reason: "preview_never_sends" };
  if (env.VERCEL_ENV !== "production") return { kind: "off", reason: "environment_unidentified" };
  const blocking = signInBlockingCopy(pendingCopy, writePolicy);
  if (blocking.length > 0) return { kind: "off", reason: "copy_pending", pending: blocking };
  const config = signInConfigOf(env);
  if (config.kind !== "configured") return { kind: "off", reason: config.kind };
  return {
    kind: "on",
    email: config.email,
    secret: config.secret,
    baseURL: config.baseURL,
    operatorName: operatorDisplayName(env),
  };
}
