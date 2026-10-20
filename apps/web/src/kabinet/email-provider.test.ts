import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BLOCK_LIST_CACHE_MS,
  BLOCKED_MAX_PAGES,
  BLOCKED_PAGE_SIZE,
  blockedStatusOf,
  cachedBlockList,
  type EmailProviderConfig,
  emailProviderConfigOf,
  emailRoutesOf,
  fetchEmailSender,
  PROVIDER_KEY_NAMES,
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
  ({
    provider,
    apiKey: "key-123",
    fromAddress: "kabinet@mail.example.org",
    fromName,
    replyTo: "hello@example.org",
  }) as const;

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
      reply_to: "hello@example.org",
      subject: "S",
      html: "<p>H</p>",
      text: "T",
    });
  });

  /**
   * EM-B6 (sign-in through Resend): the request carries exactly the six
   * fields and the two headers that matter, and nothing that could turn a
   * sign-in email into a bulk one. No `headers` (so no List-Unsubscribe, the
   * header behind IN-E7), no `tags`, no `topic_id`. Asserted on the bytes
   * that go out, not on the object before serialisation.
   */
  it("sends Resend exactly six fields, with no headers, tags, topic or List-Unsubscribe anywhere", () => {
    const { init } = providerRequest(config("resend"), email);
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ["from", "html", "reply_to", "subject", "text", "to"].sort(),
    );
    expect(Object.keys(init.headers as Record<string, string>).sort()).toEqual(
      ["Accept", "Authorization", "Content-Type", "User-Agent"].sort(),
    );
    const serialised = `${JSON.stringify(init.headers)}\n${init.body as string}`;
    for (const banned of ['"headers"', '"tags"', '"topic_id"', "List-Unsubscribe"]) {
      expect(serialised, banned).not.toContain(banned);
    }
  });

  it("builds Postmark's request", () => {
    const { url, init } = providerRequest(config("postmark"), email);
    expect(url).toBe("https://api.postmarkapp.com/email");
    expect(init.headers).toMatchObject({ "X-Postmark-Server-Token": "key-123" });
    expect(JSON.parse(init.body as string)).toEqual({
      From: "Реєстр <kabinet@mail.example.org>",
      To: "olena@example.org",
      ReplyTo: "hello@example.org",
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
      replyTo: { email: "hello@example.org" },
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
    ).resolves.toEqual({ status: 200, messageId: "x" });
    await expect(
      fetchEmailSender(config("brevo"), respond(201, { messageId: "m" })).send(email),
    ).resolves.toEqual({ status: 201, messageId: "m" });
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
    RESEND_API_KEY: "key",
    EMAIL_FROM_ADDRESS: "kabinet@mail.example.org",
    EMAIL_REPLY_TO: "hello@example.org",
    PRODUCTION_ORIGIN: "https://example.org",
  };

  it("is configured from the provider, its own key and three more variables, the display name optional", () => {
    expect(emailProviderConfigOf(base)).toEqual({
      kind: "configured",
      config: {
        provider: "resend",
        apiKey: "key",
        fromAddress: "kabinet@mail.example.org",
        fromName: null,
        replyTo: "hello@example.org",
      },
    });
  });

  /**
   * Oleksii, 2026-10-14, verbatim: "5. Yes: Reply-To: hello@opika.org.ua on
   * all emails." Required, so production can't send mail nobody can answer;
   * on the production origin's own host, so a reply never leaves for another
   * domain. The address itself is config, never a literal in the code.
   */
  it("requires EMAIL_REPLY_TO, an address on PRODUCTION_ORIGIN's own host", () => {
    for (const missing of [undefined, "", "   "]) {
      expect(emailProviderConfigOf({ ...base, EMAIL_REPLY_TO: missing }), String(missing)).toEqual({
        kind: "missing",
        missing: ["EMAIL_REPLY_TO"],
      });
    }
    for (const wrong of [
      "hello@attacker.example",
      "hello@mail.example.org",
      "hello@example.org.attacker.example",
      "not an address",
      "hello@",
      "a b@example.org",
    ]) {
      expect(emailProviderConfigOf({ ...base, EMAIL_REPLY_TO: wrong }), wrong).toEqual({
        kind: "invalid",
        reason: "EMAIL_REPLY_TO must be an address on PRODUCTION_ORIGIN's host",
      });
    }
    const trimmed = emailProviderConfigOf({ ...base, EMAIL_REPLY_TO: " hello@Example.org " });
    expect(trimmed.kind === "configured" && trimmed.config.replyTo).toBe("hello@Example.org");
  });

  it("reports what is missing, and refuses an unknown provider or a From address off the mail. subdomain", () => {
    expect(emailProviderConfigOf({ ...base, EMAIL_PROVIDER: undefined })).toEqual({
      kind: "missing",
      missing: ["EMAIL_PROVIDER"],
    });
    expect(emailProviderConfigOf({ ...base, RESEND_API_KEY: undefined })).toEqual({
      kind: "invalid",
      reason: "EMAIL_PROVIDER=resend needs RESEND_API_KEY",
    });
    expect(emailProviderConfigOf({ ...base, EMAIL_PROVIDER: "sendgrid" })).toEqual({
      kind: "invalid",
      reason:
        "EMAIL_PROVIDER must be resend: every email it routes is an auth email, and auth emails go through resend only",
    });
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

/**
 * EM-B6 (Oleksii, 2026-10-15, verbatim: "Resend for SIGN-IN sends: GO. a.
 * Same domain mail.opika.org.ua"): `EMAIL_SIGN_IN_PROVIDER` can name the
 * sign-in route. EM-B10 (delivery test 5, verbatim: "the invite path reads
 * RESEND_API_KEY via the provider switch, same as sign-in. No sends with a
 * mismatched provider/key pair at any point."): every route reads its key
 * from its provider's own variable, so the pair cannot disagree. Since PW1-Q4
 * the one provider either variable may name is Resend (the lock's own block,
 * below).
 */
describe("emailRoutesOf: one key per provider, for both routes", () => {
  const RESEND_KEY = "resend-key-SECRET-4567";
  const BREVO_KEY = "brevo-key-SECRET-0123";
  const POSTMARK_KEY = "postmark-key-SECRET-89";
  /** Production after the switch-on: both emails on Resend, nothing else set. */
  const resendOnly = {
    EMAIL_PROVIDER: "resend",
    RESEND_API_KEY: RESEND_KEY,
    EMAIL_FROM_ADDRESS: "noreply@mail.example.org",
    EMAIL_FROM_NAME: "Реєстр",
    EMAIL_REPLY_TO: "hello@example.org",
    PRODUCTION_ORIGIN: "https://example.org",
  };
  const allKeys = {
    RESEND_API_KEY: RESEND_KEY,
    BREVO_API_KEY: BREVO_KEY,
    POSTMARK_API_KEY: POSTMARK_KEY,
  };
  const configured = (env: Record<string, string | undefined>) => {
    const result = emailRoutesOf(env);
    if (result.kind !== "configured")
      throw new Error(`expected configured, got ${JSON.stringify(result)}`);
    return result.routes;
  };

  it("names a key variable for every provider, each after its own provider", () => {
    expect(PROVIDER_KEY_NAMES).toEqual({
      resend: "RESEND_API_KEY",
      postmark: "POSTMARK_API_KEY",
      brevo: "BREVO_API_KEY",
    });
  });

  it("EMAIL_PROVIDER=resend: the invite and sign-in both go through Resend on RESEND_API_KEY", () => {
    const { invite, signIn } = configured(resendOnly);
    expect(invite).toMatchObject({ provider: "resend", apiKey: RESEND_KEY });
    expect(signIn).toEqual(invite);
  });

  it("Resend reads its own key and no other, whatever else is set: a mismatched pair can't be built", () => {
    const { invite, signIn } = configured({
      ...resendOnly,
      ...allKeys,
      EMAIL_PROVIDER_API_KEY: "generic-key-never-read",
    });
    expect(invite).toMatchObject({ provider: "resend", apiKey: RESEND_KEY });
    expect(signIn).toEqual(invite);
    for (const other of [BREVO_KEY, POSTMARK_KEY, "generic-key-never-read"]) {
      expect(JSON.stringify(invite)).not.toContain(other);
    }
  });

  it("the removed EMAIL_PROVIDER_API_KEY never stands in for the provider's key", () => {
    const { RESEND_API_KEY: _drop, ...noResendKey } = resendOnly;
    expect(emailRoutesOf({ ...noResendKey, EMAIL_PROVIDER_API_KEY: RESEND_KEY })).toEqual({
      kind: "invalid",
      reason: "EMAIL_PROVIDER=resend needs RESEND_API_KEY",
    });
  });

  it("the default route's provider without its key: invalid, naming the variable and no value", () => {
    for (const blank of [undefined, "", "  "]) {
      // Every other provider's key set: none of them may stand in.
      const result = emailRoutesOf({ ...resendOnly, ...allKeys, RESEND_API_KEY: blank });
      expect(result, String(blank)).toEqual({
        kind: "invalid",
        reason: "EMAIL_PROVIDER=resend needs RESEND_API_KEY",
      });
      for (const value of Object.values(allKeys))
        expect(JSON.stringify(result)).not.toContain(value);
    }
  });

  it("EMAIL_SIGN_IN_PROVIDER unset or blank: sign-in is the default route", () => {
    for (const unset of [{}, { EMAIL_SIGN_IN_PROVIDER: "" }, { EMAIL_SIGN_IN_PROVIDER: " " }]) {
      const { invite, signIn } = configured({ ...resendOnly, BREVO_API_KEY: BREVO_KEY, ...unset });
      expect(signIn, JSON.stringify(unset)).toEqual(invite);
    }
  });

  it("EMAIL_SIGN_IN_PROVIDER naming the default route's own provider: exactly the default route", () => {
    const { invite, signIn } = configured({ ...resendOnly, EMAIL_SIGN_IN_PROVIDER: "resend" });
    expect(signIn).toEqual(invite);
    expect(signIn).toMatchObject({ provider: "resend", apiKey: RESEND_KEY });
  });

  it("a sign-in provider without its key: invalid, naming the variable and no value, never the default route", () => {
    for (const blank of [undefined, "", " "]) {
      const result = emailRoutesOf({
        ...resendOnly,
        ...allKeys,
        RESEND_API_KEY: blank,
        EMAIL_SIGN_IN_PROVIDER: "resend",
      });
      expect(result, String(blank)).toEqual({
        kind: "invalid",
        reason: "EMAIL_SIGN_IN_PROVIDER=resend needs RESEND_API_KEY",
      });
      for (const value of Object.values(allKeys))
        expect(JSON.stringify(result)).not.toContain(value);
    }
  });

  it("an unknown sign-in provider is invalid, without echoing what was set (it may be a key)", () => {
    const result = emailRoutesOf({ ...resendOnly, EMAIL_SIGN_IN_PROVIDER: RESEND_KEY });
    expect(result).toEqual({
      kind: "invalid",
      reason:
        "EMAIL_SIGN_IN_PROVIDER must be unset or resend: every email it routes is an auth email, and auth emails go through resend only",
    });
    expect(JSON.stringify(result)).not.toContain(RESEND_KEY);
  });

  it("a half-done switch is named even when the default route is missing too", () => {
    expect(emailRoutesOf({ EMAIL_SIGN_IN_PROVIDER: "resend" })).toEqual({
      kind: "invalid",
      reason: "EMAIL_SIGN_IN_PROVIDER=resend needs RESEND_API_KEY",
    });
  });

  it("the shared checks still apply to the sign-in route: the default route's problems come through", () => {
    const withSignInNamed = { ...resendOnly, EMAIL_SIGN_IN_PROVIDER: "resend" };
    expect(emailRoutesOf({ ...withSignInNamed, EMAIL_PROVIDER: undefined })).toEqual({
      kind: "missing",
      missing: ["EMAIL_PROVIDER"],
    });
    const offHost = emailRoutesOf({
      ...withSignInNamed,
      EMAIL_FROM_ADDRESS: "noreply@mail.attacker.example",
    });
    expect(offHost.kind).toBe("invalid");
    expect(JSON.stringify(offHost)).not.toContain(RESEND_KEY);
  });
});

/**
 * Oleksii, 2026-10-20 (inbox PW1-Q4), verbatim: "PW1-Q4: (a). Lock auth emails (sign-in,
 * invite, reset, password changed) to Resend in config, with a test that a Brevo setting is
 * refused for them. Note: the Brevo keys are already revoked, so this makes the current state
 * explicit. The full Brevo removal stays planned for after the 14 Nov check."
 *
 * Every route this config builds carries auth emails (`production-mail.ts`: the invite on one,
 * the magic link, the reset link and «пароль змінено» on the other), so a Brevo setting on
 * either variable is refused, with Brevo's own key present, and never falls back to Resend.
 * The reasons are transcribed, not built from the module's constant.
 */
describe("PW1-Q4: a Brevo setting is refused for the auth emails, on both variables", () => {
  const DEFAULT_LOCKED =
    "EMAIL_PROVIDER must be resend: every email it routes is an auth email, and auth emails go through resend only";
  const SIGN_IN_LOCKED =
    "EMAIL_SIGN_IN_PROVIDER must be unset or resend: every email it routes is an auth email, and auth emails go through resend only";
  const RESEND_KEY = "resend-key-SECRET-4567";
  const BREVO_KEY = "brevo-key-SECRET-0123";
  const POSTMARK_KEY = "postmark-key-SECRET-89";
  /** Production's shape with every provider's key present, so only the lock can refuse. */
  const everyKey = {
    EMAIL_PROVIDER: "resend",
    RESEND_API_KEY: RESEND_KEY,
    BREVO_API_KEY: BREVO_KEY,
    POSTMARK_API_KEY: POSTMARK_KEY,
    EMAIL_FROM_ADDRESS: "noreply@mail.example.org",
    EMAIL_FROM_NAME: "Реєстр",
    EMAIL_REPLY_TO: "hello@example.org",
    PRODUCTION_ORIGIN: "https://example.org",
  };
  const leaksNoKey = (result: unknown) => {
    for (const key of [RESEND_KEY, BREVO_KEY, POSTMARK_KEY])
      expect(JSON.stringify(result)).not.toContain(key);
  };

  it("EMAIL_PROVIDER=brevo (the invite, and sign-in by default): refused, naming the variable", () => {
    const env = { ...everyKey, EMAIL_PROVIDER: "brevo" };
    expect(emailProviderConfigOf(env)).toEqual({ kind: "invalid", reason: DEFAULT_LOCKED });
    expect(emailRoutesOf(env)).toEqual({ kind: "invalid", reason: DEFAULT_LOCKED });
    // Naming Resend for sign-in doesn't rescue the invite's route.
    expect(emailRoutesOf({ ...env, EMAIL_SIGN_IN_PROVIDER: "resend" })).toEqual({
      kind: "invalid",
      reason: DEFAULT_LOCKED,
    });
    leaksNoKey(emailRoutesOf(env));
  });

  it("EMAIL_SIGN_IN_PROVIDER=brevo (sign-in, reset, password changed): refused, never the default route", () => {
    const result = emailRoutesOf({ ...everyKey, EMAIL_SIGN_IN_PROVIDER: "brevo" });
    expect(result).toEqual({ kind: "invalid", reason: SIGN_IN_LOCKED });
    leaksNoKey(result);
    // Named before the default route, as a half-done switch is: refused even with nothing else set.
    expect(emailRoutesOf({ EMAIL_SIGN_IN_PROVIDER: "brevo", BREVO_API_KEY: BREVO_KEY })).toEqual({
      kind: "invalid",
      reason: SIGN_IN_LOCKED,
    });
  });

  it("Postmark, never configured, is refused by the same lock on either variable", () => {
    expect(emailRoutesOf({ ...everyKey, EMAIL_PROVIDER: "postmark" })).toEqual({
      kind: "invalid",
      reason: DEFAULT_LOCKED,
    });
    expect(emailRoutesOf({ ...everyKey, EMAIL_SIGN_IN_PROVIDER: "postmark" })).toEqual({
      kind: "invalid",
      reason: SIGN_IN_LOCKED,
    });
  });

  it("Resend on both variables, with the other keys present, is configured: the lock refuses nothing else", () => {
    const result = emailRoutesOf({ ...everyKey, EMAIL_SIGN_IN_PROVIDER: "resend" });
    expect(result.kind).toBe("configured");
    if (result.kind !== "configured") return;
    expect(result.routes.invite).toMatchObject({ provider: "resend", apiKey: RESEND_KEY });
    expect(result.routes.signIn).toEqual(result.routes.invite);
  });
});

describe("blockedStatusOf (IN-E7): Brevo's transactional block list, asked before a send", () => {
  type Contact = { email: string; reason: { code: string } };
  const page = (contacts: Contact[], count = contacts.length) =>
    new Response(JSON.stringify({ count, contacts }), { status: 200 });
  const blocked = (email: string, code = "unsubscribedViaEmail"): Contact => ({
    email,
    reason: { code },
  });
  const others = (n: number, from = 0) =>
    Array.from({ length: n }, (_, i) => blocked(`other${from + i}@example.org`, "hardBounce"));
  const pages = (...responses: (() => Response)[]) => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const next = responses[calls.length - 1];
      if (next === undefined) throw new Error("no more pages");
      return next();
    }) as unknown as typeof fetch;
    return { calls, fetchImpl };
  };

  it("asks Brevo's documented endpoint with the key, a GET, and never the address", async () => {
    const { calls, fetchImpl } = pages(() => page([]));
    await blockedStatusOf(config("brevo"), "olena@example.org", fetchImpl);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      "https://api.brevo.com/v3/smtp/blockedContacts?limit=100&offset=0&sort=desc",
    );
    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.init.headers).toMatchObject({ "api-key": "key-123" });
    expect(calls[0]?.url).not.toContain("olena");
  });

  it("finds the address case-insensitively and maps each documented reason", async () => {
    const cases = {
      unsubscribedViaEmail: "unsubscribed",
      unsubscribedViaApi: "unsubscribed",
      unsubscribedViaMA: "unsubscribed",
      hardBounce: "hard_bounce",
      contactFlaggedAsSpam: "spam_complaint",
      adminBlocked: "admin_blocked",
      somethingNew: "admin_blocked",
    } as const;
    for (const [code, reason] of Object.entries(cases)) {
      const { fetchImpl } = pages(() => page([blocked("Olena@Example.org", code)]));
      expect(
        await blockedStatusOf(config("brevo"), " olena@example.org ", fetchImpl),
        code,
      ).toEqual({
        kind: "blocked",
        reason,
      });
    }
  });

  it("is not_blocked when a short page ends the list without the address", async () => {
    const { calls, fetchImpl } = pages(() => page(others(3)));
    expect(await blockedStatusOf(config("brevo"), "olena@example.org", fetchImpl)).toEqual({
      kind: "not_blocked",
    });
    expect(calls).toHaveLength(1);
  });

  it("pages on to find the address past the first page", async () => {
    const { calls, fetchImpl } = pages(
      () => page(others(BLOCKED_PAGE_SIZE), 101),
      () => page([blocked("olena@example.org")], 101),
    );
    expect(await blockedStatusOf(config("brevo"), "olena@example.org", fetchImpl)).toEqual({
      kind: "blocked",
      reason: "unsubscribed",
    });
    expect(calls[1]?.url).toContain("offset=100");
  });

  it("stops at the count when the last page is exactly full", async () => {
    const { calls, fetchImpl } = pages(() => page(others(BLOCKED_PAGE_SIZE), BLOCKED_PAGE_SIZE));
    expect((await blockedStatusOf(config("brevo"), "olena@example.org", fetchImpl)).kind).toBe(
      "not_blocked",
    );
    expect(calls).toHaveLength(1);
  });

  it("answers unknown, never not_blocked, past the page limit", async () => {
    const total = BLOCKED_PAGE_SIZE * (BLOCKED_MAX_PAGES + 1);
    const full = Array.from(
      { length: BLOCKED_MAX_PAGES },
      (_, n) => () => page(others(BLOCKED_PAGE_SIZE, n * BLOCKED_PAGE_SIZE), total),
    );
    const { calls, fetchImpl } = pages(...full);
    expect(await blockedStatusOf(config("brevo"), "olena@example.org", fetchImpl)).toEqual({
      kind: "unknown",
      why: "list_too_long",
    });
    expect(calls).toHaveLength(BLOCKED_MAX_PAGES);
  });

  it("answers unknown on a refusal, a throw, or a body of the wrong shape", async () => {
    const bad = [
      () => new Response("{}", { status: 401 }),
      () => {
        throw new TypeError("network");
      },
      () => new Response("not json", { status: 200 }),
      () => new Response(JSON.stringify({ count: 1 }), { status: 200 }),
    ];
    for (const respond of bad) {
      const { fetchImpl } = pages(respond);
      expect(await blockedStatusOf(config("brevo"), "a@example.org", fetchImpl)).toEqual({
        kind: "unknown",
        why: "provider_error",
      });
    }
  });

  describe("one deadline for the whole lookup (review of 5f9e7c4, finding 2)", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    /** A fetch that answers after `delayMs` (fake time) and, like the real one, rejects when its signal aborts. */
    const slow = (delayMs: number, respond: (call: number) => Response) => {
      const signals: (AbortSignal | null | undefined)[] = [];
      const fetchImpl = ((_url: string, init: RequestInit) => {
        signals.push(init.signal);
        const call = signals.length - 1;
        return new Promise<Response>((resolve, reject) => {
          const timer = Number.isFinite(delayMs)
            ? setTimeout(() => resolve(respond(call)), delayMs)
            : undefined;
          init.signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new DOMException("aborted", "AbortError"));
          });
        });
      }) as unknown as typeof fetch;
      return { signals, fetchImpl };
    };
    const fullPage = (call: number) =>
      page(
        others(BLOCKED_PAGE_SIZE, call * BLOCKED_PAGE_SIZE),
        BLOCKED_PAGE_SIZE * (BLOCKED_MAX_PAGES + 1),
      );

    // The literal 5s, not the constant: a deadline quietly raised to a minute must turn this red.
    it("a lookup that hangs is unknown (timed_out) at five seconds, not before", async () => {
      vi.useFakeTimers();
      const { fetchImpl } = slow(Number.POSITIVE_INFINITY, fullPage);
      let settled: unknown = "pending";
      void blockedStatusOf(config("brevo"), "a@example.org", fetchImpl).then((status) => {
        settled = status;
      });
      await vi.advanceTimersByTimeAsync(4_999);
      expect(settled).toBe("pending");
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toEqual({ kind: "unknown", why: "timed_out" });
    });

    it("pages that are each fast enough still stop at the shared deadline", async () => {
      // 2s per page: under any per-page timeout, so only a deadline over the
      // whole lookup stops this at page 3 instead of reading all five.
      vi.useFakeTimers();
      const { signals, fetchImpl } = slow(2_000, fullPage);
      const result = blockedStatusOf(config("brevo"), "olena@example.org", fetchImpl);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(await result).toEqual({ kind: "unknown", why: "timed_out" });
      expect(signals).toHaveLength(3);
      expect(new Set(signals).size).toBe(1);
    });

    it("a body still arriving when the deadline fires is timed_out, not a provider error", async () => {
      vi.useFakeTimers();
      // Headers at 1s; the body only finishes reading when the shared signal aborts it.
      const fetchImpl = (async (_url: string, init: RequestInit) => {
        const signal = init.signal as AbortSignal;
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        return {
          ok: true,
          json: () =>
            new Promise((_resolve, reject) => {
              signal.addEventListener("abort", () => reject(new Error("aborted")));
            }),
        } as unknown as Response;
      }) as unknown as typeof fetch;
      const result = blockedStatusOf(config("brevo"), "a@example.org", fetchImpl);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(await result).toEqual({ kind: "unknown", why: "timed_out" });
    });

    it("an answer inside the deadline is kept, and leaves no timer behind", async () => {
      vi.useFakeTimers();
      const { fetchImpl } = slow(1_000, () => page([blocked("olena@example.org", "hardBounce")]));
      const result = blockedStatusOf(config("brevo"), "olena@example.org", fetchImpl);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(await result).toEqual({ kind: "blocked", reason: "hard_bounce" });
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  it("answers unknown for a provider whose list this doesn't read, without calling it", async () => {
    const { calls, fetchImpl } = pages();
    expect(await blockedStatusOf(config("postmark"), "a@example.org", fetchImpl)).toEqual({
      kind: "unknown",
      why: "unsupported_provider",
    });
    expect(calls).toHaveLength(0);
  });

  /**
   * Oleksii, 2026-10-15, verbatim: "Resend sends show the block-list check
   * as "not checked" for now; scanning Resend's suppression list is a
   * follow-up." Its own reason: Resend does filter, on a list we don't read.
   */
  it("answers unknown (provider_suppresses) for Resend, without calling anyone", async () => {
    const { calls, fetchImpl } = pages();
    expect(await blockedStatusOf(config("resend"), "a@example.org", fetchImpl)).toEqual({
      kind: "unknown",
      why: "provider_suppresses",
    });
    expect(calls).toHaveLength(0);
  });
});

