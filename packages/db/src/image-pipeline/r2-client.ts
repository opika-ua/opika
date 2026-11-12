import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PHOTO_SOURCE_MAX_BYTES, r2EndpointUrl } from "./variants";

/**
 * Thin on purpose, the one piece untestable without a bucket (`docs/h1-decisions.md`): a `put` that
 * only creates and a `get` that only reads (a crop's source). No delete, copy or lifecycle call
 * (K-Q2), held by `photo-pipeline-scan.test.ts`; Cloudflare recommends this S3 client for R2.
 */
// Immutable UUID keys: browsers keep 1 year; s-maxage 4 h because deletions (clean-up, erasure) do not purge the CDN.
export const IMAGE_CACHE_CONTROL = "public, max-age=31536000, s-maxage=14400, immutable";

export interface ImageStorageClient {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** The object's bytes; refuses one larger than `PHOTO_SOURCE_MAX_BYTES` without reading past it. */
  get(key: string): Promise<Buffer>;
}

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

/**
 * `NOT VERIFIED against a real bucket` - the constructed endpoint URL,
 * the credential shape R2 actually expects, and whether `PutObjectCommand`
 * succeeds against Cloudflare's S3-compatible surface are all asserted, not
 * tested. See `docs/h1-decisions.md`'s explicit list.
 *
 * `IfNoneMatch: "*"` on every put (P-Q11): the store refuses (412) a key that
 * already holds an object, so even a reused key could never overwrite a
 * photo. Keys are fresh random UUIDs (`animalPhotoStorageKeyFor`), so this
 * never fires in normal use; it is the second lock behind that one, enforced
 * by the store rather than by this code. Whether R2 honours the header is on
 * the production probe list (a one-off overwrite attempt, see
 * `docs/onboarding-a-shelter.md`), not verified here. No bucket lock instead
 * (Oleksii's P-Q11 amendment): it would also block the future takedown script
 * (DR-F3).
 */
export function createR2Client(config: R2Config): ImageStorageClient {
  const client = new S3Client({
    region: "auto",
    endpoint: r2EndpointUrl(config.accountId),
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucketName,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: IMAGE_CACHE_CONTROL,
          IfNoneMatch: "*",
        }),
      );
    },
    async get(key) {
      // One byte past the cap is asked for, so an object over it is told apart without reading it whole.
      const result = await client.send(
        new GetObjectCommand({
          Bucket: config.bucketName,
          Key: key,
          Range: `bytes=0-${PHOTO_SOURCE_MAX_BYTES}`,
        }),
      );
      // Neither message names the key: a source's key stays out of logs and error reports.
      if (result.Body === undefined) throw new Error("R2 returned no body");
      const bytes = await result.Body.transformToByteArray();
      if (bytes.byteLength > PHOTO_SOURCE_MAX_BYTES) {
        throw new Error(`The object is larger than ${PHOTO_SOURCE_MAX_BYTES} bytes`);
      }
      return Buffer.from(bytes);
    },
  };
}
