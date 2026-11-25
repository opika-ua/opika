import { uk } from "@opika/i18n";
import { describe, expect, it } from "vitest";
import { type EmailProviderConfig, fetchEmailSender, type OutgoingEmail } from "../email-provider";
import { type ProviderMail, providerMagicLinkSender, providerPasswordMail } from "../email-senders";
import { type RegistrationEmail, registrationEmailFor } from "../registration-email";
import { isKitRegistrationEmail, kitEmail, passwordResetEmail } from "./account-mail";
import { EMAIL_FIXTURES } from "./fixtures";
import { emailModelOf } from "./templates";
import {
  anchorTextsOf,
  BRAND_ASSET_URLS,
  fallbackUrlOf,
  hrefsOf,
  remoteReferenceSetOf,
} from "./test-utils/email-dom";

/**
 * Plan step 3: the five account emails through the kit, on their real send paths. The link each
 * sender is given must go out byte for byte: in the button (the anchor and Outlook's VML), in the
 * fallback line and in the text part. A token mangled anywhere is a sign-in that fails.
 */

/** Reserved characters a token or query can carry; React and the kit both escape `&`. */
const SIGN_IN_URL =
  "https://example.org/kabinet/vkhid/pidtverdzhennia?token=AbC-_9xY%2Bz~0&next=%2Fkabinet&x=1";
const RESET_URL = "https://example.org/kabinet/vkhid/novyi-parol?token=Zz_-9%2F8&x=1";

const FALLBACK = uk.emailLayout.fallbackLink;
const BRAND = [...BRAND_ASSET_URLS].sort();

function capturingMail(): ProviderMail & { sent: OutgoingEmail[] } {
  const sent: OutgoingEmail[] = [];
  return {
    sent,
    sender: {
      send: async (email) => {
        sent.push(email);
        return { status: 200, messageId: "m-1" };
      },
    },
    blockedStatus: async () => ({ kind: "not_blocked" }),
    refuseCopyPending: true,
  };
}

const ROUTE: EmailProviderConfig = {
  provider: "resend",
  apiKey: "k",
  fromAddress: "noreply@mail.example.org",
  fromName: "Кабінет",
  replyTo: "hello@example.org",
};

/** What Resend receives for one email: the body as sent. */
async function resendBodyOf(email: OutgoingEmail): Promise<Record<string, unknown>> {
  let body: Record<string, unknown> = {};
  const capture = (async (_url: string, init: RequestInit) => {
    body = JSON.parse(init.body as string);
    return Response.json({ id: "r-1" });
  }) as unknown as typeof fetch;
  await fetchEmailSender(ROUTE, capture).send(email);
  return body;
}

async function sentSignIn(url: string): Promise<OutgoingEmail> {
  const mail = capturingMail();
  await providerMagicLinkSender(mail, {
    ttlMinutes: 15,
    operatorName: "Олексій",
    log: () => {},
  }).send({ email: "olena@example.org", url });
  const [email] = mail.sent;
  if (email === undefined) throw new Error("nothing sent");
  return email;
}

async function sentReset(url: string): Promise<OutgoingEmail> {
  const mail = capturingMail();
  await providerPasswordMail(mail, {
    ttlMinutes: 60,
    operatorName: "Олексій",
    contact: "hello@example.org",
    log: () => {},
  }).sendReset({ email: "olena@example.org", url });
  const [email] = mail.sent;
  if (email === undefined) throw new Error("nothing sent");
  return email;
}

