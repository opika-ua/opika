import { COPY_PENDING, uk } from "@opika/i18n";
import { describe, expect, it } from "vitest";
import {
  BLOCKED_MAX_PAGES,
  BLOCKED_PAGE_SIZE,
  type BlockedStatus,
  blockedStatusOf,
  type OutgoingEmail,
  unsupportedBlockList,
} from "./email-provider";
import {
  maskAddress,
  type ProviderMail,
  providerInvitationSender,
  providerMagicLinkSender,
  sendChecked,
} from "./email-senders";

/** IN-E7: check the block list before sending; every way a send goes wrong is an outcome, never a throw. */

const email: OutgoingEmail = { to: "olena@example.org", subject: "S", html: "<p>H</p>", text: "T" };

function mail(
  status: BlockedStatus | (() => never),
  options: { refuseCopyPending?: boolean; sendFails?: boolean } = {},
) {
  const sent: OutgoingEmail[] = [];
  const asked: string[] = [];
  const provider: ProviderMail = {
    sender: {
      async send(message) {
        if (options.sendFails)
          throw new Error("Email provider brevo refused the send (status 500).");
        sent.push(message);
        return { status: 201, messageId: "m" };
      },
    },
    async blockedStatus(address) {
      asked.push(address);
      return typeof status === "function" ? status() : status;
    },
    refuseCopyPending: options.refuseCopyPending ?? false,
  };
  return { provider, sent, asked };
}

describe("sendChecked", () => {
  it("sends to an address that isn't blocked: sent", async () => {
    const m = mail({ kind: "not_blocked" });
    expect(await sendChecked(m.provider, email)).toEqual({ kind: "sent", blockCheck: "clear" });
    expect(m.asked).toEqual(["olena@example.org"]);
    expect(m.sent).toEqual([email]);
  });

  it("sends nothing to a blocked address, and says why", async () => {
    const m = mail({ kind: "blocked", reason: "spam_complaint" });
    expect(await sendChecked(m.provider, email)).toEqual({
      kind: "blocked",
      reason: "spam_complaint",
    });
    expect(m.sent).toEqual([]);
  });

  it("still sends when the block list can't be read, and says the check wasn't done (review of 5f9e7c4, finding 1)", async () => {
    for (const why of [
      "provider_error",
      "list_too_long",
      "timed_out",
      "unsupported_provider",
    ] as const) {
      const unknown = mail({ kind: "unknown", why });
      expect(await sendChecked(unknown.provider, email), why).toEqual({
        kind: "sent",
        blockCheck: "unknown",
      });
      expect(unknown.sent, why).toEqual([email]);
    }
    const throwing = mail(() => {
      throw new Error("lookup down");
    });
    expect(await sendChecked(throwing.provider, email)).toEqual({
      kind: "sent",
      blockCheck: "unknown",
    });
    expect(throwing.sent).toHaveLength(1);
  });

  it("the reviewer's case end to end: the invitee is past the 500th blocked contact, so sent but unchecked", async () => {
    const total = BLOCKED_PAGE_SIZE * BLOCKED_MAX_PAGES + 1;
    const fetchImpl = (async (url: string) => {
      const offset = Number(new URL(url).searchParams.get("offset"));
      const contacts = Array.from({ length: BLOCKED_PAGE_SIZE }, (_, i) => ({
        email: `other${offset + i}@example.org`,
        reason: { code: "hardBounce" },
      }));
      return new Response(JSON.stringify({ count: total, contacts }), { status: 200 });
    }) as unknown as typeof fetch;
    const brevo = {
      provider: "brevo",
      apiKey: "k",
      fromAddress: "a@mail.example.org",
      fromName: null,
      replyTo: "hello@example.org",
    } as const;
    const sent: OutgoingEmail[] = [];
    const provider: ProviderMail = {
      sender: {
        async send(message) {
          sent.push(message);
          return { status: 201, messageId: "m" };
        },
      },
      blockedStatus: (address) => blockedStatusOf(brevo, address, fetchImpl),
      refuseCopyPending: false,
    };
    expect(await sendChecked(provider, email)).toEqual({ kind: "sent", blockCheck: "unknown" });
    expect(sent).toEqual([email]);
  });

  it("a refused send is failed: provider_error, never a throw", async () => {
    const m = mail({ kind: "not_blocked" }, { sendFails: true });
    expect(await sendChecked(m.provider, email)).toEqual({
      kind: "failed",
      reason: "provider_error",
    });
  });

  it("in production, refuses [COPY PENDING] text in any part, before asking the provider anything (IN-Q5)", async () => {
    for (const part of ["subject", "html", "text"] as const) {
      const m = mail({ kind: "not_blocked" }, { refuseCopyPending: true });
      // A placeholder put back by hand: the live catalogue's email copy is final (2026-10-14).
      const pendingEmail = { ...email, [part]: `x ${COPY_PENDING} Open the sign-in page` };
      expect(await sendChecked(m.provider, pendingEmail), part).toEqual({
        kind: "failed",
        reason: "copy_pending",
      });
      expect(m.asked).toEqual([]);
      expect(m.sent).toEqual([]);
    }
    const outside = mail({ kind: "not_blocked" });
    expect(
      await sendChecked(outside.provider, {
        ...email,
        text: `${COPY_PENDING} Open the sign-in page`,
      }),
    ).toEqual({ kind: "sent", blockCheck: "clear" });
  });
});

