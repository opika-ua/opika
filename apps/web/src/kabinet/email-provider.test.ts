import { describe, expect, it } from "vitest";
import {
  type EmailProviderConfig,
  emailProviderConfigOf,
  fetchEmailSender,
  providerRequest,
} from "./email-provider";

/**
 * IN-Q2: one fetch-based email module, three candidate providers. No real
 * provider is called: the request shapes are asserted, and sending goes
 * through an injected fetch. (When production sign-in may be on is
 * production-sign-in.test.ts.)
 */

const email = { to: "olena@example.org", subject: "S", html: "<p>H</p>", text: "T" };
const config = (provider: EmailProviderConfig["provider"], fromName: string | null = "Реєстр") =>
  ({ provider, apiKey: "key-123", fromAddress: "kabinet@mail.example.org", fromName }) as const;

describe("providerRequest", () => {
  it("builds Resend's request", () => {
    const { url, init } = providerRequest(config("resend"), email);
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer key-123",
      // Explicit (review of 3bc08a0, finding 6): Resend refuses a request without one.
      "User-Agent": "kabinet-mailer/1",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      from: "Реєстр <kabinet@mail.example.org>",
      to: ["olena@example.org"],
      subject: "S",
      html: "<p>H</p>",
      text: "T",
    });
  });

  it("builds Postmark's request", () => {
    const { url, init } = providerRequest(config("postmark"), email);
    expect(url).toBe("https://api.postmarkapp.com/email");
    expect(init.headers).toMatchObject({ "X-Postmark-Server-Token": "key-123" });
    expect(JSON.parse(init.body as string)).toEqual({
      From: "Реєстр <kabinet@mail.example.org>",
      To: "olena@example.org",
      Subject: "S",
      HtmlBody: "<p>H</p>",
      TextBody: "T",
      MessageStream: "outbound",
    });
  });

  it("builds Brevo's request, with or without a display name", () => {
    const named = providerRequest(config("brevo"), email);
    expect(named.url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(named.init.headers).toMatchObject({ "api-key": "key-123" });
    expect(JSON.parse(named.init.body as string)).toEqual({
      sender: { email: "kabinet@mail.example.org", name: "Реєстр" },
      to: [{ email: "olena@example.org" }],
      subject: "S",
      htmlContent: "<p>H</p>",
      textContent: "T",
    });
    const bare = JSON.parse(providerRequest(config("brevo", null), email).init.body as string);
    expect(bare.sender).toEqual({ email: "kabinet@mail.example.org" });
  });
});

describe("fetchEmailSender", () => {
  const respond = (status: number, body: unknown) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("resolves on the provider's success", async () => {
    await expect(
      fetchEmailSender(config("resend"), respond(200, { id: "x" })).send(email),
    ).resolves.toBeUndefined();
    await expect(
      fetchEmailSender(config("brevo"), respond(201, { messageId: "m" })).send(email),
    ).resolves.toBeUndefined();
  });

  it("throws on a refusal, and on Postmark's 2xx carrying an ErrorCode, never naming the key or the recipient", async () => {
    const refusals = [
      fetchEmailSender(config("resend"), respond(422, { message: "bad" })).send(email),
      fetchEmailSender(
        config("postmark"),
        respond(200, { ErrorCode: 300, Message: "Invalid email" }),
      ).send(email),
    ];
    for (const refusal of refusals) {
      await expect(refusal).rejects.toThrow(/refused the send/);
      await expect(refusal).rejects.not.toThrow(/key-123|olena@example\.org/);
    }
  });
});

