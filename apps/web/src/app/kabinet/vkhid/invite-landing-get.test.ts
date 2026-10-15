import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * EM-Q3 (Oleksii, 2026-10-14, verbatim: "(b). The invite landing shows one
 * «Надіслати посилання» button; only its POST sends. A GET sends nothing.
 * Test: a GET doesn't consume the per-address send budget."). The landing's
 * GET is the real page module, run with the real auth availability; only
 * Better Auth, the limiters and the request headers are stand-ins, so that
 * every send or budget charge the GET could make is counted. The POST is
 * `invite-landing.test.ts`; the browser run of both is
 * `test/harness/kabinet-confirm.harness.ts`.
 */

const sends = vi.fn(async (_request: Request) => new Response(null, { status: 200 }));
const charges = vi.fn(async (_key: string, _now: Date) => true);

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
// A database the GET may hold but never query: any read through it throws.
vi.mock("../../../api/db", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, key) => {
          throw new Error(`the GET touched the database (${String(key)})`);
        },
      },
    ),
}));
vi.mock("../../../kabinet/runtime", () => ({
  kabinetAuth: () => ({ handler: sends, api: { getSession: async () => null } }),
  signInLimiters: { perAddress: { check: charges }, perIp: { check: charges } },
}));

const { default: SignInPage, generateMetadata } = await import("./page");

beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(32));
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  sends.mockClear();
  charges.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const open = (zaproshennia: string) =>
  SignInPage({ searchParams: Promise.resolve({ zaproshennia }) });

describe("the invite landing's GET (EM-Q3)", () => {
  it("opened twice, sends nothing and charges no budget, per-address or per-IP", async () => {
    const id = crypto.randomUUID();
    await open(id);
    await open(id);
    expect(sends).not.toHaveBeenCalled();
    expect(charges).not.toHaveBeenCalled();
  });

  it("renders the one-button form for the id, with the action as a reference, not a call", async () => {
    const id = crypto.randomUUID();
    const tree = JSON.stringify(await open(id), (_key, value) =>
      typeof value === "function" ? `fn:${value.name}` : value,
    );
    expect(tree).toContain(`"invitationId":"${id}"`);
    expect(tree).toContain('"action":"fn:sendInviteLink"');
  });

  /**
   * Belt to the run above: the page module can't reach a send or a budget
   * without importing one of these. Passing `sendInviteLink` as the form's
   * action is allowed; calling it is not.
   */
  it("imports nothing that looks an invitation up, charges a budget or sends", () => {
    const source = readFileSync(join(import.meta.dirname, "page.tsx"), "utf8");
    for (const name of [
      "inviteLandingOf",
      "submitInviteLanding",
      "sendMagicLinkThroughAuth",
      "signInLimiters",
      "kabinetInviteLandingRepo",
      "sign-in-limit",
    ]) {
      expect(source.includes(name), name).toBe(false);
    }
    expect(source).not.toMatch(/sendInviteLink\s*\(/);
  });

  it("sets the confirm page's strict-origin Referrer-Policy on the landing only", async () => {
    expect(
      await generateMetadata({ searchParams: Promise.resolve({ zaproshennia: "x" }) }),
    ).toMatchObject({ referrer: "strict-origin" });
    expect(await generateMetadata({ searchParams: Promise.resolve({}) })).not.toHaveProperty(
      "referrer",
    );
  });
});
