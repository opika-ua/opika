import { describe, expect, it, vi } from "vitest";
import type { CompressedPhoto, PhotoFailureDiagnostics } from "./compress-photo";
import {
  compressReporting,
  PHOTO_FAILURE_MESSAGE,
  type PhotoFailure,
  photoFailureEvent,
  reportPhotoFailure,
} from "./report-photo-failure";

const DSN = "https://publickey@o1.ingest.de.sentry.io/4500000000000001";
const NAME = "IMG_20261124_secret.jpg";

const diagnostics: PhotoFailureDiagnostics = {
  attempts: [
    { step: "bitmap_options", error: "InvalidStateError: The object is in an invalid state." },
    { step: "img_element", error: `EncodingError: could not decode ${NAME}` },
  ],
  type: "image/jpeg",
  size: 48123456,
  header: { format: "jpeg", width: 4032, height: 3024, orientation: 6 },
  decoded: null,
};

describe("the event for a failed compression", () => {
  it("unreadable: the last step, every attempt, type, size, header format and size, decoded size", () => {
    const event = photoFailureEvent({ kind: "unreadable", diagnostics }, NAME);
    expect(event).toEqual({
      level: "warning",
      tags: {
        "photo.outcome": "unreadable",
        "photo.step": "img_element",
        "photo.type": "image/jpeg",
        "photo.format": "jpeg",
      },
      extra: {
        attempts: [
          {
            step: "bitmap_options",
            error: "InvalidStateError: The object is in an invalid state.",
          },
          { step: "img_element", error: "EncodingError: could not decode [file]" },
        ],
        type: "image/jpeg",
        size: 48123456,
        header: { format: "jpeg", width: 4032, height: 3024 },
        decoded: null,
      },
      fingerprint: expect.any(Array),
    });
    expect(JSON.stringify(event)).not.toContain("orientation");
    expect(JSON.stringify(event)).not.toContain(NAME);
  });

  it("not_readable: step «read», what the read threw, type and size; the file name cut out", () => {
    const error = new DOMException(
      `The I/O read operation failed for ${NAME}.`,
      "NotReadableError",
    );
    const event = photoFailureEvent(
      { kind: "not_readable", error, type: "image/png", size: 1660000 },
      NAME,
    );
    expect(event).toEqual({
      level: "warning",
      tags: {
        "photo.outcome": "not_readable",
        "photo.step": "read",
        "photo.type": "image/png",
        "photo.format": "none",
      },
      extra: {
        attempts: [
          { step: "read", error: "NotReadableError: The I/O read operation failed for [file]." },
        ],
        type: "image/png",
        size: 1660000,
      },
      fingerprint: ["photo", "not_readable", "read", "image/png", "1660000"],
    });
  });

  it("too_large is reported; unsupported_format (a HEIC this browser can't decode) is not", () => {
    expect(photoFailureEvent({ kind: "too_large", diagnostics })?.tags["photo.outcome"]).toBe(
      "too_large",
    );
    expect(photoFailureEvent({ kind: "unsupported_format", diagnostics })).toBeNull();
  });

  it("a refusal with no diagnostics still reports, with nothing to say about the file", () => {
    expect(photoFailureEvent({ kind: "unreadable" })).toMatchObject({
      tags: { "photo.step": "none", "photo.type": "none", "photo.format": "none" },
      extra: { attempts: [], size: null, header: null, decoded: null },
    });
  });

  it("a throw is unreadable with the error's name and message, cut at 200 chars", () => {
    const error = new TypeError(`x${"y".repeat(400)}`);
    const event = photoFailureEvent({ kind: "threw", error, type: "", size: 10 });
    expect(event?.tags).toMatchObject({ "photo.outcome": "unreadable", "photo.step": "threw" });
    const attempts = event?.extra.attempts as { error: string }[];
    expect(attempts[0]?.error.startsWith("TypeError: xyyy")).toBe(true);
    expect(attempts[0]?.error).toHaveLength(200);
    const odd = photoFailureEvent({ kind: "threw", error: "boom", type: "", size: 1 });
    expect(odd?.extra.attempts).toEqual([{ step: "threw", error: "non-error throw (string)" }]);
  });

  it("different files failing the same way stay apart for Dedupe; the same file twice does not", () => {
    const a = photoFailureEvent({ kind: "unreadable", diagnostics });
    const b = photoFailureEvent({ kind: "unreadable", diagnostics: { ...diagnostics, size: 1 } });
    expect(a?.fingerprint).not.toEqual(b?.fingerprint);
    expect(photoFailureEvent({ kind: "unreadable", diagnostics })?.fingerprint).toEqual(
      a?.fingerprint,
    );
  });
});

describe("reportPhotoFailure", () => {
  const capturing = () => {
    const captureMessage = vi.fn();
    const load = vi.fn(async () => ({ captureMessage }));
    return { captureMessage, load };
  };

  it("sends one warning through the loaded SDK", async () => {
    const { captureMessage, load } = capturing();
    await reportPhotoFailure({ kind: "unreadable", diagnostics }, NAME, { dsn: DSN, load });
    expect(load).toHaveBeenCalledWith(DSN);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage.mock.calls[0]?.[0]).toBe(PHOTO_FAILURE_MESSAGE);
  });

  it("without a DSN, or for unsupported_format, loads nothing", async () => {
    const { load } = capturing();
    await reportPhotoFailure({ kind: "unreadable", diagnostics }, NAME, { dsn: undefined, load });
    await reportPhotoFailure({ kind: "unsupported_format" }, NAME, { dsn: DSN, load });
    expect(load).not.toHaveBeenCalled();
  });

  it("a blocked load or a send that throws never reaches the caller", async () => {
    const failure: PhotoFailure = { kind: "too_large", diagnostics };
    const blocked = vi.fn(async () => {
      throw new Error("blocked");
    });
    await expect(
      reportPhotoFailure(failure, NAME, { dsn: DSN, load: blocked }),
    ).resolves.toBeUndefined();
    const throwing = async () => ({
      captureMessage: () => {
        throw new Error("send failed");
      },
    });
    await expect(
      reportPhotoFailure(failure, NAME, { dsn: DSN, load: throwing }),
    ).resolves.toBeUndefined();
  });
});

describe("compressReporting", () => {
  const file = new File(["x"], NAME, { type: "image/jpeg" });

  it("an ok photo is not reported", async () => {
    const report = vi.fn();
    const ok: CompressedPhoto = { kind: "ok", file: new Blob(["j"]), width: 1, height: 1 };
    expect(await compressReporting(async () => ok, file, report)).toBe(ok);
    expect(report).not.toHaveBeenCalled();
  });

  it("a refusal is reported as it came, with the file's name for redaction only", async () => {
    const report = vi.fn();
    const refused: CompressedPhoto = { kind: "unreadable", diagnostics };
    expect(await compressReporting(async () => refused, file, report)).toBe(refused);
    expect(report).toHaveBeenCalledWith(refused, NAME);
  });

  it("a compressor that throws is unreadable for the person and reported with what it threw", async () => {
    const report = vi.fn();
    const error = new Error("decoder crashed");
    const result = await compressReporting(
      async () => {
        throw error;
      },
      file,
      report,
    );
    expect(result).toEqual({ kind: "unreadable" });
    expect(report).toHaveBeenCalledWith(
      { kind: "threw", error, type: "image/jpeg", size: 1 },
      NAME,
    );
  });
});
