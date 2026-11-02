// @vitest-environment node
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import * as Sentry from "@sentry/nextjs";
import { afterEach, describe, expect, it } from "vitest";
import { recordingTransport } from "./fake-transport";
import { initServerSentry } from "./server";

const DSN = "https://publickey@o1.ingest.de.sentry.io/4500000000000001";

/** Every value the privacy promise says never leaves. A hit anywhere in an envelope fails the test. */
const SECRETS = [
  "opika_session=abc123",
  "abc123",
  "Bearer",
  "tok-SECRET-token",
  "GATEVALUE",
  "olena@example.ua",
  "+380 50 123 45 67",
  "0501234567",
  "LOCALVAR-CONTACT",
  "203.0.113.7",
  "shelterSnapshot",
];

function throwsWithContactLocal(): never {
  // The variable a frame-variables setting would send.
  const contact = "0501234567 LOCALVAR-CONTACT";
  throw new Error(`Failed to load ${contact.length} chars`);
}

function caught(): Error {
  try {
    throwsWithContactLocal();
  } catch (error) {
    return error as Error;
  }
  throw new Error("unreachable");
}

const BODY = JSON.stringify({
  email: "olena@example.ua",
  phone: "+380 50 123 45 67",
  shelterSnapshot: { contacts: "0501234567" },
});
const HEADERS = {
  cookie: "opika_session=abc123",
  authorization: "Bearer tok-SECRET-token",
  "x-forwarded-for": "203.0.113.7",
  "content-type": "application/json",
  "user-agent": "Mozilla/5.0 (Linux; Android 14) Chrome/130",
};

let server: Server | undefined;
afterEach(async () => {
  await Sentry.close(2000);
  await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
  server = undefined;
});

/** A real HTTP request into a real server whose handler throws and reports, as the app does. */
async function realRequestThatErrors(): Promise<void> {
  server = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      Sentry.captureException(caught());
      res.end("ok");
    });
  });
  await new Promise<void>((ready) => server?.listen(0, "127.0.0.1", ready));
  const { port } = server.address() as AddressInfo;
  await fetch(
    `http://127.0.0.1:${port}/api/rpc/animals/reveal?gate=GATEVALUE&email=olena@example.ua`,
    {
      method: "POST",
      headers: HEADERS,
      body: BODY,
    },
  );
  await Sentry.flush(2000);
}

let upstream: Server | undefined;
afterEach(async () => {
  await new Promise<void>((done) => (upstream ? upstream.close(() => done()) : done()));
  upstream = undefined;
});

const TRACE_ID = "0123456789abcdef0123456789abcdef";
const SAMPLED_PARENT = {
  "sentry-trace": `${TRACE_ID}-0123456789abcdef-1`,
  baggage: `sentry-trace_id=${TRACE_ID},sentry-sampled=true,sentry-sample_rate=1,sentry-public_key=attacker`,
};

/**
 * A request whose caller already decided to trace it (a sampled `sentry-trace` and `baggage`), into a
 * server that makes spans, calls an upstream service and reports an error. Returns the headers the
 * upstream call carried.
 */
async function sampledRequestWithUpstreamCall(): Promise<Record<string, unknown>> {
  let seen: Record<string, unknown> = {};
  upstream = createServer((req, res) => {
    seen = { ...req.headers };
    res.end("ok");
  });
  await new Promise<void>((ready) => upstream?.listen(0, "127.0.0.1", ready));
  const upstreamPort = (upstream.address() as AddressInfo).port;
  server = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      void Sentry.startSpan({ name: "handler" }, async () => {
        await Sentry.startSpan({ name: "db" }, async () => undefined);
        await fetch(`http://127.0.0.1:${upstreamPort}/neon?token=SECRETTOKEN`);
        Sentry.captureException(caught());
      }).then(() => res.end("ok"));
    });
  });
  await new Promise<void>((ready) => server?.listen(0, "127.0.0.1", ready));
  const { port } = server.address() as AddressInfo;
  await fetch(`http://127.0.0.1:${port}/tvaryny?gate=GATEVALUE`, {
    headers: { ...HEADERS, ...SAMPLED_PARENT },
  });
  await Sentry.flush(2000);
  return seen;
}

/** What a careless caller could still put on a scope: the full config must hold even then. */
async function hostileScope(): Promise<void> {
  await Sentry.withIsolationScope(async (scope) => {
    scope.setSDKProcessingMetadata({
      normalizedRequest: {
        url: "https://opika.example/api/rpc/animals/reveal?gate=GATEVALUE&email=olena@example.ua",
        method: "POST",
        headers: HEADERS,
        cookies: { opika_session: "abc123" },
        query_string: "gate=GATEVALUE&email=olena@example.ua",
        data: BODY,
      },
    });
    scope.setUser({ email: "olena@example.ua", ip_address: "203.0.113.7" });
    scope.setExtra("body", BODY);
    Sentry.captureException(caught());
    Sentry.captureRequestError(
      caught(),
      {
        path: "/api/rpc/animals/reveal?gate=GATEVALUE&email=olena@example.ua",
        method: "POST",
        headers: HEADERS,
      },
      { routerKind: "App Router", routePath: "/api/rpc/[...rpc]", routeType: "route" },
    );
    await Sentry.flush(2000);
  });
}