describe.each([
  ["sign-in link", SIGN_IN_URL, sentSignIn],
  ["password reset", RESET_URL, sentReset],
] as const)("the %s, as its Better Auth callback's sender sends it", (_name, url, send) => {
  it("carries the given URL exactly: button, Outlook button, fallback line and text part", async () => {
    const email = await send(url);
    expect(hrefsOf(email.html)).toEqual([url, url]);
    expect(fallbackUrlOf(email.html, FALLBACK)).toBe(url);
    expect(email.text.split("\n")).toContain(url);
    // Nowhere else, and never a URL as the visible text of a link (IN-E8).
    expect(email.text.split(url)).toHaveLength(2);
    for (const text of anchorTextsOf(email.html)) expect(text).not.toMatch(/^https?:/);
  });

  it("goes out multipart, to the same address, with the Reply-To", async () => {
    const body = await resendBodyOf(await send(url));
    expect(body.to).toEqual(["olena@example.org"]);
    expect(body.reply_to).toBe("hello@example.org");
    expect(String(body.html)).toContain("<h1");
    expect(String(body.text).trim()).not.toBe("");
  });
});

describe("the subjects stay the approved ones", () => {
  it("sign-in and reset", async () => {
    expect((await sentSignIn(SIGN_IN_URL)).subject).toBe(uk.kabinet.email.signIn.subject);
    expect((await sentReset(RESET_URL)).subject).toBe(uk.kabinet.email.reset.subject);
  });

  it.each<[RegistrationEmail, string]>([
    [
      {
        template: "application_confirm",
        name: "Лапа",
        confirmUrl: "https://example.org/kabinet/zaiavka/pidtverdyty?t=a%2Bb&x=1",
        notMeUrl: "https://example.org/kabinet/zaiavka/ne-ya?t=c",
        operatorName: "Олексій",
      },
      "Підтвердіть email для Opika",
    ],
    [
      { template: "application_approved", name: "Лапа", kabinetUrl: "https://example.org/kabinet" },
      "Притулок «Лапа» схвалено",
    ],
    [
      {
        template: "application_rejected",
        name: "Лапа",
        reason: { code: "duplicate_submission", note: null },
        contactEmail: "hello@example.org",
        telegram: "@operator",
      },
      "Заявка притулку «Лапа»",
    ],
  ])("%#: a registration email through the kit", async (input, subject) => {
    const email = await registrationEmailFor(input, "lapa@example.org");
    expect(email.to).toBe("lapa@example.org");
    expect(email.subject).toBe(subject);
    expect(email.html).toContain("<h1");
    expect(email.html).toContain('lang="uk"');
    if (input.template === "application_confirm") {
      expect(hrefsOf(email.html).sort()).toEqual(
        [input.confirmUrl, input.confirmUrl, input.notMeUrl].sort(),
      );
      expect(fallbackUrlOf(email.html, FALLBACK)).toBe(input.confirmUrl);
      expect(email.text.split("\n")).toContain(input.confirmUrl);
    }
    const body = await resendBodyOf(email);
    expect(body.reply_to).toBe("hello@example.org");
  });
});

describe("login_email_changed: the old-address notice (owner, 2026-11-25)", () => {
  it("names the shelter and the new address masked, with no link, and «Якщо це не ви»", async () => {
    const email = await registrationEmailFor(
      {
        template: "login_email_changed",
        shelterName: "Лапа",
        maskedEmail: "u•••9@example.org",
        contact: "hello@example.org",
        operatorName: "Олексій",
      },
      "old-address@example.org",
    );
    expect(email.to).toBe("old-address@example.org");
    expect(email.subject).toBe("Кабінет притулку: пошту для входу змінено");
    expect(email.text).toContain("Адресу для входу в кабінет «Лапа» змінено на u•••9@example.org.");
    expect(email.text).toContain("Якщо це не ви – напишіть мені: hello@example.org");
    expect(email.html).toContain("Адресу для входу змінено");
    expect(hrefsOf(email.html).filter((href) => !href.startsWith("mailto:"))).toEqual([]);
  });
});

