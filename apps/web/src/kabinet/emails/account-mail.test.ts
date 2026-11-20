import { uk } from "@opika/i18n";
import { describe, expect, it } from "vitest";
import { type EmailProviderConfig, fetchEmailSender, type OutgoingEmail } from "../email-provider";
import { type ProviderMail, providerMagicLinkSender, providerPasswordMail } from "../email-senders";
import { type RegistrationEmail, registrationEmailFor } from "../registration-email";
import { isKitRegistrationEmail, kitEmail, passwordResetEmail } from "./account-mail";
import { EMAIL_FIXTURES } from "./fixtures";
import { emailModelOf } from "./templates";

/**
 * Plan step 3: the five account emails through the kit, on their real send paths. The link each
 * sender is given must go out byte for byte: in the button (the anchor and Outlook's VML), in the
 * fallback line and in the text part. A token mangled anywhere is a sign-in that fails.
 */

/** Reserved characters a token or query can carry; React and the kit both escape `&`. */
const SIGN_IN_URL =
  "https://example.org/kabinet/vkhid/pidtverdzhennia?token=AbC-_9xY%2Bz~0&next=%2Fkabinet&x=1";
const RESET_URL = "https://example.org/kabinet/vkhid/novyi-parol?token=Zz_-9%2F8&x=1";

const decode = (html: string): string =>
  html
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");

const hrefsOf = (html: string): string[] =>
  [...html.matchAll(/\bhref="([^"]*)"/g)].map((match) => decode(match[1] ?? ""));

/** The URL the fallback line shows, as a reader copies it. */
const fallbackUrlOf = (html: string): string | undefined => {
  const at = html.indexOf(`${uk.emailLayout.fallbackLink} <span`);
  const match = at < 0 ? null : /^[^>]*<span[^>]*>([^<]*)<\/span>/.exec(html.slice(at));
  return match?.[1] === undefined ? undefined : decode(match[1]);
};

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
    expect(fallbackUrlOf(email.html)).toBe(url);
    expect(email.text.split("\n")).toContain(url);
    // Nowhere else, and never a URL as the visible text of a link (IN-E8).
    expect(email.text.split(url)).toHaveLength(2);
    expect(email.html).not.toMatch(/<a\b[^>]*>\s*https?:/);
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
      expect(hrefsOf(email.html)).toEqual([input.confirmUrl, input.confirmUrl, input.notMeUrl]);
      expect(fallbackUrlOf(email.html)).toBe(input.confirmUrl);
      expect(email.text.split("\n")).toContain(input.confirmUrl);
    }
    const body = await resendBodyOf(email);
    expect(body.reply_to).toBe("hello@example.org");
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
