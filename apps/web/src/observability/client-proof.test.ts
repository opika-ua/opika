import * as Sentry from "@sentry/nextjs";
import { afterEach, describe, expect, it } from "vitest";
import { initClientSentry } from "./client";
import { recordingTransport } from "./fake-transport";

const DSN = "https://publickey@o1.ingest.de.sentry.io/4500000000000001";

const SECRETS = [
  "opika_session=abc123",
  "abc123",
  "GATEVALUE",
  "olena@example.ua",
  "+380 50 123 45 67",
  "0501234567",
  "LOCALVAR-CONTACT",
];

function pageWithPrivateState(): void {
  // happy-dom's window: a gate query, a session cookie, a form full of contacts.
  window.history.replaceState(null, "", "/tvaryny/gortaty?gate=GATEVALUE&email=olena@example.ua");
  // biome-ignore lint/suspicious/noDocumentCookie: the test needs a real cookie on the page.
  document.cookie = "opika_session=abc123";
  document.body.innerHTML = `<form><input id="e" value="olena@example.ua"><input id="p" value="+380 50 123 45 67"></form>`;
}

function throwsWithContactLocal(): never {
  const contact = "0501234567 LOCALVAR-CONTACT";
  throw new Error(`Failed to render ${contact.length} chars`);
}

afterEach(async () => {
  await Sentry.close(2000);
  // biome-ignore lint/suspicious/noDocumentCookie: clears the test cookie.
  document.cookie = "opika_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
});

async function errorsOnThePage(): Promise<void> {
  pageWithPrivateState();
  Sentry.setUser({ email: "olena@example.ua" });
  try {
    throwsWithContactLocal();
  } catch (error) {
    Sentry.captureException(error);
  }
  // A real uncaught error reaches the SDK through its global handler.
  window.dispatchEvent(
    new ErrorEvent("error", { error: new Error("uncaught"), message: "uncaught" }),
  );
  await Sentry.flush(2000);
}

describe.each([
  ["the SDK's own collection, scrubber off", true],
  ["the full config", false],
])("a browser error: %s", (_label, unscrubbed) => {
  it("carries none of the contact, cookie, query, form or variable data", async () => {
    const sent = recordingTransport();
    initClientSentry(DSN, { transport: sent.transport, unscrubbed });
    await errorsOnThePage();
    expect(sent.envelopes.length).toBeGreaterThan(0);
    const text = sent.json();
    for (const secret of SECRETS) {
      // `setUser` is an explicit app call, which this app never makes; only the full config
      // is required to drop it.
      if (unscrubbed && secret === "olena@example.ua") continue;
      expect(text, `leaked: ${secret}`).not.toContain(secret);
    }
    expect(text).toContain('"type":"Error"');
  });

  it("reports the page address without its query string", async () => {
    const sent = recordingTransport();
    initClientSentry(DSN, { transport: sent.transport, unscrubbed });
    await errorsOnThePage();
    const urls = sent.envelopes
      .flatMap(([, items]) => items.map(([, payload]) => payload as { request?: { url?: string } }))
      .map((event) => event.request?.url);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url).toMatch(/^https?:\/\/[^?#]*\/tvaryny\/gortaty$/);
  });
});

describe("the browser SDK as configured", () => {
  it("sends only error events: no transaction, span, session or replay", async () => {
    const sent = recordingTransport();
    initClientSentry(DSN, { transport: sent.transport });
    await Sentry.startSpan({ name: "pageload" }, async () => undefined);
    await errorsOnThePage();
    expect(sent.itemTypes().length).toBeGreaterThan(0);
    expect(sent.itemTypes().every((type) => type === "event")).toBe(true);
  });

  it("runs only the integrations listed, with no tracing, replay or feedback among them", () => {
    const client = initClientSentry(DSN, { transport: recordingTransport().transport });
    const names = Object.keys(client?.getOptions().integrations ?? {}).length;
    const installed =
      Sentry.getClient()
        ?.getOptions()
        .integrations.map((i) => i.name) ?? [];
    expect(names).toBeGreaterThan(0);
    expect(installed.sort()).toEqual(
      ["CoarseUserAgent", "Dedupe", "GlobalHandlers", "HttpContext", "LinkedErrors"].sort(),
    );
  });

  it("posts to its own tunnel, not to Sentry", () => {
    initClientSentry(DSN, { transport: recordingTransport().transport });
    expect(Sentry.getClient()?.getOptions().tunnel).toBe("/api/monitoring");
  });
});

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Mobile/15E148 Safari/604.1";
const ODD_UA = "SECRETAGENT/1.2.3 (device model X)";

function setNavigator(key: "userAgent" | "userAgentData", value: unknown): void {
  Object.defineProperty(navigator, key, { value, configurable: true });
}

async function oneError(): Promise<ReturnType<typeof recordingTransport>> {
  const sent = recordingTransport();
  initClientSentry(DSN, { transport: sent.transport });
  Sentry.captureException(new Error("boom"));
  await Sentry.flush(2000);
  return sent;
}

const contextsOf = (sent: ReturnType<typeof recordingTransport>) =>
  sent.envelopes.flatMap(([, items]) =>
    items.map(([, payload]) => (payload as { contexts?: Record<string, unknown> }).contexts),
  );

describe("browser and system context in a browser error", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "userAgent");
    Reflect.deleteProperty(navigator, "userAgentData");
  });

  it("from the UA string: family and major version only, no raw string, minor version or model", async () => {
    setNavigator("userAgent", IPHONE_UA);
    const sent = await oneError();
    expect(contextsOf(sent).length).toBeGreaterThan(0);
    for (const c of contextsOf(sent)) {
      expect(c).toEqual({
        browser: { name: "Safari", version: "18" },
        os: { name: "iOS", version: "18" },
      });
    }
    for (const part of [IPHONE_UA, "Mozilla", "AppleWebKit", "18.1", "15E148", "iPhone"]) {
      expect(sent.json(), `leaked: ${part}`).not.toContain(part);
    }
  });

  it("from userAgentData: the real brand, not the placeholder one, with the major version", async () => {
    setNavigator("userAgent", ODD_UA);
    setNavigator("userAgentData", {
      brands: [
        { brand: "Not)A;Brand", version: "99.0.0.0" },
        { brand: "Chromium", version: "131.0.6778.86" },
        { brand: "Google Chrome", version: "131.0.6778.86" },
      ],
      platform: "Windows",
      mobile: false,
    });
    const sent = await oneError();
    expect(contextsOf(sent).length).toBeGreaterThan(0);
    for (const c of contextsOf(sent)) {
      expect(c).toEqual({ browser: { name: "Chrome", version: "131" }, os: { name: "Windows" } });
    }
    expect(sent.json()).not.toContain("SECRETAGENT");
    expect(sent.json()).not.toContain("6778");
  });

  it("says unknown for a UA nothing recognises, never the raw string", async () => {
    setNavigator("userAgent", ODD_UA);
    const sent = await oneError();
    expect(contextsOf(sent).length).toBeGreaterThan(0);
    for (const c of contextsOf(sent)) {
      expect(c).toEqual({ browser: { name: "unknown" }, os: { name: "unknown" } });
    }
    expect(sent.json()).not.toContain("SECRETAGENT");
  });
});
