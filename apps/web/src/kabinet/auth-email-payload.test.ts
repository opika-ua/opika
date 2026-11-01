import { describe, expect, it } from "vitest";
import { passwordChangedEmail, passwordResetEmail } from "./email-message";
import { EMAIL_PROVIDERS, type EmailProvider } from "./email-provider";
import { productionMailOf } from "./production-mail";
import { productionSignInOf } from "./production-sign-in";

/**
 * Oleksii, 2026-10-19 (`docs/shelter-passwords.md` §9), verbatim: "Both #136 safeguards
 * approved: the exact-payload test ({from,to,reply_to,subject,html,text} only) and
 * delivery-test refusing if tracking is on." This is the first one: every auth email the code
 * can send (the magic link, the invite in both forms, the reset link, «пароль змінено»), through
 * the production senders, to a recording fetch, for every provider config can route to: Resend
 * alone since PW1-Q4 (the lock's own tests are `email-provider.test.ts`). The body holds exactly
 * its provider's fields: no `headers` (so no List-Unsubscribe), no `tags`, no tracking field of
 * any kind ("No tracking on any auth email, ever"). Asserted on the bytes that go out.
 */

/** Each provider's whole payload, field by field; Resend's is his six. */
const EXACT_FIELDS: Readonly<Record<EmailProvider, readonly string[]>> = {
  resend: ["from", "html", "reply_to", "subject", "text", "to"],
  postmark: ["From", "HtmlBody", "MessageStream", "ReplyTo", "Subject", "TextBody", "To"],
};

/** Words no auth email's request may carry, in any provider's spelling. */
const BANNED = [
  /"headers"/i,
  /"tags?"/i,
  /track/i,
  /List-Unsubscribe/i,
  /"metadata"/i,
  /"params"/i,
];

const KEY_NAMES: Readonly<Record<EmailProvider, string>> = {
  resend: "RESEND_API_KEY",
  postmark: "POSTMARK_API_KEY",
};

const signInFor = (provider: EmailProvider) =>
  productionSignInOf(
    {
      VERCEL_ENV: "production",
      EMAIL_PROVIDER: provider,
      [KEY_NAMES[provider]]: `${provider}-key-example`,
      EMAIL_FROM_ADDRESS: "noreply@mail.example.org",
      EMAIL_FROM_NAME: "Кабінет",
      EMAIL_REPLY_TO: "hello@example.org",
      PRODUCTION_ORIGIN: "https://example.org",
      BETTER_AUTH_SECRET: "s".repeat(32),
      BETTER_AUTH_URL: "https://example.org",
      KABINET_OPERATOR_DISPLAY_NAME: "Олексій",
    },
    [],
  );

const onFor = (provider: EmailProvider) => {
  const on = signInFor(provider);
  if (on.kind !== "on") throw new Error(`production sign-in off: ${on.reason}`);
  return on;
};

/** The providers config turns production sign-in on for, each with its own key: derived, not listed. */
const ROUTABLE = EMAIL_PROVIDERS.filter((provider) => signInFor(provider).kind === "on");

/** Records each send's body as sent and answers each provider's success. */
function recordingFetch() {
  const sends: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    sends.push(typeof init?.body === "string" ? init.body : "");
    if (url.includes("postmark")) return Response.json({ ErrorCode: 0, MessageID: "p-1" });
    return Response.json({ id: "r-1" });
  }) as typeof fetch;
  return { sends, fetchImpl };
}

