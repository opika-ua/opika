import { afterEach, describe, expect, it, vi } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { handleKabinetAuth, kabinetAuthAvailability } from "./auth-route";
import { handleKabinetConfirm } from "./confirm-route";
import { consoleInvitationSender } from "./email-senders";
import { consoleSender } from "./magic-link-sender";
import { productionMailFor, productionMailOf } from "./production-mail";
import { type ProductionSignIn, productionSignInOf } from "./production-sign-in";

/**
 * The wiring commit (`docs/h2-next-prs.md`, "Wiring commit and production
 * rollout"): production sign-in is available exactly when
 * `productionSignInOf` is on, through the provider-backed senders built once
 * per process, and fails closed with `productionSignInOf`'s typed reason
 * otherwise. Example values only, never a real key.
 */

/** Production's shape after the switch-on (EM-B10), with example values. */
const production = {
  NODE_ENV: "production",
  VERCEL_ENV: "production",
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "resend-key-example",
  EMAIL_FROM_ADDRESS: "noreply@mail.example.org",
  EMAIL_FROM_NAME: "Example",
  EMAIL_REPLY_TO: "hello@example.org",
  PRODUCTION_ORIGIN: "https://example.org",
  BETTER_AUTH_SECRET: "s".repeat(64),
  BETTER_AUTH_URL: "https://example.org",
  KABINET_OPERATOR_DISPLAY_NAME: "Олексій Колотенко",
};

/** The copy treated as landed, so every other condition is visible. */
const withCopyLanded = {
  signIn: (env: Readonly<Record<string, string | undefined>>) => productionSignInOf(env, []),
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("kabinetAuthAvailability in production", () => {
  it("is available exactly when productionSignInOf is on, with the provider senders, never the console's", () => {
    const availability = kabinetAuthAvailability(production, withCopyLanded);
    expect(availability.kind).toBe("available");
    if (availability.kind !== "available") return;
    expect(availability.baseURL).toBe("https://example.org");
    expect(availability.secret).toBe("s".repeat(64));
    // The console invitation sender has no From address; the provider one has the configured one.
    expect(availability.invites.fromAddress).toBe("noreply@mail.example.org");
  });

  /**
   * EM-T22 (Oleksii, verbatim: "cachedBlockList(config) built once per
   * process"): every request reads the same senders and the same block-list
   * reader, so the three-minute cache is shared, not rebuilt per request.
   */
  it("builds the senders once per process: every call returns the same ones", () => {
    const first = kabinetAuthAvailability(production, withCopyLanded);
    const second = kabinetAuthAvailability({ ...production }, withCopyLanded);
    if (first.kind !== "available" || second.kind !== "available") {
      throw new Error("expected production sign-in on");
    }
    expect(second.sender).toBe(first.sender);
    expect(second.invites).toBe(first.invites);
    expect(second.invites.blockList).toBe(first.invites.blockList);
  });

  /**
   * Against the live catalogue, with no copy override: nothing under kabinet.*
   * is pending since WI-Q3's text landed (2026-10-15), so production sign-in
   * is available. This is the state merging the wiring PR deploys.
   */
  it("against the live catalogue, is available: no kabinet copy is pending (answer 7, WI-Q3)", () => {
    const availability = kabinetAuthAvailability(production);
    expect(availability.kind).toBe("available");
  });

  it.each([
    [{ VERCEL_ENV: "preview" }, "preview_never_sends"],
    [{ VERCEL_ENV: undefined }, "environment_unidentified"],
    [{ RESEND_API_KEY: undefined }, "provider_invalid"],
    [{ EMAIL_REPLY_TO: undefined }, "provider_not_configured"],
    [{ BETTER_AUTH_SECRET: undefined }, "auth_config_missing"],
    [{ BETTER_AUTH_SECRET: "s".repeat(31) }, "auth_secret_too_short"],
    [{ BETTER_AUTH_URL: "https://www.example.org" }, "auth_url_not_production_origin"],
  ] as const)("fails closed with %o: %s", (change, reason) => {
    expect(kabinetAuthAvailability({ ...production, ...change }, withCopyLanded)).toEqual({
      kind: "unavailable",
      reason: "production_sign_in_off",
      off: { kind: "off", reason },
    });
  });

  /** "Previews: refuse sign-in outright" (IN-R2), with every variable a production has. */
  it("refuses a Preview with production's whole configuration and the copy landed", async () => {
    const availability = kabinetAuthAvailability(
      { ...production, VERCEL_ENV: "preview" },
      withCopyLanded,
    );
    const neverBuilt = () => {
      throw new Error("must not build auth while sign-in is off");
    };
    const signIn = await handleKabinetAuth(
      new Request("https://example.org/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "a@example.org" }),
      }),
      {
        availability,
        auth: neverBuilt,
        limiters: {
          perAddress: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 100 }),
          perIp: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 100 }),
        },
        now: new Date(),
      },
    );
    expect(signIn.status).toBe(503);
    const confirm = await handleKabinetConfirm(
      new Request(`https://example.org/kabinet/vkhid/pidtverdzhennia?token=${"A".repeat(32)}`),
      {
        availability,
        auth: neverBuilt,
        acceptInvitation: async () => ({ kind: "nothing_to_accept" }),
      },
    );
    expect(confirm.status).toBe(404);
  });

  it("says why it is off once per reason per process, naming no value", async () => {
    // A fresh module, so this process-wide "once" starts from nothing here.
    vi.resetModules();
    const fresh = (await import("./auth-route")).kabinetAuthAvailability;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const offWith = { ...production, BETTER_AUTH_URL: "https://elsewhere.example" };
    fresh(offWith, withCopyLanded);
    fresh(offWith, withCopyLanded);
    fresh({ ...offWith, VERCEL_ENV: "preview" }, withCopyLanded);
    fresh(production, { signIn: () => productionSignInOf(production, ["kabinet.a.b"]) });
    expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([
      "[kabinet] production sign-in is off: auth_url_not_production_origin",
      "[kabinet] production sign-in is off: preview_never_sends",
      "[kabinet] production sign-in is off: copy_pending (kabinet.a.b)",
    ]);
  });

  it("leaves development on the console senders, whatever production would say", () => {
    const availability = kabinetAuthAvailability({
      NODE_ENV: "development",
      BETTER_AUTH_SECRET: "s".repeat(32),
      BETTER_AUTH_URL: "http://localhost:3000",
    });
    expect(availability.kind === "available" && availability.invites.fromAddress).toBeNull();
  });
});

