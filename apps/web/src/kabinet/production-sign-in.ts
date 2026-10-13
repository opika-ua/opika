import { type EmailProviderConfig, emailProviderConfigOf } from "./email-provider";

/**
 * When production sign-in may be on (IN-Q6, Oleksii: "Q6: accepted, plus:
 * previews never send real email (provider key unset in Preview → auth
 * off). Test that BETTER_AUTH_URL equals the production origin."):
 *
 * - on exactly when the email provider is configured and BETTER_AUTH_SECRET
 *   and BETTER_AUTH_URL are set;
 * - never on a Vercel Preview. This is stricter than "the key is unset
 *   there": a key set in Preview by mistake still sends nothing;
 * - on a Vercel production deployment, BETTER_AUTH_URL must be the
 *   production origin, `https://` + `VERCEL_PROJECT_PRODUCTION_URL`
 *   (Vercel's own "production domain name of the project", set at runtime,
 *   without the scheme). Magic links are built from BETTER_AUTH_URL, so a
 *   wrong one would email links to a host that isn't the site.
 *
 * **Not wired into `kabinetAuthAvailability` yet.** Wiring it is what turns
 * production sign-in on. That is the condition `no-self-serve-yet.test.ts`
 * (RG-Q9) watches, and the /prytulkam A1–A3 and B1 copy must be live first.
 */
export type ProductionSignIn =
  | { kind: "on"; email: EmailProviderConfig; secret: string; baseURL: string }
  | {
      kind: "off";
      reason:
        | "preview_never_sends"
        | "provider_not_configured"
        | "provider_invalid"
        | "auth_config_missing"
        | "auth_url_not_production_origin";
    };

const withoutTrailingSlash = (url: string) => url.replace(/\/+$/, "");

export function productionSignInOf(
  env: Readonly<Record<string, string | undefined>>,
): ProductionSignIn {
  if (env.VERCEL_ENV === "preview") return { kind: "off", reason: "preview_never_sends" };
  const email = emailProviderConfigOf(env);
  if (email.kind === "missing") return { kind: "off", reason: "provider_not_configured" };
  if (email.kind === "invalid") return { kind: "off", reason: "provider_invalid" };
  const secret = env.BETTER_AUTH_SECRET;
  const baseURL = env.BETTER_AUTH_URL;
  if (!secret || !baseURL) return { kind: "off", reason: "auth_config_missing" };
  if (env.VERCEL_ENV === "production") {
    const production = env.VERCEL_PROJECT_PRODUCTION_URL;
    if (
      !production ||
      withoutTrailingSlash(baseURL) !== `https://${withoutTrailingSlash(production)}`
    ) {
      return { kind: "off", reason: "auth_url_not_production_origin" };
    }
  }
  return { kind: "on", email: email.config, secret, baseURL };
}