describe("every outgoing auth email carries exactly its provider's fields, and no tracking", () => {
  it("knows every provider's exact fields, and config routes auth emails to Resend alone (PW1-Q4)", () => {
    expect([...EMAIL_PROVIDERS].sort()).toEqual(Object.keys(EXACT_FIELDS).sort());
    // Should the lock ever widen, the provider let in is tested below, against its own fields.
    expect(ROUTABLE).toEqual(["resend"]);
  });

  it.each(ROUTABLE)(
    "through %s: the magic link, both invites, the reset link and the notice",
    async (provider) => {
      const { sends, fetchImpl } = recordingFetch();
      const mail = productionMailOf(onFor(provider), { fetchImpl, log: () => {} });
      await mail.sender.send({
        email: "olena@example.org",
        url: "https://example.org/kabinet/vkhid/pidtverdzhennia?token=abc",
      });
      for (const shelterVerification of ["verified", "not_yet_verified"] as const) {
        await mail.invites.send({
          email: "olena@example.org",
          shelterName: "Тестовий",
          operatorName: "Олексій",
          url: "https://example.org/kabinet/vkhid?zaproshennia=x",
          shelterVerification,
          validForHours: 72,
        });
      }
      await mail.passwordMail.sendReset({
        email: "olena@example.org",
        url: "https://example.org/kabinet/vkhid/novyi-parol?token=abc",
      });
      await mail.passwordMail.sendChanged({ email: "olena@example.org" });

      expect(sends, "one send per email").toHaveLength(5);
      for (const sent of sends) {
        const body = JSON.parse(sent) as Record<string, unknown>;
        expect(Object.keys(body).sort()).toEqual([...EXACT_FIELDS[provider]].sort());
        for (const banned of BANNED) expect(sent, String(banned)).not.toMatch(banned);
        // No pixel or remote image: an open tracker needs one.
        expect(sent).not.toMatch(/<img/i);
      }
      // PW-2 Q2 (Oleksii, 2026-10-20, verbatim), in both invites' bytes as they went out: the
      // link sets a password, so the paragraph says not to forward it.
      const invites = sends
        .map((sent) => JSON.parse(sent) as { subject?: string; text?: string; html?: string })
        .filter((body) => body.subject === "Ваш доступ до кабінету притулку");
      expect(invites).toHaveLength(2);
      for (const invite of invites) {
        expect(invite.text?.endsWith(`\n\n${INVITE_NOT_YOU}\n- Олексій`)).toBe(true);
        expect(invite.html).toContain(`${INVITE_NOT_YOU}<br>- Олексій</p>`);
      }
    },
  );
});

/** His PW-2 Q2 paragraph, transcribed (2026-10-20). */
const INVITE_NOT_YOU =
  "Якщо ви не чекали цього листа, просто проігноруйте його і нікому не пересилайте: це посилання один раз дає змогу створити пароль для цієї адреси, поки запрошення діє.";

describe("the two password emails (his F1 and F2, transcribed)", () => {
  it("F1: subject, the request, the labelled link, an hour, and the signed «not you» line", () => {
    const email = passwordResetEmail({
      to: "olena@example.org",
      url: "https://example.org/kabinet/vkhid/novyi-parol?token=abc&x=1",
      ttlMinutes: 60,
      operatorName: "Олексій",
    });
    expect(email.subject).toBe("Новий пароль до кабінету притулку");
    expect(email.text.split("\n\n")).toEqual([
      "Надійшов запит на новий пароль до кабінету притулку для цієї адреси.",
      "https://example.org/kabinet/vkhid/novyi-parol?token=abc&x=1",
      "Посилання спрацює один раз і діє 60 хв.",
      "Якщо запит надіслали не ви, просто не зважайте на цей лист: пароль залишиться тим самим.\n- Олексій",
    ]);
    expect(email.html).toContain(
      '<a href="https://example.org/kabinet/vkhid/novyi-parol?token=abc&amp;x=1">Створити новий пароль</a>',
    );
  });

  it("F2: subject, what happened, and whom to write to, with no link at all", () => {
    const email = passwordChangedEmail({
      to: "olena@example.org",
      contact: "hello@example.org",
      operatorName: "Олексій",
    });
    expect(email.subject).toBe("Кабінет притулку: пароль змінено");
    expect(email.text.split("\n\n")).toEqual([
      "Пароль до кабінету притулку для цієї адреси щойно змінено. На інших пристроях виконано вихід.",
      "Якщо це не ви – напишіть мені: hello@example.org\n- Олексій",
    ]);
    expect(email.html).not.toContain("<a ");
  });
});
