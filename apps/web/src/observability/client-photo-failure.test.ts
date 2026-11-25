import * as Sentry from "@sentry/nextjs";
import { afterEach, describe, expect, it } from "vitest";
import type { PhotoFailureDiagnostics } from "../features/kabinet/photos/compress-photo";
import {
  compressReporting,
  loadSentryForReport,
  type PhotoFailure,
  reportPhotoFailure,
} from "../features/kabinet/photos/report-photo-failure";
import { initClientSentry } from "./client";
import { recordingTransport } from "./fake-transport";

/** A failed photo compression, through the real browser SDK and scrubber to the transport. */

const DSN = "https://publickey@o1.ingest.de.sentry.io/4500000000000001";
const NAME = "IMG_20261124_secret.jpg";
// The applicant's own case (iPhone 8 Plus, Instagram's in-app browser) and Samsung Internet.
const INSTAGRAM_IOS_16 =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_7_12 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/20H364 Instagram 456.0.0.27.89 (iPhone10,5; iOS 16_7_12; uk_UA; uk; scale=3.00; 1242x2208; 750441263; IABMV/1)";
const SAMSUNG =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/31.0 Chrome/148.0.0.0 Mobile Safari/537.36";

const diagnostics: PhotoFailureDiagnostics = {
  attempts: [
    { step: "bitmap_options", error: "TypeError: Type error" },
    { step: "bitmap_plain", error: "InvalidStateError: The object is in an invalid state." },
    { step: "img_element", error: `EncodingError: ${NAME} could not be decoded` },
  ],
  type: "image/jpeg",
  size: 48123456,
  header: { format: "jpeg", width: 4032, height: 3024, orientation: 6 },
  decoded: { width: 1008, height: 756 },
};

type SentEvent = {
  level?: string;
  message?: string;
  tags?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
};

const eventsOf = (sent: ReturnType<typeof recordingTransport>) =>
  sent.envelopes.flatMap(([, items]) => items.map(([, payload]) => payload as SentEvent));

const setUserAgent = (value: string) =>
  Object.defineProperty(navigator, "userAgent", { value, configurable: true });

/** The real loader; the SDK is already up, so it is not started again. Each failure is a different file. */
async function reported(userAgent: string, failures = 1) {
  setUserAgent(userAgent);
  const sent = recordingTransport();
  initClientSentry(DSN, { transport: sent.transport });
  const file = new File(["not a photo"], NAME, { type: "image/jpeg" });
  const report = (failure: PhotoFailure, name?: string) =>
    reportPhotoFailure(failure, name, { dsn: DSN, load: loadSentryForReport });
  const sends: Promise<void>[] = [];
  for (let i = 0; i < failures; i += 1) {
    const size = diagnostics.size + i;
    await compressReporting(
      async () => ({ kind: "unreadable", diagnostics: { ...diagnostics, size } }),
      file,
      (failure, name) => sends.push(report(failure, name)),
    );
  }
  await Promise.all(sends);
  await Sentry.flush(2000);
  return sent;
}

afterEach(async () => {
  await Sentry.close(2000);
  Reflect.deleteProperty(navigator, "userAgent");
});

describe("a failed photo compression as Sentry receives it", () => {
  it("carries the step, every error, type, size, header and decoded size, and the coarse UA", async () => {
    const sent = await reported(INSTAGRAM_IOS_16);
    const events = eventsOf(sent);
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event?.level).toBe("warning");
    expect(event?.message).toBe("photo compression failed");
    expect(event?.tags).toEqual({
      "photo.outcome": "unreadable",
      "photo.step": "img_element",
      "photo.type": "image/jpeg",
      "photo.format": "jpeg",
    });
    expect(event?.extra).toEqual({
      attempts: [
        { step: "bitmap_options", error: "TypeError: Type error" },
        { step: "bitmap_plain", error: "InvalidStateError: The object is in an invalid state." },
        { step: "img_element", error: "EncodingError: [file] could not be decoded" },
      ],
      type: "image/jpeg",
      size: 48123456,
      header: { format: "jpeg", width: 4032, height: 3024 },
      decoded: { width: 1008, height: 756 },
    });
    // Instagram's WebKit has no Safari token: the browser is unknown, the system is iOS 16.
    expect(event?.contexts).toEqual({
      browser: { name: "unknown" },
      os: { name: "iOS", version: "16" },
    });
  });

  it("holds no file name, no orientation and nothing of the raw UA", async () => {
    const text = (await reported(INSTAGRAM_IOS_16)).json();
    for (const part of [
      NAME,
      "secret",
      "orientation",
      "Instagram",
      "iPhone10,5",
      "16_7_12",
      "uk_UA",
      "1242x2208",
    ]) {
      expect(text, `leaked: ${part}`).not.toContain(part);
    }
  });

  it("Samsung Internet is told apart from Chrome", async () => {
    const [event] = eventsOf(await reported(SAMSUNG));
    expect(event?.contexts).toEqual({
      browser: { name: "Samsung Internet", version: "31" },
      os: { name: "Android", version: "10" },
    });
  });

  it("three photos failing in a row arrive as three events, not one", async () => {
    expect(eventsOf(await reported(SAMSUNG, 3))).toHaveLength(3);
  });
});