/**
 * Oleksii, 2026-10-14, answer 4, verbatim: "Cache the Brevo blocked list for a
 * few minutes. Cap the pages read; on hitting the cap, return a typed
 * "incomplete" result, not a partial "none blocked". If Brevo is unreachable
 * or errors, return a typed "unknown", never an empty list. Tests: Brevo error
 * → unknown; cap hit → incomplete."
 */
describe("cachedBlockList: the registry's read of the whole block list (answer 4)", () => {
  const T0 = new Date("2026-10-14T10:00:00.000Z");
  const at = (ms: number) => new Date(T0.getTime() + ms);
  const contact = (email: string, code = "unsubscribedViaEmail") => ({ email, reason: { code } });
  const page = (contacts: unknown[], count = contacts.length) =>
    new Response(JSON.stringify({ count, contacts }), { status: 200 });
  const filler = (n: number, from = 0) =>
    Array.from({ length: n }, (_, i) => contact(`other${from + i}@example.org`, "hardBounce"));
  /** A fetch that answers each call with the next responder, and counts the calls. */
  const brevo = (respond: (call: number) => Response | Promise<Response>) => {
    let calls = 0;
    const fetchImpl = (async () => respond(calls++)) as unknown as typeof fetch;
    return { fetchImpl, calls: () => calls };
  };

  it("Brevo error → unknown, never an empty list", async () => {
    for (const respond of [
      () => new Response("{}", { status: 500 }),
      () => new Response("{}", { status: 401 }),
      () => {
        throw new TypeError("unreachable");
      },
      () => new Response("not json", { status: 200 }),
    ]) {
      const { fetchImpl } = brevo(respond);
      const read = await cachedBlockList(config("brevo"), { fetchImpl }).read(T0);
      expect(read).toEqual({ kind: "unknown", why: "provider_error" });
      expect(read).not.toHaveProperty("entries");
    }
  });

  it("cap hit → incomplete, carrying what the read pages showed, after exactly the capped pages", async () => {
    const total = BLOCKED_PAGE_SIZE * (BLOCKED_MAX_PAGES + 2);
    const { fetchImpl, calls } = brevo((n) =>
      n === 0
        ? page([contact("Olena@Example.org"), ...filler(BLOCKED_PAGE_SIZE - 1)], total)
        : page(filler(BLOCKED_PAGE_SIZE, n * BLOCKED_PAGE_SIZE), total),
    );
    const read = await cachedBlockList(config("brevo"), { fetchImpl }).read(T0);
    expect(read.kind).toBe("incomplete");
    if (read.kind !== "incomplete") return;
    expect(read.pagesRead).toBe(BLOCKED_MAX_PAGES);
    expect(read.readAt).toEqual(T0);
    expect(read.entries.get("olena@example.org")).toBe("unsubscribed");
    expect(read.entries.size).toBe(BLOCKED_PAGE_SIZE * BLOCKED_MAX_PAGES);
    expect(calls()).toBe(BLOCKED_MAX_PAGES);
  });

  it("a list that ends inside the cap is complete, every address keyed lowercased", async () => {
    const { fetchImpl } = brevo(() => page([contact("A@Example.org", "contactFlaggedAsSpam")]));
    const read = await cachedBlockList(config("brevo"), { fetchImpl }).read(T0);
    expect(read).toEqual({
      kind: "complete",
      readAt: T0,
      entries: new Map([["a@example.org", "spam_complaint"]]),
    });
  });

  // The literal three minutes, not the constant: a cache quietly raised to an hour must turn this red.
  it("reuses a read for three minutes by the caller's clock, then reads again", async () => {
    expect(BLOCK_LIST_CACHE_MS).toBe(3 * 60_000);
    const { fetchImpl, calls } = brevo(() => page([]));
    const list = cachedBlockList(config("brevo"), { fetchImpl });
    await list.read(T0);
    expect((await list.read(at(3 * 60_000 - 1))).kind).toBe("complete");
    expect(calls()).toBe(1);
    const again = await list.read(at(3 * 60_000));
    expect(calls()).toBe(2);
    expect(again.kind === "complete" && again.readAt).toEqual(at(3 * 60_000));
  });

  it("never caches an unknown: the next load asks again", async () => {
    const { fetchImpl, calls } = brevo((n) =>
      n === 0 ? new Response("{}", { status: 503 }) : page([contact("a@example.org")]),
    );
    const list = cachedBlockList(config("brevo"), { fetchImpl });
    expect((await list.read(T0)).kind).toBe("unknown");
    expect((await list.read(at(1))).kind).toBe("complete");
    expect(calls()).toBe(2);
  });

  it("does not trust a read stamped after `now` (a clock that moved back)", async () => {
    const { fetchImpl, calls } = brevo(() => page([]));
    const list = cachedBlockList(config("brevo"), { fetchImpl });
    await list.read(T0);
    await list.read(at(-1));
    expect(calls()).toBe(2);
  });

  it("shares one read between requests that arrive while it is in flight", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { fetchImpl, calls } = brevo(async () => {
      await gate;
      return page([]);
    });
    const list = cachedBlockList(config("brevo"), { fetchImpl });
    const both = Promise.all([list.read(T0), list.read(T0)]);
    release();
    const [a, b] = await both;
    expect(a).toBe(b);
    expect(calls()).toBe(1);
  });

  it("is unknown without calling anyone for a provider whose list this doesn't read", async () => {
    const { fetchImpl, calls } = brevo(() => page([]));
    expect(await cachedBlockList(config("postmark"), { fetchImpl }).read(T0)).toEqual({
      kind: "unknown",
      why: "unsupported_provider",
    });
    expect(calls()).toBe(0);
  });

  /**
   * The invite route on Resend (EM-B10): the registry's view gives the reason
   * a Resend-routed send gives (`blockedStatusOf`), never an empty list and
   * never "no list exists": Resend filters, on a list this doesn't read yet
   * (EM-F1).
   */
  it("is unknown (provider_suppresses) for Resend, as a Resend send's check is, without calling anyone", async () => {
    const { fetchImpl, calls } = brevo(() => page([]));
    const resend = cachedBlockList(config("resend"), { fetchImpl });
    for (const now of [T0, at(BLOCK_LIST_CACHE_MS * 2)]) {
      expect(await resend.read(now)).toEqual({ kind: "unknown", why: "provider_suppresses" });
    }
    expect(await blockedStatusOf(config("resend"), "a@example.org", fetchImpl)).toEqual({
      kind: "unknown",
      why: "provider_suppresses",
    });
    expect(calls()).toBe(0);
  });

  it("a read past the deadline is unknown (timed_out), not an empty list", async () => {
    const fetchImpl = ((_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("a", "AbortError")));
      })) as unknown as typeof fetch;
    const read = await cachedBlockList(config("brevo"), { fetchImpl, deadlineMs: 20 }).read(T0);
    expect(read).toEqual({ kind: "unknown", why: "timed_out" });
  }, 2_000);
});
