import { uk } from "@opika/i18n";
import { describe, expect, it } from "vitest";
import { emailBody, invitationEmail, looksLikeUrl, magicLinkEmail } from "./email-message";
import { fetchEmailSender } from "./email-provider";
import { operatorDisplayName } from "./operator";

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
  "magic link": () =>
    magicLinkEmail({
      to: "a@example.org",
      url: SIGN_IN_URL,
      ttlMinutes: 15,
      operatorName: "Олексій",
    }),
  invitation: () =>
    invitationEmail({
      to: "a@example.org",
      url: INVITE_URL,
      shelterName: "Притулок «Лапа»",
      operatorName: "Олексій",
      shelterVerification: "verified",
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
      {
        provider: "brevo",
        apiKey: "k",
        fromAddress: "noreply@mail.example.org",
        fromName: "N",
        replyTo: "hello@example.org",
      },
      capture,
    ).send(email);
    const sent = body as unknown as { textContent: string; htmlContent: string };
    expect(sent.textContent.split("\n")).toContain(url);
    expect(sent.textContent).not.toMatch(TRACKER);
    expect(sent.htmlContent).not.toMatch(TRACKER);
    for (const text of anchorTexts(sent.htmlContent)) expect(looksLikeUrl(text), text).toBe(false);
  });
});

/**
 * Oleksii's final Ukrainian (2026-10-14, rows 78–88 of the PR #94 copy
 * export), transcribed here from his answer sheet, never read back from
 * `uk.ts`: a test comparing the email against the catalogue constant would
 * pass for any text at all.
 */
describe("the builders fill his final copy", () => {
  it("magic link: subject, greeting intro (row 79), label, the 15-minute expiry and the signed last line (row 82), in order", () => {
    const email = builders["magic link"]();
    expect(email.subject).toBe("Посилання для входу до кабінету притулку");
    expect(anchorTexts(email.html)).toEqual(["Відкрити сторінку входу"]);
    expect(email.text).toBe(
      [
        "Добрий день. На цю адресу запитали посилання для входу до кабінету притулку.",
        SIGN_IN_URL,
        "Посилання спрацює один раз і діє 15 хвилин.",
        "Якщо ви цього не запитували, просто проігноруйте лист: без посилання нічого не відбудеться.\n— Олексій",
      ].join("\n\n"),
    );
    // Delivery test 2 (2026-10-14): signed like the invite, a line break in HTML too.
    expect(email.html).toContain("нічого не відбудеться.<br>— Олексій</p>");
    expect(email.text).not.toMatch(/\{\w+\}/);
  });

  it("magic link: with no display name configured, the signature is the catalogue's fallback, never a blank or a raw {operator}", () => {
    const email = magicLinkEmail({
      to: "a@example.org",
      url: SIGN_IN_URL,
      ttlMinutes: 15,
      operatorName: operatorDisplayName({}),
    });
    // Round 2, answer 6, verbatim: "Email signature fallback: capitalise it → «— Адміністратор сайту»."
    expect(email.text.endsWith("нічого не відбудеться.\n— Адміністратор сайту")).toBe(true);
    expect(email.html).toContain("<br>— Адміністратор сайту</p>");
  });

  it("invitation: the shelter in the intro, the 72-hour expiry, and the operator signing the last line (row 88)", () => {
    const email = builders.invitation();
    expect(email.subject).toBe("Ваш доступ до кабінету притулку");
    expect(anchorTexts(email.html)).toEqual(["Створити пароль"]);
    expect(email.text).toBe(
      [
        "Добрий день. Відкриваю для цієї адреси доступ до кабінету притулку «Притулок «Лапа»» на сайті Opika.",
        "У кабінеті ви бачите дані притулку — і те, що бачать люди, і дані з перевірки. Контакти, речення на сторінці притулку і картки тварин ви змінюєте самі, і зміни зʼявляються одразу після збереження. Посилання на збір запрацює, щойно я його перевірю. Щоб змінити дані з перевірки — юридичну особу, ЄДРПОУ чи адресу, — напишіть мені.",
        INVITE_URL,
        "Запрошення діє 72 години. Якщо не встигнете — я надішлю нове.",
        "Якщо ви не чекали цього листа, просто проігноруйте його і нікому не пересилайте: це посилання один раз дає змогу створити пароль для цієї адреси, поки запрошення діє.\n— Олексій",
      ].join("\n\n"),
    );
    // The signature is a line break under the last sentence in HTML too, not a collapsed space.
    expect(email.html).toContain("поки запрошення діє.<br>— Олексій</p>");
    expect(email.text).not.toMatch(/\{\w+\}/);
  });

  /**
   * Q-C (Oleksii, 2026-10-19): his two second sentences, transcribed, never read from uk.ts,
   * each with the phrase his DR1-Q1 answer (2026-10-20) replaced: «речення на сторінці притулку».
   */
  it.each([
    [
      "verified",
      "Контакти, речення на сторінці притулку і картки тварин ви змінюєте самі, і зміни зʼявляються одразу після збереження.",
      "Контакти, речення на сторінці притулку і картки тварин ви змінюєте самі. Ті, хто шукає тварину, побачать їх, щойно притулок пройде перевірку.",
    ],
    [
      "not_yet_verified",
      "Контакти, речення на сторінці притулку і картки тварин ви змінюєте самі. Ті, хто шукає тварину, побачать їх, щойно притулок пройде перевірку.",
      "Контакти, речення на сторінці притулку і картки тварин ви змінюєте самі, і зміни зʼявляються одразу після збереження.",
    ],
  ] as const)(
    "invitation: a %s shelter's email carries its own second sentence, and not the other",
    (verification, own, other) => {
      const email = invitationEmail({
        to: "a@example.org",
        url: INVITE_URL,
        shelterName: "Лапа",
        operatorName: "Олексій",
        shelterVerification: verification,
        ttlHours: 72,
      });
      expect(email.text).toContain(own);
      expect(email.text).not.toContain(other);
      expect(email.html).toContain(own);
    },
  );

  it("invitation: with no display name configured, the signature is the catalogue's fallback, never a blank or a raw {operator}", () => {
    const email = invitationEmail({
      to: "a@example.org",
      url: INVITE_URL,
      shelterName: "Лапа",
      operatorName: operatorDisplayName({}),
      shelterVerification: "verified",
      ttlHours: 72,
    });
    expect(email.text.endsWith("\n— Адміністратор сайту")).toBe(true);
    expect(email.html).toContain("<br>— Адміністратор сайту</p>");
  });
});
