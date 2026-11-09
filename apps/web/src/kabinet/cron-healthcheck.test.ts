import { describe, expect, it, vi } from "vitest";
import { HEALTHCHECK_TIMEOUT_MS, pingHealthcheck } from "./cron-healthcheck";

const URL_OK = "https://hc.example/ping/slug";
const okFetch = () => vi.fn(async (..._args: Parameters<typeof fetch>) => new Response("OK"));

describe("pingHealthcheck", () => {
  it("pings the URL itself on success and URL/fail on failure", async () => {
    const fetchImpl = okFetch();
    await pingHealthcheck(URL_OK, "ok", fetchImpl);
    await pingHealthcheck(`${URL_OK}/`, "fail", fetchImpl);
    expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual([URL_OK, `${URL_OK}/fail`]);
  });

  it.each([undefined, "", "   "])("is a no-op with the URL %j", async (url) => {
    const fetchImpl = okFetch();
    await pingHealthcheck(url, "ok", fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("swallows a network error and logs nothing, the URL included", async () => {
    const spies = [
      vi.spyOn(console, "error"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "info"),
    ];
    const fetchImpl = vi.fn(async () => {
      throw new Error(`boom ${URL_OK}`);
    });
    await expect(pingHealthcheck(URL_OK, "ok", fetchImpl)).resolves.toBeUndefined();
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });

  it("gives up after a short timeout instead of holding the cron", async () => {
    let signal: AbortSignal | null | undefined;
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal;
      return new Response("OK");
    });
    await pingHealthcheck(URL_OK, "ok", fetchImpl as unknown as typeof fetch);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(HEALTHCHECK_TIMEOUT_MS).toBeLessThanOrEqual(5_000);
  });

  it("aborts a hanging fetch at its timeout and resolves without failing the cron", async () => {
    vi.useFakeTimers();
    try {
      let aborted = false;
      const hanging = vi.fn(
        (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              aborted = true;
              reject(new DOMException("aborted", "TimeoutError"));
            });
          }),
      );
      const done = pingHealthcheck(URL_OK, "ok", hanging as unknown as typeof fetch);
      await vi.advanceTimersByTimeAsync(HEALTHCHECK_TIMEOUT_MS + 1);
      await expect(done).resolves.toBeUndefined();
      expect(aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
