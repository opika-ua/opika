import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type DeliveryProvider,
  type DeliveryRouting,
  deliveryKeysOf,
  deliveryProviderOf,
  readSingleKey,
  runDeliveryTest,
} from "./email-delivery-test";

const KEY = "test-key-not-real-0123456789";
const RESEND_KEY = "re_test-key-not-real-9876543210";

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
    // Both through Brevo unless a test says otherwise: the comparison run the
    // grace period keeps (EM-B10). The default, both via Resend, is its own
    // block below, with neither provider named.
    input: {
      to: "someone@example.com",
      signInProvider: "brevo" as DeliveryProvider,
      inviteProvider: "brevo" as DeliveryProvider,
      brevoApiKey: KEY as string | undefined,
      origin: "https://example.org",
      base: "http://localhost:3000/",
      fromName: "Config Name",
      replyTo: "hello@example.org",
      operatorName: "Олексій" as string | undefined,
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

describe("runDeliveryTest, both via Brevo (comparison during the grace period)", () => {
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
      // Every email carries the configured Reply-To (Oleksii, 2026-10-14, answer 5).
      expect(body.replyTo).toEqual({ email: "hello@example.org" });
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
    // IN-E8: the HTML link's text is the label, never the URL; the
    // plain-text part keeps the raw URL on its own line.
    const anchors = (html: string) =>
      [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => match[1]);
    expect(anchors(signIn.htmlContent)).toEqual(["Відкрити сторінку входу"]);
    expect(anchors(invite.htmlContent)).toEqual(["Відкрити запрошення"]);
    // IN-E15: the final Ukrainian through the real templates, transcribed from
    // Oleksii's answer sheet (2026-10-14), with the real TTLs, the fictional
    // shelter and the configured operator name filled in.
    expect(signIn.subject).toBe("Посилання для входу до кабінету притулку");
    expect(signIn.textContent).toBe(
      [
        "Добрий день. На цю адресу запитали посилання для входу до кабінету притулку.",
        "http://localhost:3000/kabinet/vkhid/pidtverdzhennia?token=TEST-r1",
        "Посилання спрацює один раз і діє 15 хвилин.",
        "Якщо ви цього не запитували, просто проігноруйте лист: без посилання нічого не відбудеться.\n— Олексій",
      ].join("\n\n"),
    );
    expect(invite.subject).toBe("Ваш доступ до кабінету притулку");
    expect(invite.textContent).toBe(
      [
        "Добрий день. Відкриваю для цієї адреси доступ до кабінету притулку «Тестовий» на сайті.",
        "Поки що в кабінеті можна переглянути дані притулку — і те, що бачать люди, і дані з перевірки. Змінювати їх там ще не можна — для цього напишіть мені.",
        "http://localhost:3000/kabinet/vkhid?zaproshennia=TEST-r2",
        "Запрошення діє 72 години. Якщо не встигнете — я надішлю нове.",
        "Якщо ви не чекали цього листа, просто проігноруйте його: без входу з цієї адреси доступу ніхто не отримає.\n— Олексій",
      ].join("\n\n"),
    );
    expect(invite.htmlContent).toContain("<br>— Олексій</p>");
    expect(signIn.htmlContent).toContain("<br>— Олексій</p>");
  });

  it("signs both emails with the catalogue fallback when no operator name is configured", async () => {
    for (const operatorName of [undefined, "", "  "]) {
      const h = harness();
      expect(await runDeliveryTest({ ...h.input, operatorName })).toBe(0);
      const [signIn, invite] = h.calls.map(bodyOf);
      // Round 2, answer 6, verbatim: "Email signature fallback: capitalise it → «— Адміністратор сайту»."
      expect(signIn.textContent.endsWith("\n— Адміністратор сайту"), String(operatorName)).toBe(
        true,
      );
      expect(invite.textContent.endsWith("\n— Адміністратор сайту"), String(operatorName)).toBe(
        true,
      );
    }
  });

  /** The rerun Oleksii asked for (2026-10-14, action c): both emails signed with the name set. */
  it("signs both emails with the name given, as --operator-name passes it", async () => {
    const h = harness();
    expect(await runDeliveryTest({ ...h.input, operatorName: "Олексій Колотенко" })).toBe(0);
    for (const body of h.calls.map(bodyOf)) {
      expect(body.textContent.endsWith("\n— Олексій Колотенко")).toBe(true);
      expect(body.htmlContent).toContain("<br>— Олексій Колотенко</p>");
    }
  });

  it("refuses while any email-template string is still pending, sending nothing", async () => {
    const h = harness();
    expect(
      await runDeliveryTest({ ...h.input, pendingTemplateCopy: ["kabinet.email.invite.notYou"] }),
    ).toBe(1);
    expect(h.calls).toHaveLength(0);
    expect(h.lines).toEqual([
      "Email copy still pending (kabinet.email.invite.notYou). Nothing sent.",
    ]);
  });

  it("against the live catalogue, finds no pending template string and sends both", async () => {
    const h = harness();
    expect(await runDeliveryTest(h.input)).toBe(0);
    expect(h.calls).toHaveLength(2);
  });

  it("prints the status and message id of each send, and nothing of the key or the request", async () => {
    const h = harness((n) => okResponse(`<id-${n}@brevo>`));
    await runDeliveryTest(h.input);
    expect(h.lines).toEqual([
      "magic link: brevo, status 201, message id <id-1@brevo>",
      "invite: brevo, status 201, message id <id-2@brevo>",
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
    expect(h.lines[0]).toMatch(/^magic link: brevo, FAILED/);
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
    expect(await runDeliveryTest({ ...h.input, brevoApiKey: undefined })).toBe(1);
    expect(h.calls).toHaveLength(0);
    expect(h.lines).toEqual([
      "BREVO_API_KEY is not set in the repo-root .env.local. Nothing sent.",
    ]);
  });

  it("refuses without a Reply-To, or one off the production host, sending nothing", async () => {
    for (const replyTo of [undefined, "", "hello@attacker.example"]) {
      const h = harness();
      expect(await runDeliveryTest({ ...h.input, replyTo }), String(replyTo)).toBe(1);
      expect(h.calls).toHaveLength(0);
      expect(h.lines[0]).toMatch(/^Not configured: .*EMAIL_REPLY_TO.*Nothing sent\.$/);
    }
  });

  it("refuses a production origin that isn't https, sending nothing", async () => {
    const h = harness();
    expect(await runDeliveryTest({ ...h.input, origin: "http://example.org" })).toBe(1);
    expect(h.calls).toHaveLength(0);
  });
});

/**
 * Delivery test 4 (EM-B6, Oleksii, 2026-10-15: "After a Resend delivery test
 * (sign-in to my Gmail, check the tab), propose whether to move invites too
 * and retire Brevo."): the sign-in email through Resend, the invite through
 * Brevo, as production will route them. A fake fetch stands in for both.
 */
describe("runDeliveryTest --sign-in-provider resend", () => {
  const resendOk = (id: string) =>
    new Response(JSON.stringify({ id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  const routed = () =>
    harness((n) => (n === 1 ? resendOk("re-msg-1") : okResponse("<id-2@brevo>")));

  it("sends the magic link to Resend with its key and the invite to Brevo with its own", async () => {
    const h = routed();
    expect(
      await runDeliveryTest({ ...h.input, signInProvider: "resend", resendApiKey: RESEND_KEY }),
    ).toBe(0);
    expect(h.calls.map((c) => c.url)).toEqual([
      "https://api.resend.com/emails",
      "https://api.brevo.com/v3/smtp/email",
    ]);
    const [signIn, invite] = h.calls as [Call, Call];
    const headers = (call: Call) => call.init.headers as Record<string, string>;
    expect(headers(signIn).Authorization).toBe(`Bearer ${RESEND_KEY}`);
    expect(headers(signIn)["api-key"]).toBeUndefined();
    expect(headers(invite)["api-key"]).toBe(KEY);
    expect(JSON.stringify(headers(invite))).not.toContain(RESEND_KEY);
    // One sender for both: the same From, display name and Reply-To.
    const resendBody = bodyOf(signIn);
    expect(resendBody.from).toBe("Config Name <noreply@mail.example.org>");
    expect(resendBody.reply_to).toBe("hello@example.org");
    expect(bodyOf(invite).sender).toEqual({
      email: "noreply@mail.example.org",
      name: "Config Name",
    });
    expect(resendBody.subject).toBe("Посилання для входу до кабінету притулку");
    // Nothing that makes it bulk mail, on the bytes that went out.
    expect(Object.keys(resendBody).sort()).toEqual(
      ["from", "html", "reply_to", "subject", "text", "to"].sort(),
    );
    expect(`${JSON.stringify(signIn.init.headers)}${signIn.init.body}`).not.toMatch(
      /List-Unsubscribe|"headers"|"tags"|"topic_id"/,
    );
  });

  it("prints the provider, status and id per send, and neither key", async () => {
    const h = routed();
    await runDeliveryTest({ ...h.input, signInProvider: "resend", resendApiKey: RESEND_KEY });
    expect(h.lines).toEqual([
      "magic link: resend, status 200, message id re-msg-1",
      "invite: brevo, status 201, message id <id-2@brevo>",
    ]);
    const output = h.lines.join("\n");
    expect(output).not.toContain(KEY);
    expect(output).not.toContain(RESEND_KEY);
    expect(output).not.toContain("TEST-");
  });

  it("refuses without RESEND_API_KEY when Resend is asked for, sending nothing", async () => {
    for (const resendApiKey of [undefined, ""]) {
      const h = routed();
      expect(await runDeliveryTest({ ...h.input, signInProvider: "resend", resendApiKey })).toBe(1);
      expect(h.calls).toHaveLength(0);
      expect(h.lines).toEqual([
        "RESEND_API_KEY is not set in the repo-root .env.local. Nothing sent.",
      ]);
    }
  });

  it("a Brevo run never needs or sends the Resend key", async () => {
    const h = harness();
    expect(await runDeliveryTest({ ...h.input, signInProvider: "brevo" })).toBe(0);
    expect(h.calls.map((c) => c.url)).toEqual([
      "https://api.brevo.com/v3/smtp/email",
      "https://api.brevo.com/v3/smtp/email",
    ]);
  });

  it("a Resend failure is reported with the provider and status, never the key", async () => {
    const h = harness((n) =>
      n === 1
        ? new Response(JSON.stringify({ message: RESEND_KEY }), { status: 403 })
        : okResponse(),
    );
    expect(
      await runDeliveryTest({ ...h.input, signInProvider: "resend", resendApiKey: RESEND_KEY }),
    ).toBe(1);
    expect(h.lines[0]).toBe(
      "magic link: resend, FAILED (Email provider resend refused the send (status 403).)",
    );
    expect(h.lines.join("\n")).not.toContain(RESEND_KEY);
  });
});

/**
 * Delivery test 5 (Oleksii, 2026-10-15, inbox EM-B9, verbatim: "Run delivery
 * test 5 with both emails via Resend and report the invite's tab.") and his
 * decision on it (EM-B10, verbatim: "Decision: invites move to Resend; retire
 * Brevo."): both emails through Resend, the invite as production's default
 * route, and that is now the run with neither provider named.
 */
describe("runDeliveryTest by default: both via Resend", () => {
  const resendOk = (id: string) =>
    new Response(JSON.stringify({ id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  const bothResend = () => {
    const h = harness((n) => resendOk(`re-msg-${n}`));
    // Neither provider named and no Brevo key: the default, as the script runs it.
    const { signInProvider: _s, inviteProvider: _i, brevoApiKey: _b, ...unnamed } = h.input;
    return { ...h, input: { ...unnamed, resendApiKey: RESEND_KEY } };
  };

  it("sends both emails to Resend with RESEND_API_KEY, needing no Brevo key", async () => {
    const h = bothResend();
    expect(await runDeliveryTest(h.input)).toBe(0);
    expect(h.calls.map((c) => c.url)).toEqual([
      "https://api.resend.com/emails",
      "https://api.resend.com/emails",
    ]);
    for (const call of h.calls) {
      const headers = call.init.headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${RESEND_KEY}`);
      expect(headers["api-key"]).toBeUndefined();
      const body = bodyOf(call);
      expect(body.from).toBe("Config Name <noreply@mail.example.org>");
      expect(body.reply_to).toBe("hello@example.org");
      expect(body.to).toEqual(["someone@example.com"]);
    }
    const [signIn, invite] = h.calls.map(bodyOf);
    expect(signIn.subject).toBe("Посилання для входу до кабінету притулку");
    expect(signIn.text).toContain(
      "http://localhost:3000/kabinet/vkhid/pidtverdzhennia?token=TEST-r1",
    );
    expect(invite.subject).toBe("Ваш доступ до кабінету притулку");
    expect(invite.text).toContain("http://localhost:3000/kabinet/vkhid?zaproshennia=TEST-r2");
    expect(invite.html).toContain(
      'href="http://localhost:3000/kabinet/vkhid?zaproshennia=TEST-r2"',
    );
  });

  it("sends the invite with no headers, tags or List-Unsubscribe, on the bytes that went out", async () => {
    const h = bothResend();
    await runDeliveryTest(h.input);
    const invite = h.calls[1] as Call;
    expect(Object.keys(bodyOf(invite)).sort()).toEqual(
      ["from", "html", "reply_to", "subject", "text", "to"].sort(),
    );
    expect(`${JSON.stringify(invite.init.headers)}${invite.init.body}`).not.toMatch(
      /List-Unsubscribe|"headers"|"tags"|"topic_id"/,
    );
  });

  it("prints resend, the status and the id per send, and never the key", async () => {
    const h = bothResend();
    await runDeliveryTest(h.input);
    expect(h.lines).toEqual([
      "magic link: resend, status 200, message id re-msg-1",
      "invite: resend, status 200, message id re-msg-2",
    ]);
    expect(h.lines.join("\n")).not.toContain(RESEND_KEY);
    expect(h.lines.join("\n")).not.toContain("TEST-");
  });

  it("refuses without RESEND_API_KEY, sending nothing", async () => {
    const h = bothResend();
    expect(await runDeliveryTest({ ...h.input, resendApiKey: undefined })).toBe(1);
    expect(h.calls).toHaveLength(0);
    expect(h.lines).toEqual([
      "RESEND_API_KEY is not set in the repo-root .env.local. Nothing sent.",
    ]);
  });

  /**
   * Was refused while the default route read one generic key (EM-T25). Each
   * provider now has its own key (EM-B10), so production can be configured
   * for it (EMAIL_PROVIDER=resend, EMAIL_SIGN_IN_PROVIDER=brevo) and the test
   * sends it, each email on its own provider's key.
   */
  it("invites via Resend beside sign-in via Brevo: each email on its own provider's key", async () => {
    const h = harness((n) => (n === 1 ? okResponse("<id-1@brevo>") : resendOk("re-msg-2")));
    expect(
      await runDeliveryTest({
        ...h.input,
        signInProvider: "brevo",
        inviteProvider: "resend",
        resendApiKey: RESEND_KEY,
      }),
    ).toBe(0);
    expect(h.calls.map((c) => c.url)).toEqual([
      "https://api.brevo.com/v3/smtp/email",
      "https://api.resend.com/emails",
    ]);
    const [signIn, invite] = h.calls as [Call, Call];
    const headers = (call: Call) => call.init.headers as Record<string, string>;
    expect(headers(signIn)["api-key"]).toBe(KEY);
    expect(JSON.stringify(headers(signIn))).not.toContain(RESEND_KEY);
    expect(headers(invite).Authorization).toBe(`Bearer ${RESEND_KEY}`);
    expect(JSON.stringify(headers(invite))).not.toContain(KEY);
    expect(h.lines).toEqual([
      "magic link: brevo, status 201, message id <id-1@brevo>",
      "invite: resend, status 200, message id re-msg-2",
    ]);
  });

  it("asking for Brevo without BREVO_API_KEY is refused, sending nothing", async () => {
    const h = bothResend();
    expect(await runDeliveryTest({ ...h.input, inviteProvider: "brevo" })).toBe(1);
    expect(h.calls).toHaveLength(0);
    expect(h.lines).toEqual([
      "BREVO_API_KEY is not set in the repo-root .env.local. Nothing sent.",
    ]);
  });
});

describe("deliveryKeysOf: the script reads only the keys the sends need", () => {
  const reads = (routing: DeliveryRouting) => {
    const asked: string[] = [];
    const keys = deliveryKeysOf(routing, (name) => {
      asked.push(name);
      return `value-of-${name}`;
    });
    return { asked, keys };
  };

  it("both via Brevo: BREVO_API_KEY only", () => {
    const { asked, keys } = reads({ signIn: "brevo", invite: "brevo" });
    expect(asked).toEqual(["BREVO_API_KEY"]);
    expect(keys).toEqual({ brevoApiKey: "value-of-BREVO_API_KEY", resendApiKey: undefined });
  });

  it("sign-in via Resend, invite via Brevo: each key once", () => {
    const { asked, keys } = reads({ signIn: "resend", invite: "brevo" });
    expect(asked).toEqual(["BREVO_API_KEY", "RESEND_API_KEY"]);
    expect(keys).toEqual({
      brevoApiKey: "value-of-BREVO_API_KEY",
      resendApiKey: "value-of-RESEND_API_KEY",
    });
  });

  it("invite via Resend, sign-in via Brevo: each key once", () => {
    const { asked, keys } = reads({ signIn: "brevo", invite: "resend" });
    expect(asked).toEqual(["BREVO_API_KEY", "RESEND_API_KEY"]);
    expect(keys).toEqual({
      brevoApiKey: "value-of-BREVO_API_KEY",
      resendApiKey: "value-of-RESEND_API_KEY",
    });
  });

  it("both via Resend: RESEND_API_KEY once, shared, and never Brevo's", () => {
    const { asked, keys } = reads({ signIn: "resend", invite: "resend" });
    expect(asked).toEqual(["RESEND_API_KEY"]);
    expect(keys).toEqual({ brevoApiKey: undefined, resendApiKey: "value-of-RESEND_API_KEY" });
  });
});

describe("deliveryProviderOf (--sign-in-provider, --invite-provider)", () => {
  it("is resend when unset (EM-B10), the provider named when it is one of the two, else null", () => {
    expect(deliveryProviderOf(undefined)).toBe("resend");
    expect(deliveryProviderOf("brevo")).toBe("brevo");
    expect(deliveryProviderOf("resend")).toBe("resend");
    for (const other of ["postmark", "Resend", "", "re_abc"]) {
      expect(deliveryProviderOf(other), other).toBeNull();
    }
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
