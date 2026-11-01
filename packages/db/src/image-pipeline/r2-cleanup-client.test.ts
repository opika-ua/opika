import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createR2CleanupClient } from "./r2-cleanup-client";

/**
 * GDPR photo retention (`docs/gdpr-analysis.md`). Stubbed off the real
 * client's `send`, the same way `r2-client.test.ts` stubs `createR2Client` -
 * nothing here leaves the machine. Whether R2 honours pagination and batch
 * delete the way S3 does is the production probe's question (Oleksii asked
 * for a separate test-bucket run before this is called verified against a
 * real bucket), not this test's.
 */
afterEach(() => vi.restoreAllMocks());

const config = {
  accountId: "acct",
  accessKeyId: "id",
  secretAccessKey: "not-a-secret",
  bucketName: "photos",
};

describe("createR2CleanupClient.listObjectKeys", () => {
  it("collects every key across a paginated listing before returning", async () => {
    const sent: unknown[] = [];
    vi.spyOn(S3Client.prototype, "send").mockImplementation(async (command: unknown) => {
      sent.push(command);
      if (sent.length === 1) {
        return {
          Contents: [{ Key: "animals/a/card.webp" }],
          IsTruncated: true,
          NextContinuationToken: "p2",
        };
      }
      return { Contents: [{ Key: "animals/b/card.webp" }], IsTruncated: false };
    });

    const keys = await createR2CleanupClient(config).listObjectKeys("animals/");

    expect(keys).toEqual(["animals/a/card.webp", "animals/b/card.webp"]);
    expect(sent).toHaveLength(2);
    expect(sent.every((command) => command instanceof ListObjectsV2Command)).toBe(true);
    expect((sent[0] as ListObjectsV2Command).input).toMatchObject({
      Bucket: "photos",
      Prefix: "animals/",
      ContinuationToken: undefined,
    });
    expect((sent[1] as ListObjectsV2Command).input).toMatchObject({
      Bucket: "photos",
      Prefix: "animals/",
      ContinuationToken: "p2",
    });
  });

  it("is empty against an empty page, and skips an entry with no Key", async () => {
    vi.spyOn(S3Client.prototype, "send").mockResolvedValue({
      Contents: [{ Key: undefined }],
      IsTruncated: false,
    } as never);

    expect(await createR2CleanupClient(config).listObjectKeys("animals/")).toEqual([]);
  });
});

describe("createR2CleanupClient.deleteObjects", () => {
  it("sends one DeleteObjectsCommand for a batch at or under 1000 keys", async () => {
    const sent: unknown[] = [];
    vi.spyOn(S3Client.prototype, "send").mockImplementation(async (command: unknown) => {
      sent.push(command);
      return { Deleted: [{ Key: "a" }, { Key: "b" }], Errors: [] };
    });

    const result = await createR2CleanupClient(config).deleteObjects(["a", "b"]);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toBeInstanceOf(DeleteObjectsCommand);
    expect((sent[0] as DeleteObjectsCommand).input).toMatchObject({
      Bucket: "photos",
      Delete: { Objects: [{ Key: "a" }, { Key: "b" }], Quiet: false },
    });
    expect(result).toEqual({ deleted: ["a", "b"], failed: [] });
  });

  it("splits a batch over 1000 keys into multiple DeleteObjectsCommand calls", async () => {
    const keys = Array.from({ length: 1500 }, (_, i) => `k${i}`);
    const sent: DeleteObjectsCommand[] = [];
    vi.spyOn(S3Client.prototype, "send").mockImplementation(async (command: unknown) => {
      const cmd = command as DeleteObjectsCommand;
      sent.push(cmd);
      const deleted = (cmd.input.Delete?.Objects ?? []).map((o) => ({ Key: o.Key }));
      return { Deleted: deleted, Errors: [] };
    });

    const result = await createR2CleanupClient(config).deleteObjects(keys);

    expect(sent).toHaveLength(2);
    expect(sent[0]?.input.Delete?.Objects).toHaveLength(1000);
    expect(sent[1]?.input.Delete?.Objects).toHaveLength(500);
    expect(result.deleted).toHaveLength(1500);
    expect(result.failed).toEqual([]);
  });

  it("reports a per-key failure, never assuming success", async () => {
    vi.spyOn(S3Client.prototype, "send").mockResolvedValue({
      Deleted: [{ Key: "a" }],
      Errors: [{ Key: "b", Message: "AccessDenied" }],
    } as never);

    const result = await createR2CleanupClient(config).deleteObjects(["a", "b"]);

    expect(result).toEqual({ deleted: ["a"], failed: [{ key: "b", message: "AccessDenied" }] });
  });

  it("does nothing, and sends nothing, on an empty list", async () => {
    const send = vi.spyOn(S3Client.prototype, "send");

    const result = await createR2CleanupClient(config).deleteObjects([]);

    expect(send).not.toHaveBeenCalled();
    expect(result).toEqual({ deleted: [], failed: [] });
  });
});
