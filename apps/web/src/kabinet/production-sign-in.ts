import {
  type EmailProviderConfig,
  emailProviderConfigOf,
  productionOriginOf,
} from "./email-provider";

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
 *   to a host that isn't the site.
 *
 * **Not wired into `kabinetAuthAvailability` yet.** Wiring it is what turns
 * production sign-in on. That is the condition `no-self-serve-yet.test.ts`
 * (RG-Q9) watches, and the /prytulkam A1–A3 and B1 copy must be live first.
 * The build-time and boot-time checks that the five variables are present
 * (IN-R2, Decision 1) land with that wiring commit too.
 */
export type ProductionSignIn =
  | { kind: "on"; email: EmailProviderConfig; secret: string; baseURL: string }
  | {
      kind: "off";
      reason:
        | "preview_never_sends"
        | "environment_unidentified"
        | "provider_not_configured"
        | "provider_invalid"
        | "auth_config_missing"
        | "auth_url_not_production_origin";
    };

export function productionSignInOf(
  env: Readonly<Record<string, string | undefined>>,
): ProductionSignIn {
  if (env.VERCEL_ENV === "preview") return { kind: "off", reason: "preview_never_sends" };
  if (env.VERCEL_ENV !== "production") return { kind: "off", reason: "environment_unidentified" };
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
  return { kind: "on", email: email.config, secret, baseURL };
}
