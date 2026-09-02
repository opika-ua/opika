import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { r2EndpointUrl } from "./variants";

/**
 * Deliberately thin — `put`, nothing else. Every decision that isn't "make
 * an authenticated HTTP call to R2" (which variants to generate, what key
 * to use, what URL the browser fetches) lives in `variants.ts` and
 * `generate-variants.ts`, both pure and fully tested. This file is the one
 * piece that can't be exercised without a real bucket, so it stays small on
 * purpose — see `docs/h1-decisions.md`, "what stays unverified until a real
 * bucket exists."
 *
 * `@aws-sdk/client-s3`: R2 is S3-API-compatible by design (Cloudflare's own
 * docs recommend this exact client), and there's no lighter-weight official
 * alternative — this is the standard way to talk to R2 from Node.
 */
export interface ImageStorageClient {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
}

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

/**
 * `NOT VERIFIED against a real bucket` — the constructed endpoint URL,
 * the credential shape R2 actually expects, and whether `PutObjectCommand`
 * succeeds against Cloudflare's S3-compatible surface are all asserted, not
 * tested. See `docs/h1-decisions.md`'s explicit list.
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
        }),
      );
    },
  };
}
