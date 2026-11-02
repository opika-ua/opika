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
      ["Dedupe", "GlobalHandlers", "HttpContext", "LinkedErrors"].sort(),
    );
  });

  it("posts to its own tunnel, not to Sentry", () => {
    initClientSentry(DSN, { transport: recordingTransport().transport });
    expect(Sentry.getClient()?.getOptions().tunnel).toBe("/api/monitoring");
  });
});
