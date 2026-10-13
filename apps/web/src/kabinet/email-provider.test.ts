import { describe, expect, it } from "vitest";
import {
  type EmailProviderConfig,
  emailProviderConfigOf,
  fetchEmailSender,
  providerRequest,
} from "./email-provider";
import { productionSignInOf } from "./production-sign-in";

/**
 * IN-Q2 / IN-Q6: one fetch-based email module, three candidate providers,
 * and when production sign-in may be on. No real provider is called: the
 * request shapes are asserted, and sending goes through an injected fetch.
 */

const email = { to: "olena@example.org", subject: "S", html: "<p>H</p>", text: "T" };
const config = (provider: EmailProviderConfig["provider"], fromName: string | null = "Реєстр") =>
  ({ provider, apiKey: "key-123", fromAddress: "kabinet@mail.example.org", fromName }) as const;

describe("providerRequest", () => {
  it("builds Resend's request", () => {
    const { url, init } = providerRequest(config("resend"), email);
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ Authorization: "Bearer key-123" });
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

describe("emailProviderConfigOf", () => {
  const base = {
    EMAIL_PROVIDER: "resend",
    EMAIL_PROVIDER_API_KEY: "key",
    EMAIL_FROM_ADDRESS: "kabinet@mail.example.org",
  };

  it("is configured from the three variables, the display name optional", () => {
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
});

describe("productionSignInOf (IN-Q6)", () => {
  const full = {
    EMAIL_PROVIDER: "postmark",
    EMAIL_PROVIDER_API_KEY: "key",
    EMAIL_FROM_ADDRESS: "kabinet@mail.example.org",
    BETTER_AUTH_SECRET: "s".repeat(32),
    BETTER_AUTH_URL: "https://example.org",
    VERCEL_ENV: "production",
    VERCEL_PROJECT_PRODUCTION_URL: "example.org",
  };

  it("is on exactly when the provider, the secret and the URL are set, and the URL is the production origin", () => {
    expect(productionSignInOf(full).kind).toBe("on");
    expect(productionSignInOf({ ...full, BETTER_AUTH_URL: "https://example.org/" }).kind).toBe(
      "on",
    );
  });

  it("is off with any of the three missing", () => {
    expect(productionSignInOf({ ...full, EMAIL_PROVIDER_API_KEY: undefined })).toEqual({
      kind: "off",
      reason: "provider_not_configured",
    });
    expect(productionSignInOf({ ...full, BETTER_AUTH_SECRET: undefined })).toEqual({
      kind: "off",
      reason: "auth_config_missing",
    });
    expect(productionSignInOf({ ...full, BETTER_AUTH_URL: undefined })).toEqual({
      kind: "off",
      reason: "auth_config_missing",
    });
  });

  it("is never on in a Preview, even with a provider key set there", () => {
    expect(productionSignInOf({ ...full, VERCEL_ENV: "preview" })).toEqual({
      kind: "off",
      reason: "preview_never_sends",
    });
    expect(
      productionSignInOf({ ...full, VERCEL_ENV: "preview", EMAIL_PROVIDER_API_KEY: undefined }),
    ).toEqual({ kind: "off", reason: "preview_never_sends" });
  });

  it("is off on production when BETTER_AUTH_URL is not the production origin", () => {
    for (const wrong of [
      "https://preview-abc.vercel.app",
      "http://example.org",
      "https://www.example.org",
    ]) {
      expect(productionSignInOf({ ...full, BETTER_AUTH_URL: wrong })).toEqual({
        kind: "off",
        reason: "auth_url_not_production_origin",
      });
    }
    expect(productionSignInOf({ ...full, VERCEL_PROJECT_PRODUCTION_URL: undefined })).toEqual({
      kind: "off",
      reason: "auth_url_not_production_origin",
    });
  });
});
