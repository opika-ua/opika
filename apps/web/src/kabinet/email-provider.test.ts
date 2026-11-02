import { describe, expect, it } from "vitest";
import {
  blockedStatusOf,
  blockListReaderOf,
  type EmailProviderConfig,
  emailProviderConfigOf,
  emailRoutesOf,
  fetchEmailSender,
  PROVIDER_KEY_NAMES,
  providerRequest,
} from "./email-provider";

/**
 * IN-Q2: one fetch-based email module, Resend in production. No real
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
});

describe("fetchEmailSender", () => {
  const respond = (status: number, body: unknown) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("resolves on the provider's success", async () => {
    await expect(
      fetchEmailSender(config("resend"), respond(200, { id: "x" })).send(email),
    ).resolves.toEqual({ status: 200, messageId: "x" });
    await expect(
      fetchEmailSender(config("postmark"), respond(200, { ErrorCode: 0, MessageID: "m" })).send(
        email,
      ),
    ).resolves.toEqual({ status: 200, messageId: "m" });
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
    for (const other of [POSTMARK_KEY, "generic-key-never-read"]) {
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
      const { invite, signIn } = configured({ ...resendOnly, ...unset });
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
 * refused for them."
 *
 * Every route this config builds carries auth emails (`production-mail.ts`: the invite on one,
 * the magic link, the reset link and «пароль змінено» on the other), so any other provider
 * on either variable (the removed Brevo included, as an unknown value) is refused, a key for it
 * present or not, and never falls back to Resend. The reasons are transcribed, not built from
 * the module's constant.
 */
describe("PW1-Q4: no route can name a provider but Resend, on both variables (the removed Brevo is refused as unknown)", () => {
  const DEFAULT_LOCKED =
    "EMAIL_PROVIDER must be resend: every email it routes is an auth email, and auth emails go through resend only";
  const SIGN_IN_LOCKED =
    "EMAIL_SIGN_IN_PROVIDER must be unset or resend: every email it routes is an auth email, and auth emails go through resend only";
  const RESEND_KEY = "resend-key-SECRET-4567";
  /** A leftover key for the removed provider: it must never be read, whatever the setting. */
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

/**
 * Oleksii, 2026-10-15, verbatim: "Resend sends show the block-list check as "not checked" for
 * now; scanning Resend's suppression list is a follow-up." Its own reason: Resend does filter,
 * on a list we don't read. No request is made for any provider (Brevo's list reader is gone).
 */
describe("blockedStatusOf (IN-E7) and blockListReaderOf: nothing is read from a provider", () => {
  const T0 = new Date("2026-10-14T10:00:00.000Z");

  it("answers unknown (provider_suppresses) for Resend", () => {
    expect(blockedStatusOf(config("resend"))).toEqual({
      kind: "unknown",
      why: "provider_suppresses",
    });
  });

  it("answers unknown (unsupported_provider) for a provider whose list this doesn't read", () => {
    expect(blockedStatusOf(config("postmark"))).toEqual({
      kind: "unknown",
      why: "unsupported_provider",
    });
  });

  it("the registry's reader is unknown for Resend and for any other provider, never an empty list", async () => {
    expect(await blockListReaderOf(config("resend")).read(T0)).toEqual({
      kind: "unknown",
      why: "provider_suppresses",
    });
    expect(await blockListReaderOf(config("postmark")).read(T0)).toEqual({
      kind: "unknown",
      why: "unsupported_provider",
    });
  });
});
