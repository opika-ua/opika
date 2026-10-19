import type { ImageStorageClient, R2Config } from "@opika/db/image-pipeline/server";
import type { PhotoUploadConfig } from "./photo-upload-env";
import type { PhotoUploadLimiters } from "./rate-limits";

/**
 * Whether this request can store a photo, and where. A value on the request
 * context rather than something a handler reads from the environment, so the
 * tests hand the served router a capturing store and the route hands it R2.
 * `off` is answered with `PHOTO_UPLOADS_UNAVAILABLE` before anything else the
 * upload would do (P-Q10); it is the deployment config's own `off`, so the two
 * can't list different reasons.
 */
export type PhotoUploads =
  | Extract<PhotoUploadConfig, { kind: "off" }>
  | {
      kind: "on";
      storage: ImageStorageClient;
      limiters: PhotoUploadLimiters;
      /** How long checking and re-encoding one file may take (`PHOTO_PROCESSING_BUDGET_MS`). */
      processingBudgetMs: number;
    };

/**
 * The served route's budget for one upload's processing. The costliest file
 * an upload may be, 2000 × 2000 of photographic noise, measured 0.35
 * CPU-seconds on a development machine (2026-10-19), and every shape costs
 * about the same since variants are cropped before they are enlarged. Ten
 * seconds leaves a slower one-CPU function a wide margin and is still far
 * inside the function's own time limit, so an upload that runs past it
 * answers as a failed upload instead of holding the request until the
 * platform kills it.
 */
export const PHOTO_PROCESSING_BUDGET_MS = 10_000;

/**
 * What a caller that names no upload setup gets: off. Fail-closed, so a test
 * helper or a future caller that forgets the field can't store anything.
 */
export const PHOTO_UPLOADS_NOT_CONFIGURED: PhotoUploads = Object.freeze({
  kind: "off",
  because: "not_configured",
} as const);

/**
 * The R2 store, with the S3 client loaded and built on the first put rather
 * than when the route module loads: `next build` imports every route module,
 * and the AWS SDK has no business being evaluated there, nor on a request
 * that never uploads.
 */
export function lazyR2Storage(config: R2Config): ImageStorageClient {
  let client: Promise<ImageStorageClient> | undefined;
  return {
    async put(key, body, contentType) {
      client ??= import("@opika/db/image-pipeline/server").then((pipeline) =>
        pipeline.createR2Client(config),
      );
      await (await client).put(key, body, contentType);
    },
  };
}
