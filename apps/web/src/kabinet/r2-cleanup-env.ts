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
 * What a production deployment refuses to build or boot without, the same
 * shape as `photoUploadEnvProblem`: the job is on Vercel's schedule
 * regardless, so a production deployment missing credentials would run the
 * cron, find nothing configured, and refuse every call forever rather than
 * cleaning anything up — silently, until someone checks the logs.
 */
export function r2CleanupEnvProblem(env: Env): string | null {
  if (env.VERCEL_ENV !== "production") return null;
  const missing: string[] = [];
  const padded: string[] = [];
  for (const name of R2_CLEANUP_ENV_NAMES) {
    const value = envValueOf(env, name);
    if (value.kind === "missing") missing.push(name);
    if (value.kind === "padded") padded.push(name);
  }
  if (padded.length > 0) return paddedValueMessage(padded);
  if (missing.length === 0) return null;
  return (
    `${missing.join(", ")} must be set on a production deployment (the R2 photo clean-up job, ` +
    "GDPR photo retention) — set them in Vercel's Production environment only, never Preview"
  );
}
