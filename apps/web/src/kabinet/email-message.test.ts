import { uk } from "@opika/i18n";
import { describe, expect, it } from "vitest";
import { emailBody, invitationEmail, looksLikeUrl, magicLinkEmail } from "./email-message";
import { fetchEmailSender } from "./email-provider";

/**
 * IN-E8 (Oleksii, 2026-10-14): in HTML the link text is a label, never a
 * URL; the plain-text part keeps the raw URL, unrewritten in what we send.
 */

/** The text inside every `<a>` of an HTML part. */
export const anchorTexts = (html: string) =>
  [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => match[1] ?? "");

const SIGN_IN_URL = "https://example.org/kabinet/vkhid/pidtverdzhennia?token=abc&x=1";
const INVITE_URL =
  "https://example.org/kabinet/vkhid?zaproshennia=0ec0ec0e-0000-4000-8000-000000000009";

/** Hosts Brevo's click and open tracking use (IN-E8, IN-E10): none may appear in what we send. */
const TRACKER = /sendibt\d*\.com|sender-sib|\/tr\/(cl|op)\//i;

const builders = {
  "magic link": () => magicLinkEmail({ to: "a@example.org", url: SIGN_IN_URL, ttlMinutes: 15 }),
  invitation: () =>
    invitationEmail({
      to: "a@example.org",
      url: INVITE_URL,
      shelterName: "Притулок «Лапа»",
      operatorName: "Олексій",
      ttlHours: 72,
    }),
};

describe("looksLikeUrl", () => {
  it("catches a scheme, www., or a bare domain anywhere in the label; lets a sentence with punctuation through", () => {
    for (const url of [
      "https://example.org/x",
      "  http://a.b ",
      "www.example.org",
      "example.org",
      "opika.org.ua/kabinet",
      "mailto://x",
      // Anywhere in the label, not only at its start (review of 5f9e7c4, finding 3).
      "Перейти на opika.org.ua",
      "Відкрийте www.приклад",
      "Open https://example.org now",
      "Написати: mailto:hello@example.org",
      "See example.org/x.",
      "Сторінка (opika.org.ua)",
      "Перейти на приклад.укр",
    ]) {
      expect(looksLikeUrl(url), url).toBe(true);
    }
    for (const label of [
      "Відкрити сторінку входу",
      uk.kabinet.email.signIn.action,
      uk.kabinet.email.invite.action,
      "Open the page.",
      "Відкрити сторінку входу.",
      "Прийняти запрошення (72 год.)",
      "Увійти — це просто! Далі...",
      "Sign in, then continue… Done.",
      "Відкрити: сторінка входу; e.g. так",
      "Version 1.2 — open it",
    ]) {
      expect(looksLikeUrl(label), label).toBe(false);
    }
  });
});

describe("emailBody", () => {
  const parts = {
    subject: "S",
    before: ["Intro <b>&"],
    link: { label: "Open", url: SIGN_IN_URL },
    after: ["Bye"],
  };

  it("labels the HTML link and puts the raw URL on its own line in the text part", () => {
    const email = emailBody("a@example.org", parts);
    expect(anchorTexts(email.html)).toEqual(["Open"]);
    expect(email.html).toContain(`href="${SIGN_IN_URL.replace("&", "&amp;")}"`);
    expect(email.text.split("\n")).toContain(SIGN_IN_URL);
    expect(email.html).toContain("Intro &lt;b&gt;&amp;");
  });

  it("refuses a link whose label is a URL", () => {
    expect(() =>
      emailBody("a@example.org", { ...parts, link: { label: SIGN_IN_URL, url: SIGN_IN_URL } }),
    ).toThrow(/label, never a URL/);
  });
});

describe.each(Object.entries(builders))("the %s email", (name, build) => {
  it("labels its one HTML link with copy, never a URL", () => {
    const texts = anchorTexts(build().html);
    expect(texts).toHaveLength(1);
    for (const text of texts) expect(looksLikeUrl(text), text).toBe(false);
  });

  it("is sent to Brevo with the exact raw URL in textContent, no tracker host anywhere, and a label as the anchor text", async () => {
    const email = build();
    // Known per builder, never read back out of what it built.
    const url = name === "magic link" ? SIGN_IN_URL : INVITE_URL;
    let body: { textContent: string; htmlContent: string } | null = null;
    const capture = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ messageId: "m" }), { status: 201 });
    }) as unknown as typeof fetch;
    await fetchEmailSender(
      { provider: "brevo", apiKey: "k", fromAddress: "noreply@mail.example.org", fromName: "N" },
      capture,
    ).send(email);
    const sent = body as unknown as { textContent: string; htmlContent: string };
    expect(sent.textContent.split("\n")).toContain(url);
    expect(sent.textContent).not.toMatch(TRACKER);
    expect(sent.htmlContent).not.toMatch(TRACKER);
    for (const text of anchorTexts(sent.htmlContent)) expect(looksLikeUrl(text), text).toBe(false);
  });
});

describe("the builders fill their copy", () => {
  it("magic link: the sign-in label and the TTL", () => {
    const email = builders["magic link"]();
    expect(email.subject).toBe(uk.kabinet.email.signIn.subject);
    expect(anchorTexts(email.html)).toEqual([uk.kabinet.email.signIn.action]);
    expect(email.text).toContain("15 minutes");
    expect(email.text).not.toContain("{minutes}");
  });

  it("invitation: the invite label, the shelter, the operator and the hours", () => {
    const email = builders.invitation();
    expect(anchorTexts(email.html)).toEqual([uk.kabinet.email.invite.action]);
    expect(email.text).toContain("Притулок «Лапа»");
    expect(email.text).toContain("Олексій");
    expect(email.text).toContain("72 hours");
    expect(email.text).not.toMatch(/\{\w+\}/);
  });
});