describe("fetchEmailSender, the failure modes the review named (3bc08a0)", () => {
  it("passes an abort signal, so a hung provider is abandoned (finding 3)", async () => {
    let seen: AbortSignal | null | undefined;
    const capture = (async (_url: string, init?: RequestInit) => {
      seen = init?.signal;
      return new Response(JSON.stringify({ id: "x" }), { status: 200 });
    }) as unknown as typeof fetch;
    await fetchEmailSender(config("resend"), capture).send(email);
    expect(seen).toBeInstanceOf(AbortSignal);
  });

  /**
   * Review pass 2, finding 1: passing *a* signal proves nothing; a signal
   * that never fires would pass the test above. This fetch answers only by
   * rejecting when its signal aborts, so the send settles only if the
   * timeout actually fires.
   */
  it("abandons a provider that never answers once the timeout fires", async () => {
    const neverAnswers = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })) as unknown as typeof fetch;
    const sent = fetchEmailSender(config("resend"), neverAnswers, 20).send(email);
    await expect(sent).rejects.toThrow(/did not answer/);
  }, 2_000);

  it("reports a send that never answered without naming the key or the recipient", async () => {
    const hang = (async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    }) as unknown as typeof fetch;
    const sent = fetchEmailSender(config("postmark"), hang).send(email);
    await expect(sent).rejects.toThrow(/did not answer/);
    await expect(sent).rejects.not.toThrow(/key-123|olena@example\.org/);
  });

  it("treats a Postmark 200 it can't read as a failure, never a success (finding 6)", async () => {
    const notJson = (async () =>
      new Response("<html>ok</html>", { status: 200 })) as unknown as typeof fetch;
    await expect(fetchEmailSender(config("postmark"), notJson).send(email)).rejects.toThrow(
      /refused the send/,
    );
  });
});

describe("emailProviderConfigOf", () => {
  const base = {
    EMAIL_PROVIDER: "resend",
    EMAIL_PROVIDER_API_KEY: "key",
    EMAIL_FROM_ADDRESS: "kabinet@mail.example.org",
    PRODUCTION_ORIGIN: "https://example.org",
  };

  it("is configured from the four variables, the display name optional", () => {
    expect(emailProviderConfigOf(base)).toEqual({
      kind: "configured",
      config: {
        provider: "resend",
        apiKey: "key",
        fromAddress: "kabinet@mail.example.org",
        fromName: null,
      },
    });
  });

  it("reports what is missing, and refuses an unknown provider or a From address off the mail. subdomain", () => {
    expect(emailProviderConfigOf({ ...base, EMAIL_PROVIDER_API_KEY: undefined })).toEqual({
      kind: "missing",
      missing: ["EMAIL_PROVIDER_API_KEY"],
    });
    expect(emailProviderConfigOf({ ...base, EMAIL_PROVIDER: "sendgrid" }).kind).toBe("invalid");
    expect(emailProviderConfigOf({ ...base, EMAIL_FROM_ADDRESS: "kabinet@example.org" }).kind).toBe(
      "invalid",
    );
  });

  /**
   * Review of 3bc08a0, finding 4; IN-R2 (Oleksii: "The From address is on
   * mail.opika.org.ua"): the From domain is exactly mail. + PRODUCTION_ORIGIN's
   * host, derived, never a literal.
   */
  it("refuses a From address on any mail. domain but the production origin's own", () => {
    for (const from of [
      "a@mail.attacker.example",
      "a@mail.",
      "a@mail.example.org.attacker.example",
      "a@www.mail.example.org",
    ]) {
      expect(emailProviderConfigOf({ ...base, EMAIL_FROM_ADDRESS: from }).kind, from).toBe(
        "invalid",
      );
    }
    expect(
      emailProviderConfigOf({ ...base, EMAIL_FROM_ADDRESS: "Kabinet@MAIL.example.org" }).kind,
    ).toBe("configured");
  });

  it("needs PRODUCTION_ORIGIN, and only an https origin with no path", () => {
    expect(emailProviderConfigOf({ ...base, PRODUCTION_ORIGIN: undefined })).toEqual({
      kind: "missing",
      missing: ["PRODUCTION_ORIGIN"],
    });
    for (const origin of ["http://example.org", "https://example.org/kabinet", "not a url"]) {
      expect(emailProviderConfigOf({ ...base, PRODUCTION_ORIGIN: origin }).kind, origin).toBe(
        "invalid",
      );
    }
  });
});
