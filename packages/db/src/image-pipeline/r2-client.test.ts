import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createR2Client } from "./r2-client";
import { PHOTO_SOURCE_MAX_BYTES } from "./variants";

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
      CacheControl: "public, max-age=31536000, s-maxage=14400, immutable",
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

describe("createR2Client's get (crop frame)", () => {
  const body = (bytes: Uint8Array) => ({ Body: { transformToByteArray: async () => bytes } });

  it("sends one GetObjectCommand, ranged to one byte past the cap, and returns the bytes", async () => {
    const sent: unknown[] = [];
    vi.spyOn(S3Client.prototype, "send").mockImplementation(async (command: unknown) => {
      sent.push(command);
      return body(new Uint8Array([7, 8, 9]));
    });

    const bytes = await createR2Client(config).get("animals/a/b/source-c.webp");

    expect([...bytes]).toEqual([7, 8, 9]);
    expect(sent).toHaveLength(1);
    const [command] = sent;
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect((command as GetObjectCommand).input).toEqual({
      Bucket: "photos",
      Key: "animals/a/b/source-c.webp",
      Range: `bytes=0-${PHOTO_SOURCE_MAX_BYTES}`,
    });
  });

  it("refuses an object past the cap, and takes one at it", async () => {
    vi.spyOn(S3Client.prototype, "send").mockResolvedValueOnce(
      body(new Uint8Array(PHOTO_SOURCE_MAX_BYTES + 1)) as never,
    );
    const refused = createR2Client(config).get("animals/a/b/source-secret.webp");
    await expect(refused).rejects.toThrow(/larger than/);
    await expect(refused).rejects.not.toThrow(/source-secret/);
    vi.spyOn(S3Client.prototype, "send").mockResolvedValueOnce(
      body(new Uint8Array(PHOTO_SOURCE_MAX_BYTES)) as never,
    );
    expect((await createR2Client(config).get("k")).byteLength).toBe(PHOTO_SOURCE_MAX_BYTES);
  });

  it("a missing object (404) reaches the caller as a rejection", async () => {
    vi.spyOn(S3Client.prototype, "send").mockRejectedValue(
      Object.assign(new Error("NoSuchKey"), { $metadata: { httpStatusCode: 404 } }),
    );
    await expect(createR2Client(config).get("k")).rejects.toThrow("NoSuchKey");
  });
});
