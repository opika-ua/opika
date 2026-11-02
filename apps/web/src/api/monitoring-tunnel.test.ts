import { describe, expect, it, vi } from "vitest";
import {
  handleMonitoringTunnel,
  MONITORING_MAX_BODY_BYTES,
  type MonitoringTunnelDeps,
} from "./monitoring-tunnel";
import { inMemoryRateLimiter } from "./rate-limit";

const DSN = "https://publickey@o1.ingest.de.sentry.io/4500000000000001";
const NOW = new Date("2026-11-01T12:00:00Z");

const event = (extra: Record<string, unknown> = {}) => ({
  event_id: "e1",
  exception: { values: [{ type: "Error", value: "boom for olena@example.ua" }] },
  request: { url: "https://opika.example/tvaryny?gate=SECRET", cookies: { a: "b" } },
  user: { email: "olena@example.ua" },
  ...extra,
});

function envelope(
  items: { type: string; payload: unknown }[],
  header: Record<string, unknown> = { event_id: "e1", dsn: DSN, sent_at: "2026-11-01T12:00:00Z" },
): string {
  return [
    JSON.stringify(header),
    ...items.flatMap(({ type, payload }) => {
      const body = typeof payload === "string" ? payload : JSON.stringify(payload);
      return [JSON.stringify({ type, length: Buffer.byteLength(body) }), body];
    }),
  ].join("\n");
}

function post(body: string, init: RequestInit = {}): Request {
  return new Request("https://opika.example/api/monitoring", {
    method: "POST",
    headers: {
      "content-type": "text/plain;charset=UTF-8",
      cookie: "opika_session=abc123",
      authorization: "Bearer tok",
      "x-forwarded-for": "203.0.113.7",
      "x-vercel-forwarded-for": "203.0.113.7",
      "user-agent": "Mozilla/5.0",
      ...(init.headers as Record<string, string> | undefined),
    },
    body,
  });
}

function deps(over: Partial<MonitoringTunnelDeps> = {}) {
  const forward = vi.fn(async () => new Response("{}", { status: 200 }));
  const all: MonitoringTunnelDeps = {
    dsn: DSN,
    ipKey: "ip:test",
    limiter: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 100 }),
    now: NOW,
    forward: forward as unknown as typeof fetch,
    ...over,
  };
  return { all, forward };
}

describe("method, DSN and content type", () => {
  it.each(["GET", "PUT", "DELETE", "PATCH"])("answers 405 to %s", async (method) => {
    const { all, forward } = deps();
    const response = await handleMonitoringTunnel(
      new Request("https://opika.example/api/monitoring", { method }),
      all,
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(forward).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    "",
    "   ",
    "not a dsn",
    "http://k@o1.ingest.de.sentry.io/1",
    "https://o1.sentry.io/1",
  ])("answers 404 when the DSN is %j", async (dsn) => {
    const { all, forward } = deps({ dsn });
    const response = await handleMonitoringTunnel(
      post(envelope([{ type: "event", payload: event() }])),
      all,
    );
    expect(response.status).toBe(404);
    expect(forward).not.toHaveBeenCalled();
  });

  it("refuses other content types with 415", async () => {
    const { all, forward } = deps();
    const response = await handleMonitoringTunnel(
      post(envelope([{ type: "event", payload: event() }]), {
        headers: { "content-type": "application/json" },
      }),
      all,
    );
    expect(response.status).toBe(415);
    expect(forward).not.toHaveBeenCalled();
  });

  it.each(["text/plain", "text/plain;charset=UTF-8", "application/x-sentry-envelope"])(
    "accepts %s",
    async (type) => {
      const { all, forward } = deps();
      const response = await handleMonitoringTunnel(
        post(envelope([{ type: "event", payload: event() }]), {
          headers: { "content-type": type },
        }),
        all,
      );
      expect(response.status).toBe(204);
      expect(forward).toHaveBeenCalledTimes(1);
    },
  );
});

describe("the envelope must name exactly our DSN", () => {
  it("forwards when host and project are ours, whatever the public key says", async () => {
    const { all, forward } = deps();
    const claimed = "https://otherkey@o1.ingest.de.sentry.io/4500000000000001";
    const response = await handleMonitoringTunnel(
      post(envelope([{ type: "event", payload: event() }], { dsn: claimed })),
      all,
    );
    expect(response.status).toBe(204);
    expect(forward).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["another host", "https://publickey@evil.example/4500000000000001"],
    ["a suffix host", "https://publickey@o1.ingest.de.sentry.io.evil.example/4500000000000001"],
    ["another project", "https://publickey@o1.ingest.de.sentry.io/4500000000000002"],
    ["a project prefix", "https://publickey@o1.ingest.de.sentry.io/450000000000000"],
    ["plain http", "http://publickey@o1.ingest.de.sentry.io/4500000000000001"],
    ["a port", "https://publickey@o1.ingest.de.sentry.io:8443/4500000000000001"],
    ["no dsn", undefined],
  ])("refuses %s with 400 and forwards nothing", async (_label, claimed) => {
    const { all, forward } = deps();
    const header = claimed === undefined ? { event_id: "e1" } : { dsn: claimed };
    const response = await handleMonitoringTunnel(
      post(envelope([{ type: "event", payload: event() }], header)),
      all,
    );
    expect(response.status).toBe(400);
    expect(forward).not.toHaveBeenCalled();
  });

  it("refuses a body that is not an envelope", async () => {
    const { all, forward } = deps();
    const response = await handleMonitoringTunnel(post("not json at all"), all);
    expect(response.status).toBe(400);
    expect(forward).not.toHaveBeenCalled();
  });
});

describe("size", () => {
  it("refuses a declared oversize body without forwarding", async () => {
    const { all, forward } = deps();
    const big = envelope([
      { type: "event", payload: event({ pad: "x".repeat(MONITORING_MAX_BODY_BYTES) }) },
    ]);
    const response = await handleMonitoringTunnel(post(big), all);
    expect(response.status).toBe(413);
    expect(forward).not.toHaveBeenCalled();
  });

  it("refuses an oversize body that declares no length", async () => {
    const { all, forward } = deps();
    const chunk = new TextEncoder().encode("x".repeat(1024));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 80; i++) controller.enqueue(chunk);
        controller.close();
      },
    });
    const request = new Request("https://opika.example/api/monitoring", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    const response = await handleMonitoringTunnel(request, all);
    expect(response.status).toBe(413);
    expect(forward).not.toHaveBeenCalled();
  });
});