/** A fetch that records every request and answers each provider's success shape. */
function recordingFetch() {
  const calls: { url: string; headers: Record<string, string>; body: unknown }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
    });
    if (url.includes("blockedContacts")) {
      return Response.json({ count: 0, contacts: [] });
    }
    if (url.includes("brevo")) return Response.json({ messageId: "brevo-1" }, { status: 201 });
    return Response.json({ id: "resend-1" });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const onWith = (env: Record<string, string | undefined>) => {
  const signIn: ProductionSignIn = productionSignInOf(env, []);
  if (signIn.kind !== "on") throw new Error(`expected on, got ${signIn.reason}`);
  return signIn;
};

describe("productionMailOf: each email through its own route (EM-T22, EM-T18)", () => {
  /**
   * Two routes on different providers, so a sender reaching the other's
   * provider would show: invites through Brevo on its own key, sign-in
   * through Resend. Config can no longer produce this (PW1-Q4: auth emails
   * are locked to Resend, `production-sign-in.test.ts`), so the invite route
   * is replaced by hand: this tests which route `productionMailOf` hands to
   * which sender, not what config allows.
   */
  const splitOn = () => {
    const on = onWith(production);
    return {
      ...on,
      email: {
        ...on.email,
        invite: { ...on.email.invite, provider: "brevo" as const, apiKey: "brevo-key-example" },
      },
    };
  };

  it("sends the magic link through routes.signIn, signed with the configured operator name", async () => {
    const { calls, fetchImpl } = recordingFetch();
    const mail = productionMailOf(splitOn(), { fetchImpl, log: () => {} });
    await mail.sender.send({
      email: "olena@example.org",
      url: "https://example.org/kabinet/vkhid/pidtverdzhennia?token=abc",
    });
    expect(calls.map((call) => call.url)).toEqual(["https://api.resend.com/emails"]);
    expect(calls[0]?.headers.Authorization).toBe("Bearer resend-key-example");
    const body = calls[0]?.body as { text: string; to: string[]; reply_to: string };
    expect(body.to).toEqual(["olena@example.org"]);
    expect(body.reply_to).toBe("hello@example.org");
    // Transcribed: row 82's signature line, filled with the configured name.
    expect(body.text).toContain("— Олексій Колотенко");
  });

  it("sends the invite through routes.invite, with the block check on that route's provider", async () => {
    const { calls, fetchImpl } = recordingFetch();
    const mail = productionMailOf(splitOn(), { fetchImpl, log: () => {} });
    const outcome = await mail.invites.send({
      email: "olena@example.org",
      shelterName: "Тестовий",
      operatorName: "Олексій Колотенко",
      url: "https://example.org/kabinet/vkhid?zaproshennia=x",
      shelterVerification: "verified",
      validForHours: 72,
    });
    expect(outcome).toEqual({ kind: "sent", blockCheck: "clear" });
    expect(calls.map((call) => new URL(call.url).host)).toEqual(["api.brevo.com", "api.brevo.com"]);
    for (const call of calls) expect(call.headers["api-key"]).toBe("brevo-key-example");
    expect(calls.some((call) => call.url.includes("resend"))).toBe(false);
    expect(mail.invites.fromAddress).toBe("noreply@mail.example.org");
  });

  it("on production's own shape (both on Resend), the invite reports the block check as unknown and reads no list", async () => {
    const { calls, fetchImpl } = recordingFetch();
    const mail = productionMailOf(onWith(production), { fetchImpl, log: () => {} });
    expect(await mail.invites.blockList.read(new Date())).toEqual({
      kind: "unknown",
      why: "provider_suppresses",
    });
    expect(calls).toEqual([]);
    const outcome = await mail.invites.send({
      email: "olena@example.org",
      shelterName: "Тестовий",
      operatorName: "Олексій Колотенко",
      url: "https://example.org/kabinet/vkhid?zaproshennia=x",
      shelterVerification: "verified",
      validForHours: 72,
    });
    expect(outcome).toEqual({ kind: "sent", blockCheck: "unknown" });
    expect(calls.map((call) => call.url)).toEqual(["https://api.resend.com/emails"]);
    expect(calls[0]?.headers.Authorization).toBe("Bearer resend-key-example");
  });

  it("logs a refused sign-in send with the address masked, never the link", async () => {
    const lines: string[] = [];
    const failing = (async () => new Response("no", { status: 500 })) as typeof fetch;
    const mail = productionMailOf(onWith(production), {
      fetchImpl: failing,
      log: (line) => lines.push(line),
    });
    await mail.sender.send({
      email: "olena@example.org",
      url: "https://example.org/kabinet/vkhid/pidtverdzhennia?token=secret-token",
    });
    expect(lines).toEqual([
      "[kabinet] sign-in email to o•••@example.org not sent: failed (provider_error), provider resend, status 500",
    ]);
  });

  it("logs a refused invite send through the same line, with the provider and status (2026-10-19)", async () => {
    const lines: string[] = [];
    const failing = (async () => new Response("no", { status: 401 })) as typeof fetch;
    const mail = productionMailOf(onWith(production), {
      fetchImpl: failing,
      log: (line) => lines.push(line),
    });
    const outcome = await mail.invites.send({
      email: "olena@example.org",
      shelterName: "Лапа",
      operatorName: "Олексій",
      url: "https://example.org/kabinet/vkhid?zaproshennia=secret-invite",
      shelterVerification: "verified",
      validForHours: 72,
    });
    expect(outcome).toEqual({ kind: "failed", reason: "provider_error" });
    expect(lines).toEqual([
      "[kabinet] invite email to o•••@example.org not sent: failed (provider_error), provider resend, status 401",
    ]);
    expect(lines.join("")).not.toContain("secret-invite");
    expect(lines.join("")).not.toContain("resend-key-example");
  });

  it("is rebuilt only when the configuration changes (productionMailFor)", () => {
    const first = productionMailFor(onWith(production));
    expect(productionMailFor(onWith({ ...production }))).toBe(first);
    expect(productionMailFor(onWith({ ...production, EMAIL_FROM_NAME: "Other" }))).not.toBe(first);
  });
});

describe("the development senders stay out of production", () => {
  it("never hands production the console senders, which print the link", () => {
    const availability = kabinetAuthAvailability(production, withCopyLanded);
    if (availability.kind !== "available") throw new Error("expected production sign-in on");
    expect(availability.sender).not.toBe(consoleSender);
    expect(availability.invites).not.toBe(consoleInvitationSender);
  });
});
