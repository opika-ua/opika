/**
 * Middleware rate limiting for `/tvaryny`, verified against a real running
 * server rather than assumed from the matcher config.
 *
 * Two things this proves in one test: the matcher actually covers the *bare*
 * `/tvaryny` path (not only a subpath — a plausible gap `middleware.ts`'s own
 * config comment names), and the limiter actually returns 429 once the
 * budget is spent, rather than the middleware silently no-op'ing. A matcher
 * typo or a limiter wired to the wrong check would both be invisible to
 * anything short of this — the exact shape of failure this project's harness
 * exists to catch instead of a config file read on faith.
 *
 * Uses a unique `x-forwarded-for` per test run rather than the harness's own
 * real IP, so this test's deliberate budget exhaustion can never collide
 * with any other test — present or future — that also requests `/tvaryny`
 * under its real identity. Spoofing that header is expected and harmless
 * here: nothing in local/CI testing sits in front of this server sanitising
 * it the way Vercel does in production (see `api/client-ip.ts`).
 */

import { expect, test } from "@playwright/test";

const ROUTE = "/tvaryny";
/** Matches apiRateLimiter's own configured budget — see api/rate-limit.ts. */
const BUDGET = 100;

test.describe("gallery rate limiting", () => {
  test("the bare route is covered, and the budget is actually enforced", async ({ request }) => {
    const testIp = `203.0.113.${Math.floor(Math.random() * 254) + 1}`;

    let lastStatus = 0;
    for (let i = 0; i < BUDGET + 1; i++) {
      const response = await request.get(ROUTE, {
        headers: { "x-forwarded-for": testIp },
      });
      lastStatus = response.status();

      if (i < BUDGET) {
        expect(
          lastStatus,
          `request ${i + 1}/${BUDGET} to ${ROUTE} was rate-limited early — ` +
            `the budget should not be spent until request ${BUDGET + 1}`,
        ).not.toBe(429);
      }
    }

    expect(
      lastStatus,
      `request ${BUDGET + 1} to the bare ${ROUTE} was not rate-limited. Either the matcher ` +
        `does not cover the bare path (only a subpath), or the limiter did not fire.`,
    ).toBe(429);
  });
});
