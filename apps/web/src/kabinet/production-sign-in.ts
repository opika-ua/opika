import { pendingCopyPaths, uk } from "@opika/i18n";
import {
  type EmailProviderConfig,
  emailProviderConfigOf,
  productionOriginOf,
} from "./email-provider";
import { operatorDisplayName } from "./operator";

/**
 * When production sign-in may be on (IN-Q6, Oleksii: "Q6: accepted, plus:
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
 * - only when the email provider is configured and BETTER_AUTH_SECRET and
 *   BETTER_AUTH_URL are set;
 * - only when BETTER_AUTH_URL is PRODUCTION_ORIGIN, the pinned apex. Magic
 *   links are built from BETTER_AUTH_URL, so a wrong one would email links
 *   to a host that isn't the site;
 * - only when no `kabinet.*` string, the email templates included, is still
 *   `[COPY PENDING]` (Oleksii, 2026-10-14, answer 7, verbatim: "Yes.
 *   Production sign-in stays off while any kabinet.* or email-template string
 *   is [COPY PENDING]. Test it."). The email templates live under
 *   `kabinet.email`, so one walk of `uk.kabinet` covers both. Checked after
 *   the environment is identified, so it only ever turns production off:
 *   development and tests never reach this function's "on" (they take
 *   `kabinetAuthAvailability`'s development branch), and a Preview or an
 *   unidentified environment is already off for its own reason.
 *
 * **Not wired into `kabinetAuthAvailability` yet.** Wiring it is what turns
 * production sign-in on. That is the condition `no-self-serve-yet.test.ts`
 * (RG-Q9) watches, and the /prytulkam A1–A3 and B1 copy must be live first.
 * The build-time and boot-time checks that the five variables are present
 * (IN-R2, Decision 1) land with that wiring commit too.
 */
export type ProductionSignIn =
  | {
      kind: "on";
      email: EmailProviderConfig;
      secret: string;
      baseURL: string;
      /**
       * Signs both emails (`— {operator}`): `operatorDisplayName(env)`, so
       * `KABINET_OPERATOR_DISPLAY_NAME` (nominative) or the catalogue's
       * fallback. Never a reason to stay off (RS-Q2). The wiring commit hands
       * it to `providerMagicLinkSender`; the invite takes the same value from
       * the RPC route's `operatorDisplayName`.
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
        | "auth_url_not_production_origin";
    }
  | { kind: "off"; reason: "copy_pending"; pending: readonly string[] };

/** Every `kabinet.*` string still `[COPY PENDING]`, by full path; empty once the copy has landed. */
export const kabinetPendingCopy = (): string[] => pendingCopyPaths(uk.kabinet, "kabinet");

export function productionSignInOf(
  env: Readonly<Record<string, string | undefined>>,
  // Injectable so the other conditions are testable without waiting for the
  // copy; production always takes the default, the live catalogue.
  pendingCopy: readonly string[] = kabinetPendingCopy(),
): ProductionSignIn {
  if (env.VERCEL_ENV === "preview") return { kind: "off", reason: "preview_never_sends" };
  if (env.VERCEL_ENV !== "production") return { kind: "off", reason: "environment_unidentified" };
  if (pendingCopy.length > 0) return { kind: "off", reason: "copy_pending", pending: pendingCopy };
  const email = emailProviderConfigOf(env);
  if (email.kind === "missing") return { kind: "off", reason: "provider_not_configured" };
  if (email.kind === "invalid") return { kind: "off", reason: "provider_invalid" };
  const secret = env.BETTER_AUTH_SECRET;
  const baseURL = env.BETTER_AUTH_URL;
  if (!secret || !baseURL) return { kind: "off", reason: "auth_config_missing" };
  const production = productionOriginOf(env.PRODUCTION_ORIGIN ?? "");
  const configured = productionOriginOf(baseURL);
  if (production === null || configured === null || configured.origin !== production.origin) {
    return { kind: "off", reason: "auth_url_not_production_origin" };
  }
  return {
    kind: "on",
    email: email.config,
    secret,
    baseURL,
    operatorName: operatorDisplayName(env),
  };
}
