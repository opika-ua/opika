import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { r2EndpointUrl } from "./variants";

/**
 * Deliberately thin — `put`, nothing else, and that `put` only ever creates.
 * Every decision that isn't "make an authenticated HTTP call to R2" (which
 * variants to generate, what key to use, what URL the browser fetches) lives
 * in `variants.ts`, `generate-variants.ts` and `prepare-uploaded-photo.ts`,
 * all pure and fully tested. This file is the one piece that can't be
 * exercised without a real bucket, so it stays small on purpose — see
 * `docs/h1-decisions.md`, "what stays unverified until a real bucket exists."
 *
 * No delete, copy or lifecycle call exists here (K-Q2: "no code path that
 * overwrites or deletes an existing object") — a source scan in
 * `apps/web/src/kabinet/photo-pipeline-scan.test.ts` keeps it that way, and
 * keeps this and `r2-cleanup-client.ts` the only two files that import the
 * S3 client. That second file is the one named exception to K-Q2's "no
 * delete" half, for the GDPR photo-retention job (`docs/gdpr-analysis.md`)
 * — never a reason to weaken the rule here, which still holds. Two callers
 * since PR 3: the onboarding script, from an operator's machine, and the
 * kabinet's upload (`shelter.photos.add`), from the deployed app, with its
 * own token (P-Q10).
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
          IfNoneMatch: "*",
        }),
      );
    },
  };
}
