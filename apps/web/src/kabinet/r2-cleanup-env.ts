import { envValueOf, paddedValueMessage } from "../api/env-value";
import type { R2CleanupCronConfig } from "./r2-cleanup-cron";

/**
 * GDPR photo retention (`docs/gdpr-analysis.md`). The scheduled job's own R2
 * credentials, never the upload token (`R2_UPLOAD_*`) or the onboarding
 * script's (`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`) — `r2-cleanup-client.ts`'s
 * own doc comment. Account and bucket are shared with every other R2 caller
 * (the same bucket, so a deleted key is the same object everywhere).
 *
 * Enabled by the env vars' own presence (a reversible decision taken while
 * building this, not asked): no separate feature flag, the same shape
 * `photoUploadConfigOf` already uses for the upload token.
 */
export const R2_CLEANUP_ENV_NAMES = [
  "R2_ACCOUNT_ID",
  "R2_BUCKET_NAME",
  "R2_CLEANUP_ACCESS_KEY_ID",
  "R2_CLEANUP_SECRET_ACCESS_KEY",
] as const;

type Env = Readonly<Record<string, string | undefined>>;

export function r2CleanupConfigOf(env: Env): R2CleanupCronConfig | undefined {
  const values = R2_CLEANUP_ENV_NAMES.map((name) => envValueOf(env, name));
  const [accountId, bucketName, accessKeyId, secretAccessKey] = values;
  if (
    accountId?.kind !== "set" ||
    bucketName?.kind !== "set" ||
    accessKeyId?.kind !== "set" ||
    secretAccessKey?.kind !== "set"
  ) {
    return undefined;
  }
  return {
    accountId: accountId.value,
    bucketName: bucketName.value,
    accessKeyId: accessKeyId.value,
    secretAccessKey: secretAccessKey.value,
  };
}

/**
 * What a production deployment refuses to build or boot over, the same
 * shape as `photoUploadEnvProblem` **except for one deliberate difference**
 * (Tier 1 review, PR #200, blocker 2): the job is "enabled by the env vars'
 * own presence" — unlike the upload token, which production can't function
 * without at all, this job is allowed to simply be off. So this never
 * refuses on all four being absent (the job is disabled, not broken); it
 * refuses only a state that can't mean "disabled on purpose":
 *   - a padded value, anywhere among the four;
 *   - exactly one of `R2_CLEANUP_ACCESS_KEY_ID`/`R2_CLEANUP_SECRET_ACCESS_KEY`
 *     set without the other (a half-entered credential, not "off");
 *   - either cleanup-specific credential set while `R2_ACCOUNT_ID` or
 *     `R2_BUCKET_NAME` is missing (those two are normally already required
 *     by the upload token, `photoUploadEnvProblem`, but refuse here too in
 *     case a deployment somehow has the cleanup credential without them).
 * Setting the credentials is therefore the one and only switch that turns
 * the job on — never a separate feature flag, and never something a build
 * can refuse its way into forcing.
 */
export function r2CleanupEnvProblem(env: Env): string | null {
  if (env.VERCEL_ENV !== "production") return null;
  const values = R2_CLEANUP_ENV_NAMES.map((name) => ({ name, value: envValueOf(env, name) }));
  const padded = values.filter(({ value }) => value.kind === "padded").map(({ name }) => name);
  if (padded.length > 0) return paddedValueMessage(padded);

  const accessKeyId = envValueOf(env, "R2_CLEANUP_ACCESS_KEY_ID");
  const secretAccessKey = envValueOf(env, "R2_CLEANUP_SECRET_ACCESS_KEY");
  const cleanupCredentialAttempted = accessKeyId.kind === "set" || secretAccessKey.kind === "set";
  if (!cleanupCredentialAttempted) return null;

  const missing = values.filter(({ value }) => value.kind === "missing").map(({ name }) => name);
  if (missing.length === 0) return null;
  return (
    `${missing.join(", ")} must be set alongside R2_CLEANUP_ACCESS_KEY_ID/R2_CLEANUP_SECRET_ACCESS_KEY ` +
    "once either is set (the R2 photo clean-up job, GDPR photo retention) — set them in Vercel's " +
    "Production environment only, never Preview, or unset both cleanup credentials to leave the job off"
  );
}
