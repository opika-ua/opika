import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { r2EndpointUrl } from "./variants";

/**
 * GDPR photo retention (`docs/gdpr-analysis.md`). The one named exception
 * to "no code path that overwrites or deletes an existing object" (K-Q2,
 * `r2-client.ts`'s own doc comment) — this file is the exception, not a
 * second place that one is weakened. It lists and deletes; it never puts.
 *
 * A separate client, a separate config type, and its own credentials
 * (`R2_CLEANUP_ACCESS_KEY_ID`/`R2_CLEANUP_SECRET_ACCESS_KEY`, read only by
 * `r2-cleanup.ts`'s CLI and `apps/web/src/kabinet/r2-cleanup-env.ts`'s
 * cron wiring): the app's own upload token (`R2_UPLOAD_*`) never gains
 * delete rights just because this file exists beside it. Cloudflare's own
 * token UI has no delete-only scope — "Object Read & Write" is the finest
 * grain that includes delete, and it also permits `PutObject` — so the real
 * safety boundary is this file's own source, not the token's permission
 * scope: `apps/web/src/kabinet/photo-pipeline-scan.test.ts`'s own structural
 * scan asserts this file's only two SDK commands are
 * `ListObjectsV2Command`/`DeleteObjectsCommand`, and that nothing else in
 * the repo imports either.
 */
export interface R2CleanupClient {
  /** Every real object key under `prefix`, every page collected before returning. */
  listObjectKeys(prefix: string): Promise<string[]>;
  /** Batches of up to 1000 (the batch-delete API's own per-call limit); reports per-key success, never assumes it. */
  deleteObjects(
    keys: readonly string[],
  ): Promise<{ deleted: string[]; failed: { key: string; message: string }[] }>;
}

export interface R2CleanupConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

const DELETE_BATCH_SIZE = 1000;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** `NOT VERIFIED against a real bucket` — see `r2-client.ts`'s own disclosure; the same applies here until a real run against a test bucket happens. */
export function createR2CleanupClient(config: R2CleanupConfig): R2CleanupClient {
  const client = new S3Client({
    region: "auto",
    endpoint: r2EndpointUrl(config.accountId),
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return {
    async listObjectKeys(prefix) {
      const keys: string[] = [];
      let continuationToken: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket: config.bucketName,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        );
        for (const object of page.Contents ?? []) {
          if (object.Key !== undefined) keys.push(object.Key);
        }
        continuationToken = page.IsTruncated === true ? page.NextContinuationToken : undefined;
      } while (continuationToken !== undefined);
      return keys;
    },

    async deleteObjects(keys) {
      const deleted: string[] = [];
      const failed: { key: string; message: string }[] = [];
      for (const batch of chunk(keys, DELETE_BATCH_SIZE)) {
        if (batch.length === 0) continue;
        const result = await client.send(
          new DeleteObjectsCommand({
            Bucket: config.bucketName,
            Delete: { Objects: batch.map((key) => ({ Key: key })), Quiet: false },
          }),
        );
        for (const ok of result.Deleted ?? []) {
          if (ok.Key !== undefined) deleted.push(ok.Key);
        }
        for (const err of result.Errors ?? []) {
          if (err.Key !== undefined) {
            failed.push({ key: err.Key, message: err.Message ?? "unknown error" });
          }
        }
      }
      return { deleted, failed };
    },
  };
}
