import { envValueOf, paddedValueMessage } from "../api/env-value";
import {
  EMAIL_PROVIDERS,
  type EmailProvider,
  type EmailRoutes,
  emailRoutesOf,
  PROVIDER_KEY_NAMES,
  productionOriginOf,
} from "./email-provider";

/**
 * The environment half of production sign-in: what the variables say, with
 * no copy and no clock. `productionSignInOf` (`production-sign-in.ts`) adds
 * the deployment check and the copy gate on top of it; the build-time and
 * boot-time checks (`build-env.ts`, IN-R2 Decision 1) read it directly. One
 * predicate for all three, so a configuration the build accepts is exactly
 * one the running app turns on, and the two can't drift.
 *
 * Kept free of `@opika/i18n` and every other workspace package at runtime:
 * `next.config.ts` imports `build-env.ts`, which imports this, when Next
 * loads its config, and nothing there should pull in the catalogue.
 *
 * No result carries a value from the environment: only variable names and
 * reasons, so a key pasted into the wrong variable can't reach a log or a
 * build output.
 */
export type SignInConfig =
  | { kind: "configured"; email: EmailRoutes; secret: string; baseURL: string }
  | { kind: "provider_not_configured"; missing: readonly string[] }
  | { kind: "provider_invalid"; reason: string }
  | { kind: "auth_config_missing"; missing: readonly string[] }
  /** A space or a line break around a value (`envValueOf`): refused, never trimmed. */
  | { kind: "value_padded"; names: readonly string[] }
  | { kind: "auth_secret_too_short" }
  | { kind: "auth_url_not_production_origin" };

/**
 * `BETTER_AUTH_SECRET`'s floor (IN-Q6, accepted: "`BETTER_AUTH_SECRET` has a
 * 32-character floor, generated with `openssl rand -hex 32`"). The same 32 as
 * every other production secret (`build-env.ts`), written here rather than
 * imported from there, since `build-env.ts` imports this module.
 */
export const BETTER_AUTH_SECRET_MIN_LENGTH = 32;

/**
 * Every variable production sign-in reads, for this environment. Required:
 * the provider setting and its key, the From and Reply-To addresses, the
 * origin, and Better Auth's secret and URL. Optional: the sign-in route's
 * override and its key, when one is named. A provider name that isn't one
 * names no key (there is no variable for it). The From name is display text
 * with a fallback, not part of whether sign-in can work, and is not here.
 */
function signInVariablesOf(env: Readonly<Record<string, string | undefined>>): {
  required: string[];
  optional: string[];
} {
  const keyOf = (name: string): string[] => {
    const value = env[name]?.trim() ?? "";
    return (EMAIL_PROVIDERS as readonly string[]).includes(value)
      ? [PROVIDER_KEY_NAMES[value as EmailProvider]]
      : [];
  };
  const required = [
    "EMAIL_PROVIDER",
    ...keyOf("EMAIL_PROVIDER"),
    "EMAIL_FROM_ADDRESS",
    "EMAIL_REPLY_TO",
    "PRODUCTION_ORIGIN",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
  ];
  const optional =
    envValueOf(env, "EMAIL_SIGN_IN_PROVIDER").kind === "missing"
      ? []
      : ["EMAIL_SIGN_IN_PROVIDER", ...keyOf("EMAIL_SIGN_IN_PROVIDER")].filter(
          (name) => !required.includes(name),
        );
  return { required, optional };
}

/**
 * In the order `productionSignInOf` has always checked them, after one new
 * first step: no variable it reads may carry a space or a line break around
 * its value (`envValueOf`, WI-Q1's whitespace note). The build and boot checks
 * read the same rule through `signInEnvProblems`, so a padded value is refused
 * by all three rather than trimmed by one and used as is by another. Then the
 * email routes, then the auth secret and URL, then the URL against the pinned
 * origin.
 */