describe("rate limit", () => {
  it("answers 429 with Retry-After once the caller's budget is spent, per key", async () => {
    const limiter = inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 2 });
    const { all, forward } = deps({ limiter });
    const send = (ipKey: string) =>
      handleMonitoringTunnel(post(envelope([{ type: "event", payload: event() }])), {
        ...all,
        ipKey,
      });
    expect((await send("ip:a")).status).toBe(204);
    expect((await send("ip:a")).status).toBe(204);
    const refused = await send("ip:a");
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect((await send("ip:b")).status).toBe(204);
    expect(forward).toHaveBeenCalledTimes(3);
  });
});

describe("what is forwarded", () => {
  async function forwarded(items: { type: string; payload: unknown }[]) {
    const { all, forward } = deps();
    const response = await handleMonitoringTunnel(post(envelope(items)), all);
    const call = forward.mock.calls[0] as unknown as [string, RequestInit] | undefined;
    return { response, call, forward };
  }

  it("goes to the URL built from our DSN only, with the body and nothing of the client's", async () => {
    const { response, call } = await forwarded([{ type: "event", payload: event() }]);
    expect(response.status).toBe(204);
    expect(call?.[0]).toBe("https://o1.ingest.de.sentry.io/api/4500000000000001/envelope/");
    const init = call?.[1] ?? {};
    expect(init.method).toBe("POST");
    expect(init.credentials).toBeUndefined();
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.redirect).toBe("error");
    expect(Object.keys(init.headers as Record<string, string>)).toEqual(["content-type"]);
    const sent = JSON.stringify(init);
    for (const clientValue of ["opika_session", "abc123", "Bearer", "203.0.113.7", "Mozilla"]) {
      expect(sent, clientValue).not.toContain(clientValue);
    }
  });

  it("scrubs the event it forwards and rebuilds the envelope header", async () => {
    const { call } = await forwarded([{ type: "event", payload: event() }]);
    const body = String(call?.[1]?.body);
    expect(body).not.toContain("olena@example.ua");
    expect(body).not.toContain("SECRET");
    expect(body).not.toContain("cookies");
    const [header, itemHeader, payload] = body.split("\n");
    expect(Object.keys(JSON.parse(header ?? "")).sort()).toEqual(["dsn", "event_id", "sent_at"]);
    expect(JSON.parse(itemHeader ?? "").length).toBe(Buffer.byteLength(payload ?? ""));
  });

  it("drops every item that is not an error event", async () => {
    const { response, forward } = await forwarded([
      { type: "transaction", payload: { type: "transaction" } },
      { type: "span", payload: { items: [] } },
      { type: "replay_event", payload: {} },
      { type: "session", payload: {} },
      { type: "attachment", payload: "raw bytes" },
      { type: "client_report", payload: {} },
    ]);
    expect(response.status).toBe(204);
    expect(forward).not.toHaveBeenCalled();
  });

  it("forwards only the event of a mixed envelope", async () => {
    const { call } = await forwarded([
      { type: "attachment", payload: "raw bytes" },
      { type: "event", payload: event() },
      { type: "transaction", payload: { type: "transaction" } },
    ]);
    const body = String(call?.[1]?.body);
    expect(body).not.toContain("raw bytes");
    expect(body).not.toContain("transaction");
    expect(body.split("\n")).toHaveLength(3);
  });

  it("forwards at most one event per envelope", async () => {
    const { call } = await forwarded([
      { type: "event", payload: event({ message: "first" }) },
      { type: "event", payload: event({ message: "second" }) },
    ]);
    const body = String(call?.[1]?.body);
    expect(body).toContain("first");
    expect(body).not.toContain("second");
    expect(body.split("\n")).toHaveLength(3);
  });

  it("answers an opaque 204 even when Sentry is unreachable", async () => {
    const { all } = deps({
      forward: vi.fn(async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch,
    });
    const response = await handleMonitoringTunnel(
      post(envelope([{ type: "event", payload: event() }])),
      all,
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("answers the same opaque 204 whatever Sentry replied", async () => {
    const { all } = deps({
      forward: vi.fn(
        async () => new Response("rate limited", { status: 429 }),
      ) as unknown as typeof fetch,
    });
    const response = await handleMonitoringTunnel(
      post(envelope([{ type: "event", payload: event() }])),
      all,
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });
});
