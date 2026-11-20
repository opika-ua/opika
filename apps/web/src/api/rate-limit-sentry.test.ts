// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { recordingTransport as RecordingTransport } from "../observability/fake-transport";

const DSN = "https://publickey@o1.ingest.de.sentry.io/4500000000000001";
const IP = "203.0.113.7";
const KEY = `ip:${IP}`;

afterEach(async () => {
  const Sentry = await import("@sentry/nextjs");
  await Sentry.close(2000);
  vi.doUnmock("@upstash/ratelimit");
  vi.doUnmock("@upstash/redis");
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.resetModules();
});

/** A real `upstashRateLimiter` on a store that fails as given, with the server Sentry setup on a recording transport. */
async function unreachableLimiter(fail: "error" | "timeout") {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", DSN);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const limit =
    fail === "error"
      ? vi.fn().mockRejectedValue(new Error(`ECONNREFUSED for ${KEY} from ${IP} olena@example.ua`))
      : vi.fn().mockResolvedValue({ success: true, reason: "timeout", reset: 0 });
  vi.doMock("@upstash/ratelimit", () => ({
    Ratelimit: Object.assign(
      vi.fn(function RatelimitMock() {
        return { limit };
      }),
      { slidingWindow: vi.fn() },
    ),
  }));
  const { recordingTransport } = await import("../observability/fake-transport");
  const { initServerSentry } = await import("../observability/server");
  const sent: ReturnType<typeof RecordingTransport> = recordingTransport();
  initServerSentry(DSN, { transport: sent.transport });
  const { upstashRateLimiter } = await import("./rate-limit");
  const limiter = upstashRateLimiter({
    redis: {} as never,
    windowMs: 60_000,
    maxRequests: 10,
    prefix: "opika-reveal-ip-ratelimit-production",
    onUnavailable: "deny",
  });
  return { limiter, sent };
}

async function settled(): Promise<void> {
  await vi.dynamicImportSettled();
  const Sentry = await import("@sentry/nextjs");
  await Sentry.flush(2000);
}

function events(sent: ReturnType<typeof RecordingTransport>): Record<string, unknown>[] {
  return sent.envelopes.flatMap(([, items]) =>
    items.filter(([h]) => h.type === "event").map(([, p]) => p as Record<string, unknown>),
  );
}

describe("the «rate limiter unreachable» Sentry event", () => {
  it.each(["error", "timeout"] as const)(
    "on a store %s, carries the limiter's prefix and the outcome, and no key, address or error text",
    async (fail) => {
      const { limiter, sent } = await unreachableLimiter(fail);
      await limiter.check(KEY, new Date());
      await settled();
      const [event, ...rest] = events(sent);
      expect(rest).toEqual([]);
      expect(event?.message).toBe("rate limiter unreachable");
      expect(event?.level).toBe("warning");
      expect(event?.tags).toEqual({
        limiter: "opika-reveal-ip-ratelimit-production",
        outcome: fail,
      });
      expect(event?.user).toBeUndefined();
      expect(event?.extra).toBeUndefined();
      const text = sent.json();
      for (const secret of [IP, KEY, "ECONNREFUSED", "olena@example.ua"]) {
        expect(text, `leaked: ${secret}`).not.toContain(secret);
      }
    },
  );

  it("fires once inside a minute and again after it, from one call site as in production", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { limiter, sent } = await unreachableLimiter("error");
    // One call site for every check, so the SDK's Dedupe sees identical stacks, as it would live.
    const checkAfter = async (ms: number) => {
      vi.setSystemTime(Date.now() + ms);
      await limiter.check(KEY, new Date());
      await settled();
    };
    for (const ms of [0, 30_000, 29_999]) await checkAfter(ms);
    expect(events(sent)).toHaveLength(1);
    await checkAfter(1);
    expect(events(sent)).toHaveLength(2);
    await checkAfter(60_000);
    expect(events(sent)).toHaveLength(3);
    for (const event of events(sent)) expect(event.fingerprint).toBeUndefined();
  });

  it("sends nothing without a DSN", async () => {
    const { sent } = await unreachableLimiter("error");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    const { reportUnreachableToSentry } = await import("./rate-limit-unreachable");
    await reportUnreachableToSentry({
      event: "rate_limiter_unreachable",
      limiter: "api",
      reason: "error",
      suppressed: 0,
    });
    await settled();
    expect(events(sent)).toEqual([]);
  });
});
