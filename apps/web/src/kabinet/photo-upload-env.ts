import type { R2Config } from "@opika/db/image-pipeline/server";
import { envValueOf, paddedValueMessage } from "../api/env-value";

/**
 * The deployed app's R2 write access, for `shelter.photos.add` only (P-Q10):
 * its own upload token, never the operator's onboarding token
 * (`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`, which stays on the operator's
 * machine), scoped in Cloudflare to the photo bucket (K-Q2: "token scoped
 * to the photo bucket only") with the narrowest permission that can write.
 * Whether that permission can also delete is Cloudflare's to say (on the
 * production probe list); the code never deletes either way. Account and bucket share
 * the onboarding script's names: the same bucket, so a kabinet upload and an
 * onboarded photo resolve through the same public URL.
 */
export const PHOTO_UPLOAD_ENV_NAMES = [
  "R2_ACCOUNT_ID",
  "R2_BUCKET_NAME",
  "R2_UPLOAD_ACCESS_KEY_ID",
  "R2_UPLOAD_SECRET_ACCESS_KEY",
] as const;

export type PhotoUploadConfig =
  | { kind: "on"; r2: R2Config }
  /**
   * `preview`: a Preview deployment never uploads, whatever its environment
   * holds (Oleksii's P-Q10 amendment: "Preview has no upload token, so
   * uploads are off in Preview"). `not_configured`: anywhere else without all
   * four values, which on a production deployment the build and boot checks
   * below refuse first, so in practice local dev and the harness.
   */
  | { kind: "off"; because: "preview" | "not_configured" };

type Env = Readonly<Record<string, string | undefined>>;

/** Read per request by the route, never at module scope (`requireEnv`'s build-time rule). */
export function photoUploadConfigOf(env: Env): PhotoUploadConfig {
  if (env.VERCEL_ENV === "preview") return { kind: "off", because: "preview" };
  const values = PHOTO_UPLOAD_ENV_NAMES.map((name) => envValueOf(env, name));
  const [accountId, bucketName, accessKeyId, secretAccessKey] = values;
  if (
    accountId?.kind !== "set" ||
    bucketName?.kind !== "set" ||
    accessKeyId?.kind !== "set" ||
    secretAccessKey?.kind !== "set"
  ) {
    return { kind: "off", because: "not_configured" };
  }
  return {
    kind: "on",
    r2: {
      accountId: accountId.value,
      bucketName: bucketName.value,
      accessKeyId: accessKeyId.value,
      secretAccessKey: secretAccessKey.value,
    },
  };
}

/**
 * What a production deployment refuses to build or boot without (P-Q10:
 * "Validated only when VERCEL_ENV === production"): all four values, none
 * padded. A production without them would answer every upload with
 * `PHOTO_UPLOADS_UNAVAILABLE`, silently, until a shelter tried. Names only,
 * never a value. Shared by `assertBuildEnv` and `validateEnv`, like the
 * other production secrets.
 */
export function photoUploadEnvProblem(env: Env): string | null {
  if (env.VERCEL_ENV !== "production") return null;
  const missing: string[] = [];
  const padded: string[] = [];
  for (const name of PHOTO_UPLOAD_ENV_NAMES) {
    const value = envValueOf(env, name);
    if (value.kind === "missing") missing.push(name);
    if (value.kind === "padded") padded.push(name);
  }
  if (padded.length > 0) return paddedValueMessage(padded);
  if (missing.length === 0) return null;
  return (
    `${missing.join(", ")} must be set on a production deployment (shelter photo uploads ` +
    "write to R2 with their own token, P-Q10) — set them in Vercel's Production " +
    "environment only, never Preview"
  );
}