describe("the kit keeps IN-E8", () => {
  it("refuses a link whose label reads as a URL, button or secondary link", async () => {
    const model = emailModelOf(EMAIL_FIXTURES.application_confirm);
    for (const kind of ["button", "secondaryLink"] as const) {
      await expect(
        kitEmail("a@example.org", {
          ...model,
          blocks: [{ kind, label: "opika.org.ua/kabinet", url: SIGN_IN_URL }],
        }),
      ).rejects.toThrow(/label, never a URL/);
    }
  });

  it("keeps the operator's registration mails out of the kit for now (plan step 5)", () => {
    expect(
      isKitRegistrationEmail({ template: "registration_cap_hit", count: 1, queueUrl: "x" }),
    ).toBe(false);
  });

  it("the reset builder alone also carries the URL as given", async () => {
    const email = await passwordResetEmail({
      to: "a@example.org",
      url: RESET_URL,
      ttlMinutes: 60,
      operatorName: "Олексій",
    });
    expect(hrefsOf(email.html)).toEqual([RESET_URL, RESET_URL]);
  });
});

/**
 * The owner's rule: a per-recipient parameter can never pass this test. Every reference a client
 * loads without a click, in all five wired mails as their senders build them, is exactly the
 * versioned logo, compared as a whole string (owner, 2026-11-20: no web font, system fonts only).
 */
describe("what the wired mails load without a click", () => {
  const wired: [string, () => Promise<OutgoingEmail>][] = [
    ["sign-in link", () => sentSignIn(SIGN_IN_URL)],
    ["password reset", () => sentReset(RESET_URL)],
    [
      "confirmation",
      () =>
        registrationEmailFor(
          { ...EMAIL_FIXTURES.application_confirm, operatorName: "Олексій" },
          "lapa@example.org",
        ),
    ],
    [
      "approval",
      () => registrationEmailFor(EMAIL_FIXTURES.application_approved, "lapa@example.org"),
    ],
    [
      "rejection",
      () => registrationEmailFor(EMAIL_FIXTURES.application_rejected, "lapa@example.org"),
    ],
  ];

  it.each(wired)("%s: exactly the logo", async (_name, build) => {
    expect(remoteReferenceSetOf((await build()).html)).toEqual(BRAND);
  });

  const [logo] = BRAND_ASSET_URLS;
  /** Each a way a tracker could ride in; every one must change the set. */
  const tampered: [string, (html: string) => string][] = [
    ["the logo with a query", (html) => html.replaceAll(logo, `${logo}?r=1`)],
    ["the logo with a fragment", (html) => html.replaceAll(logo, `${logo}#r`)],
    [
      "a web font through @font-face",
      (html) =>
        html.replace(
          "</style>",
          "@font-face{font-family:'Opika';src:url('https://opika.org.ua/email/opika-ui-v1.woff2')}</style>",
        ),
    ],
    [
      "a stylesheet link",
      (html) =>
        html.replace("</head>", '<link rel="stylesheet" href="https://px.example/f.css"/></head>'),
    ],
    [
      "an extra srcset on the logo",
      (html) => html.replace("<img ", '<img srcset="https://px.example/p.png?u=1 2x" '),
    ],
    [
      "a CSS background url() in an inline style",
      (html) => html.replace('<td style="', '<td style="background:url(https://px.example/b.png);'),
    ],
    [
      "a CSS background url() in the stylesheet",
      (html) =>
        html.replace("</style>", "body{background:url('https://px.example/c.png')}</style>"),
    ],
    [
      "a background attribute",
      (html) => html.replace("<td ", '<td background="https://px.example/d.png" '),
    ],
    [
      "an image inside Outlook's conditional markup",
      (html) =>
        html.replace("<!--[if mso]>", '<!--[if mso]><v:image src="https://px.example/e.png"/>'),
    ],
  ];

  it.each(tampered)("refuses %s", async (_name, tamper) => {
    const html = (await sentSignIn(SIGN_IN_URL)).html;
    const changed = tamper(html);
    expect(changed).not.toBe(html);
    expect(remoteReferenceSetOf(changed)).not.toEqual(BRAND);
  });
});
