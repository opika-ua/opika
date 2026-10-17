import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createR2Client } from "./r2-client";

/**
 * P-Q11: every put carries `IfNoneMatch: "*"`, so the store refuses to
 * overwrite an existing key. Captured off the real client's `send`, stubbed
 * so nothing leaves the machine; whether R2 honours the header is the
 * production probe's question, not this test's.
 */
afterEach(() => vi.restoreAllMocks());

const config = {
  accountId: "acct",
  accessKeyId: "id",
  secretAccessKey: "not-a-secret",
  bucketName: "photos",
};

describe("createR2Client", () => {
  it("sends one PutObjectCommand per put, with IfNoneMatch: *", async () => {
    const sent: unknown[] = [];
    vi.spyOn(S3Client.prototype, "send").mockImplementation(async (command: unknown) => {
      sent.push(command);
      return {};
    });

    await createR2Client(config).put("animals/a/b/card.webp", Buffer.from([1, 2, 3]), "image/webp");

    expect(sent).toHaveLength(1);
    const [command] = sent;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect((command as PutObjectCommand).input).toMatchObject({
      Bucket: "photos",
      Key: "animals/a/b/card.webp",
      ContentType: "image/webp",
      IfNoneMatch: "*",
    });
  });

  it("a refused put (the key exists: 412) reaches the caller as a rejection", async () => {
    vi.spyOn(S3Client.prototype, "send").mockRejectedValue(
      Object.assign(new Error("PreconditionFailed"), { $metadata: { httpStatusCode: 412 } }),
    );
    await expect(createR2Client(config).put("k", Buffer.from([1]), "image/webp")).rejects.toThrow(
      "PreconditionFailed",
    );
  });
});
