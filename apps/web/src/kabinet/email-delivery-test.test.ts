import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readSingleKey, runDeliveryTest } from "./email-delivery-test";

const KEY = "test-key-not-real-0123456789";

type Call = { url: string; init: RequestInit };

const harness = (respond: (n: number) => Response = () => okResponse()) => {
  const calls: Call[] = [];
  const lines: string[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond(calls.length);
  }) as unknown as typeof fetch;
  let n = 0;
  return {
    calls,
    lines,
    input: {
      to: "someone@example.com",
      apiKey: KEY,
      origin: "https://example.org",
      base: "http://localhost:3000/",
      fromName: "Config Name",
      fetchImpl,
      random: () => `r${++n}`,
      log: (line: string) => lines.push(line),
    },
  };
};

const okResponse = (id = "<m@brevo>") =>
  new Response(JSON.stringify({ messageId: id }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });

const bodyOf = (call: Call) => JSON.parse(call.init.body as string);

describe("runDeliveryTest", () => {
  it("sends the magic-link email, then the invite email, to Brevo from noreply@mail.<origin host>", async () => {
    const h = harness();
    expect(await runDeliveryTest(h.input)).toBe(0);
    expect(h.calls.map((c) => c.url)).toEqual([
      "https://api.brevo.com/v3/smtp/email",
      "https://api.brevo.com/v3/smtp/email",
    ]);
    for (const call of h.calls) {
      expect((call.init.headers as Record<string, string>)["api-key"]).toBe(KEY);
      const body = bodyOf(call);
      expect(body.sender).toEqual({ email: "noreply@mail.example.org", name: "Config Name" });
      expect(body.to).toEqual([{ email: "someone@example.com" }]);
    }
    const [signIn, invite] = h.calls.map(bodyOf);
    expect(signIn.textContent).toContain(
      "http://localhost:3000/kabinet/vkhid/pidtverdzhennia?token=TEST-r1",
    );
    expect(signIn.htmlContent).toContain(
      'href="http://localhost:3000/kabinet/vkhid/pidtverdzhennia?token=TEST-r1"',
    );
    expect(invite.textContent).toContain(
      "http://localhost:3000/kabinet/vkhid?zaproshennia=TEST-r2",
    );
    // Placeholder copy, not invented Ukrainian, and long enough to resemble a real message.
    for (const body of [signIn, invite]) {
      expect(body.subject).toMatch(/^\[COPY PENDING\]/);
      expect(body.textContent.length).toBeGreaterThan(500);
      expect(body.textContent).not.toMatch(/[Ѐ-ӿ]/);
    }
  });

  it("prints the status and message id of each send, and nothing of the key or the request", async () => {
    const h = harness((n) => okResponse(`<id-${n}@brevo>`));
    await runDeliveryTest(h.input);
    expect(h.lines).toEqual([
      "magic link: status 201, message id <id-1@brevo>",
      "invite: status 201, message id <id-2@brevo>",
    ]);
    const output = h.lines.join("\n");
    expect(output).not.toContain(KEY);
    expect(output).not.toContain("TEST-");
  });

  it("reports a failed send without the key, and exits non-zero", async () => {
    const h = harness((n) =>
      n === 1 ? new Response(JSON.stringify({ message: KEY }), { status: 401 }) : okResponse(),
    );
    expect(await runDeliveryTest(h.input)).toBe(1);
    expect(h.calls).toHaveLength(2);
    expect(h.lines[0]).toMatch(/^magic link: FAILED/);
    expect(h.lines.join("\n")).not.toContain(KEY);
  });

  it("refuses without --to, sending nothing", async () => {
    const h = harness();
    expect(await runDeliveryTest({ ...h.input, to: undefined })).toBe(1);
    expect(h.calls).toHaveLength(0);
    expect(h.lines).toEqual(["Usage: --to <address> is required."]);
  });

  it("refuses without a From name, sending nothing", async () => {
    for (const fromName of [undefined, "", "   "]) {
      const h = harness();
      expect(await runDeliveryTest({ ...h.input, fromName })).toBe(1);
      expect(h.calls).toHaveLength(0);
      expect(h.lines).toEqual([
        "No From name: pass --from-name or set EMAIL_FROM_NAME. Nothing sent.",
      ]);
    }
  });

  it("refuses without the key, sending nothing", async () => {
    const h = harness();
    expect(await runDeliveryTest({ ...h.input, apiKey: undefined })).toBe(1);
    expect(h.calls).toHaveLength(0);
    expect(h.lines).toEqual([
      "BREVO_API_KEY is not set in the repo-root .env.local. Nothing sent.",
    ]);
  });

  it("refuses a production origin that isn't https, sending nothing", async () => {
    const h = harness();
    expect(await runDeliveryTest({ ...h.input, origin: "http://example.org" })).toBe(1);
    expect(h.calls).toHaveLength(0);
  });
});

describe("readSingleKey", () => {
  const dir = mkdtempSync(join(tmpdir(), "delivery-test-"));

  it("returns that one key from a dotenv file", () => {
    const file = join(dir, "a.env");
    writeFileSync(file, "OTHER=nope\nBREVO_API_KEY=abc\n");
    expect(readSingleKey(file, "BREVO_API_KEY")).toBe("abc");
  });

  it("is undefined for a missing file, a missing key or an empty value", () => {
    const file = join(dir, "b.env");
    writeFileSync(file, "OTHER=nope\nEMPTY=\n");
    expect(readSingleKey(join(dir, "absent.env"), "BREVO_API_KEY")).toBeUndefined();
    expect(readSingleKey(file, "BREVO_API_KEY")).toBeUndefined();
    expect(readSingleKey(file, "EMPTY")).toBeUndefined();
  });
});
