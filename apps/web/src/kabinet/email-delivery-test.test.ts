import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type DeliveryRouting,
  deliveryKeysOf,
  deliveryLockRefusalOf,
  deliveryProviderOf,
  readSingleKey,
  runDeliveryTest,
} from "./email-delivery-test";

/** Brevo's key, present in the lock's tests so only the lock can refuse; never sent anywhere. */
const KEY = "test-key-not-real-0123456789";
const RESEND_KEY = "re_test-key-not-real-9876543210";

type Call = { url: string; init: RequestInit };

const resendOk = (id: string) =>
  new Response(JSON.stringify({ id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

/** Every request the run makes, sends or not, so "only the two sends" is checkable. */
const harness = (respond: (n: number) => Response = (n) => resendOk(`re-msg-${n}`)) => {
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
    // Neither provider named and no Brevo key: the default, both through Resend, as the
    // script runs it (EM-B10), and since PW1-Q4 the only routing there is.
    input: {
      to: "someone@example.com",
      resendApiKey: RESEND_KEY as string | undefined,
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

const bodyOf = (call: Call) => JSON.parse(call.init.body as string);

/**
 * Delivery test 5 (Oleksii, 2026-10-15, inbox EM-B9, verbatim: "Run delivery test 5 with both
 * emails via Resend and report the invite's tab.") and his decision on it (EM-B10, verbatim:
 * "Decision: invites move to Resend; retire Brevo."): both emails through Resend, the invite as
 * production's default route, with neither provider named.
 */
describe("runDeliveryTest: both emails through Resend", () => {
  it("sends the magic-link email, then the invite, to Resend from noreply@mail.<origin host>", async () => {
    const h = harness();
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
      // Every email carries the configured Reply-To (Oleksii, 2026-10-14, answer 5).
      expect(body.reply_to).toBe("hello@example.org");
      expect(body.to).toEqual(["someone@example.com"]);
    }
    const [signIn, invite] = h.calls.map(bodyOf);
    expect(signIn.text).toContain(
      "http://localhost:3000/kabinet/vkhid/pidtverdzhennia?token=TEST-r1",
    );
    expect(signIn.html).toContain(
      'href="http://localhost:3000/kabinet/vkhid/pidtverdzhennia?token=TEST-r1"',
    );
    expect(invite.text).toContain("http://localhost:3000/kabinet/vkhid?zaproshennia=TEST-r2");
    expect(invite.html).toContain(
      'href="http://localhost:3000/kabinet/vkhid?zaproshennia=TEST-r2"',
    );
    // IN-E8: the HTML link's text is the label, never the URL; the
    // plain-text part keeps the raw URL on its own line.
    const anchors = (html: string) =>
      [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => match[1]);
    expect(anchors(signIn.html)).toEqual(["Відкрити сторінку входу"]);
    expect(anchors(invite.html)).toEqual(["Створити пароль"]);
    // IN-E15: the final Ukrainian through the real templates, transcribed from
    // Oleksii's answer sheet (2026-10-14), with the real TTLs, the fictional
    // shelter and the configured operator name filled in.
    expect(signIn.subject).toBe("Посилання для входу до кабінету притулку");
    expect(signIn.text).toBe(
      [
        "Добрий день. На цю адресу запитали посилання для входу до кабінету притулку.",
        "http://localhost:3000/kabinet/vkhid/pidtverdzhennia?token=TEST-r1",
        "Посилання спрацює один раз і діє 15 хвилин.",
        "Якщо ви цього не запитували, просто проігноруйте лист: без посилання нічого не відбудеться.\n— Олексій",
      ].join("\n\n"),
    );
    expect(invite.subject).toBe("Ваш доступ до кабінету притулку");
    expect(invite.text).toBe(
      [
        "Добрий день. Відкриваю для цієї адреси доступ до кабінету притулку «Тестовий» на сайті Opika.",
        "У кабінеті ви бачите дані притулку — і те, що бачать люди, і дані з перевірки. Контакти, речення на картках і картки тварин ви змінюєте самі. Ті, хто шукає тварину, побачать їх, щойно притулок пройде перевірку. Посилання на збір запрацює, щойно я його перевірю. Щоб змінити дані з перевірки — юридичну особу, ЄДРПОУ чи адресу, — напишіть мені.",
        "http://localhost:3000/kabinet/vkhid?zaproshennia=TEST-r2",
        "Запрошення діє 72 години. Якщо не встигнете — я надішлю нове.",
        "Якщо ви не чекали цього листа, просто проігноруйте його і нікому не пересилайте: це посилання один раз дає змогу створити пароль для цієї адреси, поки запрошення діє.\n— Олексій",
      ].join("\n\n"),
    );
    expect(invite.html).toContain("<br>— Олексій</p>");
    expect(signIn.html).toContain("<br>— Олексій</p>");
  });

  it("sends both with exactly Resend's six fields: no headers, tags or List-Unsubscribe, on the bytes that went out", async () => {
    const h = harness();
    await runDeliveryTest(h.input);
    expect(h.calls).toHaveLength(2);
    for (const call of h.calls) {
      expect(Object.keys(bodyOf(call)).sort()).toEqual(
        ["from", "html", "reply_to", "subject", "text", "to"].sort(),
      );
      expect(`${JSON.stringify(call.init.headers)}${call.init.body}`).not.toMatch(
        /List-Unsubscribe|"headers"|"tags"|"topic_id"/,
      );
    }
  });

  it("signs both emails with the catalogue fallback when no operator name is configured", async () => {
    for (const operatorName of [undefined, "", "  "]) {
      const h = harness();
      expect(await runDeliveryTest({ ...h.input, operatorName })).toBe(0);
      const [signIn, invite] = h.calls.map(bodyOf);
      // Round 2, answer 6, verbatim: "Email signature fallback: capitalise it → «— Адміністратор сайту»."
      expect(signIn.text.endsWith("\n— Адміністратор сайту"), String(operatorName)).toBe(true);
      expect(invite.text.endsWith("\n— Адміністратор сайту"), String(operatorName)).toBe(true);
    }
  });

  /** The rerun Oleksii asked for (2026-10-14, action c): both emails signed with the name set. */
  it("signs both emails with the name given, as --operator-name passes it", async () => {
    const h = harness();
    expect(await runDeliveryTest({ ...h.input, operatorName: "Олексій Колотенко" })).toBe(0);
    for (const body of h.calls.map(bodyOf)) {
      expect(body.text.endsWith("\n— Олексій Колотенко")).toBe(true);
      expect(body.html).toContain("<br>— Олексій Колотенко</p>");
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

  it("prints the provider, status and message id of each send, and nothing of the key or the request", async () => {
    const h = harness();
    await runDeliveryTest(h.input);
    expect(h.lines).toEqual([
      "magic link: resend, status 200, message id re-msg-1",
      "invite: resend, status 200, message id re-msg-2",
    ]);
    const output = h.lines.join("\n");
    expect(output).not.toContain(RESEND_KEY);
    expect(output).not.toContain("TEST-");
  });

  it("reports a failed send with the provider and status, never the key, and exits non-zero", async () => {
    const h = harness((n) =>
      n === 1
        ? new Response(JSON.stringify({ message: RESEND_KEY }), { status: 403 })
        : resendOk("re-msg-2"),
    );
    expect(await runDeliveryTest(h.input)).toBe(1);
    expect(h.calls).toHaveLength(2);
    expect(h.lines[0]).toBe(
      "magic link: resend, FAILED (Email provider resend refused the send (status 403).)",
    );
    expect(h.lines.join("\n")).not.toContain(RESEND_KEY);
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

  it("refuses without RESEND_API_KEY, sending nothing", async () => {
    for (const resendApiKey of [undefined, ""]) {
      const h = harness();
      expect(await runDeliveryTest({ ...h.input, resendApiKey })).toBe(1);
      expect(h.calls).toHaveLength(0);
      expect(h.lines).toEqual([
        "RESEND_API_KEY is not set in the repo-root .env.local. Nothing sent.",
      ]);
    }
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
 * Oleksii, 2026-10-20 (inbox PW1-Q4), verbatim: "PW1-Q4: (a). Lock auth emails (sign-in,
 * invite, reset, password changed) to Resend in config, with a test that a Brevo setting is
 * refused for them." Both emails this test sends are auth emails, so asking for Brevo on either
 * flag is refused by name, Brevo's key present and all, before anything else is checked and
 * with nothing sent. The lines are transcribed, not built from the module.
 */
describe("PW1-Q4: --sign-in-provider brevo and --invite-provider brevo are refused by name", () => {
  const LOCK =
    "refused. Auth emails are locked to Resend (PW1-Q4), so neither email may go through Brevo. Nothing sent.";

  it.each([
    [{ signInProvider: "brevo" as const }, `--sign-in-provider brevo: ${LOCK}`],
    [{ inviteProvider: "brevo" as const }, `--invite-provider brevo: ${LOCK}`],
    [
      { signInProvider: "brevo" as const, inviteProvider: "brevo" as const },
      `--sign-in-provider brevo and --invite-provider brevo: ${LOCK}`,
    ],
  ])("%o: refused with Brevo's key set, nothing sent", async (routing, line) => {
    const h = harness();
    expect(await runDeliveryTest({ ...h.input, ...routing, brevoApiKey: KEY })).toBe(1);
    expect(h.calls).toEqual([]);
    expect(h.lines).toEqual([line]);
    expect(h.lines.join("\n")).not.toContain(KEY);
  });

  it("names the lock even when nothing else would let the run go (no keys, no From name)", async () => {
    const h = harness();
    expect(
      await runDeliveryTest({
        ...h.input,
        inviteProvider: "brevo",
        resendApiKey: undefined,
        fromName: undefined,
      }),
    ).toBe(1);
    expect(h.lines).toEqual([`--invite-provider brevo: ${LOCK}`]);
  });

  it("refuses nothing on Resend: the script's own check, before it reads a key", () => {
    expect(deliveryLockRefusalOf({ signIn: "resend", invite: "resend" })).toBeNull();
    expect(deliveryLockRefusalOf({ signIn: "resend", invite: "brevo" })).toBe(
      `--invite-provider brevo: ${LOCK}`,
    );
  });
});

/**
 * Oleksii, 2026-10-20 (inbox PW1-Q5), verbatim: "PW1-Q5: (b). Keep a sending-only key and drop
 * the domain-reading check from the script. Tracking stays verified by hand: the Resend
 * dashboard shows click and open tracking off, and the links in the received email are plain.
 * Add both as runbook steps for each delivery test."
 */
describe("PW1-Q5: the run reads no domain settings, so a sending-only key is enough", () => {
  it("makes exactly its two sends, even when everything else would answer as a sending-only key does (401)", async () => {
    const calls: string[] = [];
    const sendingOnly = (async (url: string) => {
      calls.push(url);
      return url === "https://api.resend.com/emails"
        ? resendOk(`re-msg-${calls.length}`)
        : new Response(JSON.stringify({ message: "restricted key" }), { status: 401 });
    }) as unknown as typeof fetch;
    const h = harness();
    expect(await runDeliveryTest({ ...h.input, fetchImpl: sendingOnly })).toBe(0);
    expect(calls).toEqual(["https://api.resend.com/emails", "https://api.resend.com/emails"]);
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
