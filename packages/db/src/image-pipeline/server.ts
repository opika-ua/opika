/**
 * Server-only exports — `sharp` native bindings, `node:fs`, and
 * `@aws-sdk/client-s3` all live behind this file, never behind `./index.ts`
 * (see its own comment for why the split exists). Two consumers:
 * `onboard-shelter.ts` (a Node CLI script) and, since PR 3, the kabinet's
 * upload handler in `apps/web` (`kabinet/handlers/photos.ts`), which loads
 * this module with a dynamic `import()` inside the request so sharp and the S3
 * client are never pulled into a page bundle or evaluated by `next build`.
 * Importing it statically from any `apps/web` module that a client
 * component can reach would break the build (Turbopack refuses sharp's native
 * bindings in a client bundle). A third consumer since the GDPR photo
 * retention job: the `/api/cron/r2-cleanup` route (`kabinet/r2-cleanup-cron.ts`),
 * the same dynamic-import shape, for `createR2CleanupClient`/`runR2Cleanup`.
 */

export type { R2CleanupReport } from "../r2-cleanup-run";
export { runR2Cleanup } from "../r2-cleanup-run";
export { generateVariants } from "./generate-variants";
export { prepareUploadedPhoto } from "./prepare-uploaded-photo";
export type { R2CleanupClient, R2CleanupConfig } from "./r2-cleanup-client";
export { createR2CleanupClient } from "./r2-cleanup-client";
export type { ImageStorageClient, R2Config } from "./r2-client";
export { createR2Client } from "./r2-client";
export type { LocalPhotoDimensions } from "./resolve-local-photo";
export { resolveLocalPhotoPath, validateLocalPhoto } from "./resolve-local-photo";
export { storePhotoVariants, uploadAnimalPhoto } from "./upload-animal-photo";
export { animalPhotoStorageKeyFor } from "./variants";