export function signInConfigOf(env: Readonly<Record<string, string | undefined>>): SignInConfig {
  const { required, optional } = signInVariablesOf(env);
  const padded = [...required, ...optional].filter(
    (name) => envValueOf(env, name).kind === "padded",
  );
  if (padded.length > 0) return { kind: "value_padded", names: padded };
  const email = emailRoutesOf(env);
  if (email.kind === "missing") return { kind: "provider_not_configured", missing: email.missing };
  if (email.kind === "invalid") return { kind: "provider_invalid", reason: email.reason };
  const secretValue = envValueOf(env, "BETTER_AUTH_SECRET");
  const urlValue = envValueOf(env, "BETTER_AUTH_URL");
  if (secretValue.kind !== "set" || urlValue.kind !== "set") {
    return {
      kind: "auth_config_missing",
      missing: [
        ...(secretValue.kind === "set" ? [] : ["BETTER_AUTH_SECRET"]),
        ...(urlValue.kind === "set" ? [] : ["BETTER_AUTH_URL"]),
      ],
    };
  }
  const secret = secretValue.value;
  const baseURL = urlValue.value;
  if (secret.length < BETTER_AUTH_SECRET_MIN_LENGTH) return { kind: "auth_secret_too_short" };
  const production = productionOriginOf(env.PRODUCTION_ORIGIN ?? "");
  const configured = productionOriginOf(baseURL);
  if (production === null || configured === null || configured.origin !== production.origin) {
    return { kind: "auth_url_not_production_origin" };
  }
  return { kind: "configured", email: email.routes, secret, baseURL };
}

/**
 * The sign-in variables a production build and a production boot require
 * (IN-R2, Decision 1, Oleksii, verbatim: "From the commit that turns sign-in
 * on: A production build fails if any of the five variables is missing, so a
 * bad deploy never goes live. Keep the runtime boot check as a second
 * guard."). Decision 1's five: `EMAIL_PROVIDER`, the selected provider's own
 * key (`PROVIDER_KEY_NAMES`), `EMAIL_FROM_ADDRESS`, `BETTER_AUTH_SECRET`,
 * `BETTER_AUTH_URL`. Plus `PRODUCTION_ORIGIN` and `EMAIL_REPLY_TO`, which
 * `productionSignInOf` also cannot be on without: whether those two join the
 * build check was left to this commit's Phase 0 (`docs/h2-next-prs.md`),
 * asked as inbox WI-Q1, and built here as recommended (they join).
 *
 * Missing names are listed together; once everything is present, the whole
 * configuration must be one the app turns on (`signInConfigOf`), so a value
 * that is present but wrong (a provider that isn't one, a From address off
 * `mail.<host>`, a URL that isn't the origin, a short secret) fails the build
 * too, rather than shipping a deploy whose sign-in is silently off (WI-Q1).
 *
 * `VERCEL_ENV === "production"` only: a Preview never signs in (IN-R2,
 * "Previews: refuse sign-in outright"), and a local or CI build sets no
 * `VERCEL_ENV`. The copy gate is deliberately not here: it is a property of
 * the code, not of the deployment, and `production-sign-in.test.ts` pins the
 * live catalogue in CI.
 */
export function signInEnvProblems(env: Readonly<Record<string, string | undefined>>): string[] {
  if (env.VERCEL_ENV !== "production") return [];
  const { required } = signInVariablesOf(env);
  const missing = required.filter((name) => envValueOf(env, name).kind === "missing");
  if (missing.length > 0) {
    return [
      `Missing required environment variable(s) for production sign-in: ${missing.join(", ")} — ` +
        "set them in Vercel's Production environment (docs/h2-next-prs.md, the switch-on list)",
    ];
  }
  const config = signInConfigOf(env);
  switch (config.kind) {
    case "configured":
      return [];
    case "value_padded":
      return [`Production sign-in is misconfigured: ${paddedValueMessage(config.names)}`];
    case "provider_invalid":
      return [`Production sign-in is misconfigured: ${config.reason}`];
    case "auth_secret_too_short":
      return [
        `BETTER_AUTH_SECRET must be at least ${BETTER_AUTH_SECRET_MIN_LENGTH} characters on a ` +
          "production deployment — generate with: openssl rand -hex 32",
      ];
    case "auth_url_not_production_origin":
      return [
        "BETTER_AUTH_URL must be PRODUCTION_ORIGIN (an https origin with no path); magic links " +
          "are built from it",
      ];
    // Unreachable once every name above is present; reported rather than
    // swallowed, so a future change to the routes can't pass silently.
    case "provider_not_configured":
    case "auth_config_missing":
      return [
        `Missing required environment variable(s) for production sign-in: ${config.missing.join(", ")}`,
      ];
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = config;
      return unreachable;
    }
  }
}