describe("maskAddress", () => {
  it("keeps the first character and the domain", () => {
    expect(maskAddress("olena@gmail.com")).toBe("o•••@gmail.com");
    expect(maskAddress("not-an-address")).toBe("•••");
    expect(maskAddress("@x.org")).toBe("•••");
  });
});

describe("providerMagicLinkSender", () => {
  const URL_WITH_TOKEN = "https://example.org/kabinet/vkhid/pidtverdzhennia?token=SECRET-TOKEN";

  it("logs a blocked or failed send with the address masked, never the link or the full address", async () => {
    for (const [m, expected] of [
      [mail({ kind: "blocked", reason: "unsubscribed" }), "blocked (unsubscribed)"],
      [mail({ kind: "not_blocked" }, { sendFails: true }), "failed (provider_error)"],
    ] as const) {
      const lines: string[] = [];
      await providerMagicLinkSender(m.provider, {
        ttlMinutes: 15,
        operatorName: "Олексій",
        log: (l) => lines.push(l),
      }).send({
        email: "olena@example.org",
        url: URL_WITH_TOKEN,
      });
      expect(lines).toEqual([`[kabinet] sign-in email to o•••@example.org not sent: ${expected}`]);
      expect(lines.join("")).not.toContain("SECRET-TOKEN");
      expect(lines.join("")).not.toContain("olena@");
    }
  });

  it("logs a send whose block check couldn't be done, masked, never the link", async () => {
    const m = mail({ kind: "unknown", why: "timed_out" });
    const lines: string[] = [];
    await providerMagicLinkSender(m.provider, {
      ttlMinutes: 15,
      operatorName: "Олексій",
      log: (l) => lines.push(l),
    }).send({
      email: "olena@example.org",
      url: URL_WITH_TOKEN,
    });
    expect(lines).toEqual([
      "[kabinet] sign-in email to o•••@example.org sent without a block-list check",
    ]);
    expect(m.sent).toHaveLength(1);
  });

  it("logs nothing for a checked, sent email, and sends the magic-link email itself", async () => {
    const m = mail({ kind: "not_blocked" });
    const lines: string[] = [];
    await providerMagicLinkSender(m.provider, {
      ttlMinutes: 15,
      operatorName: "Олексій",
      log: (l) => lines.push(l),
    }).send({
      email: "olena@example.org",
      url: URL_WITH_TOKEN,
    });
    expect(lines).toEqual([]);
    expect(m.sent[0]?.subject).toBe(uk.kabinet.email.signIn.subject);
    expect(m.sent[0]?.text.split("\n")).toContain(URL_WITH_TOKEN);
  });

  /**
   * Oleksii, 2026-10-14: the sign-in email signs `— {operator}` as the invite
   * does. The sender is where production's configured name reaches the
   * builder, so the signature is asserted on what it actually sent.
   */
  it("signs the sent email with the operator name it was built with", async () => {
    const m = mail({ kind: "not_blocked" });
    await providerMagicLinkSender(m.provider, {
      ttlMinutes: 15,
      operatorName: "Олексій Колотенко",
      log: () => {},
    }).send({ email: "olena@example.org", url: URL_WITH_TOKEN });
    expect(m.sent[0]?.text.endsWith("нічого не відбудеться.\n— Олексій Колотенко")).toBe(true);
    expect(m.sent[0]?.html).toContain("нічого не відбудеться.<br>— Олексій Колотенко</p>");
  });
});

const CHANNEL = { fromAddress: "noreply@mail.example.org", blockList: unsupportedBlockList };

describe("providerInvitationSender", () => {
  it("exposes the configured From address and block list for the operator's side (IN-E13, answer 4)", () => {
    const sender = providerInvitationSender(mail({ kind: "not_blocked" }).provider, CHANNEL);
    expect(sender.fromAddress).toBe("noreply@mail.example.org");
    expect(sender.blockList).toBe(unsupportedBlockList);
  });

  it("sends the invitation email and returns the checked outcome", async () => {
    const m = mail({ kind: "not_blocked" });
    const outcome = await providerInvitationSender(m.provider, CHANNEL).send({
      email: "olena@example.org",
      shelterName: "Лапа",
      operatorName: "Олексій",
      url: "https://example.org/kabinet/vkhid?zaproshennia=1",
      validForHours: 72,
    });
    expect(outcome).toEqual({ kind: "sent", blockCheck: "clear" });
    expect(m.sent[0]).toMatchObject({
      to: "olena@example.org",
      subject: uk.kabinet.email.invite.subject,
    });
    const blocked = mail({ kind: "blocked", reason: "hard_bounce" });
    expect(
      await providerInvitationSender(blocked.provider, CHANNEL).send({
        email: "olena@example.org",
        shelterName: "Лапа",
        operatorName: "Олексій",
        url: "https://example.org/kabinet/vkhid?zaproshennia=1",
        validForHours: 72,
      }),
    ).toEqual({ kind: "blocked", reason: "hard_bounce" });
  });
});