function eventsOf(sent: ReturnType<typeof recordingTransport>): Record<string, unknown>[] {
  return sent.envelopes.flatMap(([, items]) =>
    items.map(([, payload]) => payload as Record<string, unknown>),
  );
}

function expectNothingPrivate(sent: ReturnType<typeof recordingTransport>): void {
  const text = sent.json();
  for (const secret of SECRETS) expect(text, `leaked: ${secret}`).not.toContain(secret);
  for (const event of eventsOf(sent)) {
    expect(event.user).toBeUndefined();
    const request = (event.request ?? {}) as Record<string, unknown>;
    expect(request.cookies).toBeUndefined();
    expect(request.data).toBeUndefined();
    expect(request.query_string).toBeUndefined();
    expect(JSON.stringify(event.exception ?? {})).not.toContain('"vars"');
  }
}

describe("the SDK's own collection, scrubber off (the first layer by itself)", () => {
  it("sends nothing private from a real request that errors", async () => {
    const sent = recordingTransport();
    initServerSentry(DSN, { transport: sent.transport, unscrubbed: true });
    await realRequestThatErrors();
    expect(eventsOf(sent).length).toBeGreaterThan(0);
    expectNothingPrivate(sent);
  });

  it("sends no request headers at all, UA included", async () => {
    const sent = recordingTransport();
    initServerSentry(DSN, { transport: sent.transport, unscrubbed: true });
    await realRequestThatErrors();
    for (const event of eventsOf(sent)) {
      expect((event.request as Record<string, unknown> | undefined)?.headers).toBeUndefined();
    }
  });
});

describe("the full config (SDK collection and scrubber)", () => {
  it("sends nothing private from a real request that errors", async () => {
    const sent = recordingTransport();
    initServerSentry(DSN, { transport: sent.transport });
    await realRequestThatErrors();
    expect(eventsOf(sent).length).toBeGreaterThan(0);
    expectNothingPrivate(sent);
  });

  it("sends nothing private even when user, extra and request data are put on the scope", async () => {
    const sent = recordingTransport();
    initServerSentry(DSN, { transport: sent.transport });
    await hostileScope();
    expect(eventsOf(sent).length).toBeGreaterThan(0);
    expectNothingPrivate(sent);
  });

  it("still reports the error type and where in the code it happened", async () => {
    const sent = recordingTransport();
    initServerSentry(DSN, { transport: sent.transport });
    await realRequestThatErrors();
    expect(sent.json()).toContain('"type":"Error"');
    expect(sent.json()).toContain("throwsWithContactLocal");
  });

  it("never sends a transaction, span or session, however much work is traced", async () => {
    const sent = recordingTransport();
    initServerSentry(DSN, { transport: sent.transport });
    await Sentry.startSpan({ name: "GET /tvaryny" }, async () => {
      await Sentry.startSpan({ name: "child" }, async () => undefined);
    });
    await realRequestThatErrors();
    await hostileScope();
    expect(sent.itemTypes().length).toBeGreaterThan(0);
    expect(sent.itemTypes().every((type) => type === "event")).toBe(true);
  });

  it("sends no span or transaction for a request that arrives already sampled, and still reports the error", async () => {
    const sent = recordingTransport();
    initServerSentry(DSN, { transport: sent.transport });
    await sampledRequestWithUpstreamCall();
    expect(sent.itemTypes()).toContain("event");
    expect(sent.itemTypes().every((type) => type === "event")).toBe(true);
    expectNothingPrivate(sent);
  });

  it("adds no sentry-trace or baggage header to outgoing requests", async () => {
    const sent = recordingTransport();
    initServerSentry(DSN, { transport: sent.transport });
    const headers = await sampledRequestWithUpstreamCall();
    expect(Object.keys(headers).length).toBeGreaterThan(0);
    expect(headers).not.toHaveProperty("sentry-trace");
    expect(headers).not.toHaveProperty("baggage");
    expect(headers).not.toHaveProperty("traceparent");
  });

  it("runs none of the integrations that send sessions, process data or local variables", () => {
    const sent = recordingTransport();
    initServerSentry(DSN, { transport: sent.transport });
    const names =
      Sentry.getClient()
        ?.getOptions()
        .integrations.map((i) => i.name) ?? [];
    expect(names.length).toBeGreaterThan(0);
    for (const forbidden of [
      "ProcessSession",
      "LocalVariables",
      "LocalVariablesAsync",
      "Console",
    ]) {
      expect(names).not.toContain(forbidden);
    }
  });
});
