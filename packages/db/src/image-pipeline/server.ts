/**
 * Server-only exports — `sharp` native bindings, `node:fs`, and
 * `@aws-sdk/client-s3` all live behind this file. Never import this from
 * `apps/web`; `onboard-shelter.ts` (a Node CLI script, never bundled for
 * the browser) is this file's only consumer. See `./index.ts`'s own
 * comment for why the split exists.
 */
export { generateVariants } from "./generate-variants";
export type { ImageStorageClient, R2Config } from "./r2-client";
export { createR2Client } from "./r2-client";
export type { LocalPhotoDimensions } from "./resolve-local-photo";
export { resolveLocalPhotoPath, validateLocalPhoto } from "./resolve-local-photo";
export { uploadAnimalPhoto } from "./upload-animal-photo";
