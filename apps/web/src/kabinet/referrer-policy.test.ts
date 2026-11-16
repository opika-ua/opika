import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { type HeaderRule, sentOn } from "../../test/next-headers";
import type { KabinetAuth } from "./auth";
import type { KabinetAuthAvailability } from "./auth-route";
import { handleKabinetConfirm } from "./confirm-route";
import { INVITE_LINK, RESET_LINK, SIGN_IN_LINK } from "./email-links";
import { capturingInvitationSender } from "./email-senders";
import type { AcceptInvitation } from "./invitation-accept";
import { capturingSender } from "./magic-link-sender";
import { capturingPasswordMail } from "./password-mail";

/**
 * Owner, 2026-11-16: every /kabinet response carries exactly one Referrer-Policy, `strict-origin`.
 * Each source that could put one on a response is counted: next.config's rules for the path, what
 * the route handler or the proxy sets itself, and a `<meta name="referrer">` in the page.
 */

const SITE = "https://opika.example";
const TOKEN = "A".repeat(32);
const META_REFERRER = /<meta[^>]*name=["']?referrer/i;

let rules: HeaderRule[];
beforeAll(async () => {
  rules = (await (await import("../../next.config")).default.headers?.()) ?? [];
});

const configured = (path: string): string[] => {
  const value = sentOn(rules, path).get("referrer-policy");
  return value === undefined ? [] : [value];
};
const own = (headers: Headers): string[] => {
  const value = headers.get("referrer-policy");
  return value === null ? [] : [value];
};

const available: KabinetAuthAvailability = {
  kind: "available",
  passwordMail: capturingPasswordMail(),
  sender: capturingSender(),
  invites: capturingInvitationSender(),
  secret: "unused-here",
  baseURL: SITE,
};
const answering = (answer: () => Response) =>
  ({ handler: async () => answer() }) as unknown as KabinetAuth;
const signedIn = () =>
  new Response(JSON.stringify({ user: { id: "user-1" } }), {
    status: 200,
    headers: { "set-cookie": "kabinet.session_token=abc; Path=/; HttpOnly" },
  });
const nothingToAccept: AcceptInvitation = async () => ({ kind: "nothing_to_accept" });

function confirm(
  init: { method?: string; origin?: string; query?: string },
  auth: KabinetAuth = answering(signedIn),
  acceptInvitation: AcceptInvitation = nothingToAccept,
  availability: KabinetAuthAvailability = available,
) {
  const post = init.method === "POST";
  return handleKabinetConfirm(
    new Request(`${SITE}${SIGN_IN_LINK.path}${init.query ?? ""}`, {
      method: init.method ?? "GET",
      headers: init.origin === undefined ? {} : { origin: init.origin },
      ...(post ? { body: new URLSearchParams({ token: TOKEN }) } : {}),
    }),
    { availability, auth: () => auth, acceptInvitation },
  );
}

describe("the magic-link confirm page, every answer it gives", () => {
  it.each([
    ["the page", 200, () => confirm({ query: `?token=${TOKEN}` })],
    ["a malformed link", 400, () => confirm({ query: "?token=x" })],
    ["another site's POST", 403, () => confirm({ method: "POST", origin: "https://evil.example" })],
    [
      "a refused token",
      400,
      () =>
        confirm(
          { method: "POST", origin: SITE },
          answering(() => new Response("", { status: 400 })),
        ),
    ],
    [
      "the per-IP limit",
      429,
      () =>
        confirm(
          { method: "POST", origin: SITE },
          answering(() => new Response("", { status: 429 })),
        ),
    ],
    ["signed in", 303, () => confirm({ method: "POST", origin: SITE })],
    [
      "signed in, the accept failed",
      200,
      () =>
        confirm({ method: "POST", origin: SITE }, answering(signedIn), async () => ({
          kind: "failed",
        })),
    ],
    ["another method", 405, () => confirm({ method: "PUT" })],
    [
      "sign-in off",
      404,
      () =>
        confirm({}, answering(signedIn), nothingToAccept, {
          kind: "unavailable",
          reason: "production_sign_in_off",
          off: { kind: "off", reason: "environment_unidentified" },
        }),
    ],
  ] as const)(
    "%s (%i): one Referrer-Policy, strict-origin, and no referrer meta",
    async (_, status, answer) => {
      const response = await answer();
      expect(response.status).toBe(status);
      expect([...configured(SIGN_IN_LINK.path), ...own(response.headers)]).toEqual([
        "strict-origin",
      ]);
      expect(await response.text()).not.toMatch(META_REFERRER);
    },
  );
});

describe("the token pages", () => {
  afterEach(() => {
    vi.doUnmock("../seo-flags");
  });

  /** What the proxy adds on the way to the page (`token-pages.ts`). */
  async function proxied(path: string): Promise<Headers> {
    vi.resetModules();
    vi.doMock("../seo-flags", () => ({ SITE_IS_PUBLICLY_DISCOVERABLE: true }));
    const { proxy } = await import("../proxy");
    const response = await proxy(
      new NextRequest(`${SITE}${path}`, { headers: { "x-vercel-forwarded-for": "198.51.100.62" } }),
    );
    return response.headers;
  }

  it("the reset page: one Referrer-Policy, strict-origin, and no referrer metadata", async () => {
    const path = `${RESET_LINK.path}?token=${TOKEN}`;
    const { metadata } = await import("../app/kabinet/vkhid/novyi-parol/page");
    expect(metadata).not.toHaveProperty("referrer");
    expect([...configured(path), ...own(await proxied(path))]).toEqual(["strict-origin"]);
  });

  it("the invitation link's page: one Referrer-Policy, strict-origin, and no referrer metadata", async () => {
    const path = `${INVITE_LINK.path}?${INVITE_LINK.param}=${TOKEN}`;
    const { generateMetadata } = await import("../app/kabinet/vkhid/page");
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ [INVITE_LINK.param]: TOKEN }),
    });
    expect(metadata).not.toHaveProperty("referrer");
    expect([...configured(path), ...own(await proxied(path))]).toEqual(["strict-origin"]);
  });
});
