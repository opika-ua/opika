import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Redis } from "@upstash/redis";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RateLimiter } from "./rate-limit";
import { ipKeyWith, ipRateLimitKey } from "./rate-limit-key";

/**
 * Oleksii, 2026-10-14 (inbox EM-Q11), verbatim: "Rate-limit keys become
 * HMAC(IP) with a dedicated secret RATE_LIMIT_KEY_SECRET (not
 * LOCATION_HMAC_SECRET), on all limiters including the adopter side. ...
 * Test: no raw IP string appears in any limiter key."
 */
const IPV4 = "203.0.113.77";
const IPV6 = "2001:db8:0:0:0:0:0:77";
const SECRET_A = "test-rate-limit-key-secret-aaaaaaaaaaaaaaaa";
const SECRET_B = "test-rate-limit-key-secret-bbbbbbbbbbbbbbbb";

/** The address as it might appear in a key: as given, bracketed, upper-cased, compressed. */
const variantsOf = (ip: string) => [ip, `[${ip}]`, ip.toUpperCase(), ip.replace(/(:0)+:/, "::")];

function expectNoIpIn(keys: readonly string[], ip: string) {
  expect(keys.length, "the limiter was never charged, so nothing was checked").toBeGreaterThan(0);
  for (const key of keys) {
    for (const variant of variantsOf(ip)) {
      expect(key, `limiter key carries the IP (${variant}): EM-Q11`).not.toContain(variant);
    }
  }
}

type Recorder = RateLimiter & { keys: string[] };
const recorder = (allow: boolean): Recorder => {
  const keys: string[] = [];
  return {
    keys,
    async check(key: string) {
      keys.push(key);
      return allow;
    },
  };
};

describe("ipKeyWith", () => {
  it("is `ip:` and a 256-bit HMAC, base64url, with no trace of the address", () => {
    for (const ip of [IPV4, IPV6, "unknown"]) {
      const key = ipKeyWith(SECRET_A, ip);
      expect(key).toMatch(/^ip:[A-Za-z0-9_-]{43}$/);
      if (ip !== "unknown") expectNoIpIn([key], ip);
    }
  });

  it("same IP and secret, same key; another IP or another secret, another key", () => {
    expect(ipKeyWith(SECRET_A, IPV4)).toBe(ipKeyWith(SECRET_A, IPV4));
    expect(ipKeyWith(SECRET_A, IPV4)).not.toBe(ipKeyWith(SECRET_A, "203.0.113.78"));
    expect(ipKeyWith(SECRET_B, IPV4)).not.toBe(ipKeyWith(SECRET_A, IPV4));
  });

  it("is keyed: not the plain SHA-256 of the address, which 2^32 guesses reverse", async () => {
    const { createHash } = await import("node:crypto");
    const plain = createHash("sha256").update(IPV4).digest("base64url");
    expect(ipKeyWith(SECRET_A, IPV4)).not.toBe(`ip:${plain}`);
  });
});

describe("ipRateLimitKey: where the secret comes from", () => {
  it("uses RATE_LIMIT_KEY_SECRET when it is set", () => {
    expect(ipRateLimitKey(IPV4, { RATE_LIMIT_KEY_SECRET: SECRET_A })).toBe(
      ipKeyWith(SECRET_A, IPV4),
    );
  });

  it("refuses on any Vercel deployment without it, or with one under 32 characters, naming the variable", () => {
    for (const vercelEnv of ["production", "preview"]) {
      for (const env of [
        { VERCEL: "1", VERCEL_ENV: vercelEnv },
        { VERCEL: "1", VERCEL_ENV: vercelEnv, RATE_LIMIT_KEY_SECRET: "x".repeat(31) },
      ]) {
        expect(() => ipRateLimitKey(IPV4, env), vercelEnv).toThrow(
          /RATE_LIMIT_KEY_SECRET must be at least 32/,
        );
      }
      expect(
        ipRateLimitKey(IPV4, {
          VERCEL: "1",
          VERCEL_ENV: vercelEnv,
          RATE_LIMIT_KEY_SECRET: SECRET_A,
        }),
      ).toBe(ipKeyWith(SECRET_A, IPV4));
    }
  });

  it("off Vercel without it: a per-process random key, stable, never a published one", () => {
    const first = ipRateLimitKey(IPV4, {});
    expect(ipRateLimitKey(IPV4, { VERCEL: "1", VERCEL_ENV: "development" })).toBe(first);
    expect(first).not.toBe(ipKeyWith("", IPV4));
    expect(first).not.toBe(ipKeyWith(SECRET_A, IPV4));
    expectNoIpIn([first], IPV4);
  });
});

/**
 * Every limiter that takes an IP, driven with a known address through its
 * real entry point, recording the keys it charges.
 */
describe("no limiter key carries the raw IP (EM-Q11)", () => {
  it("the sign-in limiter (per IP; the per-address key is the address, by design)", async () => {
    const { signInAllowed } = await import("../kabinet/sign-in-limit");
    for (const ip of [IPV4, IPV6]) {
      const perIp = recorder(true);
      await signInAllowed(
        { perIp, perAddress: recorder(true) },
        { email: "olena@example.org", ip },
        new Date(),
      );
      expectNoIpIn(perIp.keys, ip);
    }
  });

  it("the invite landing", async () => {
    const { inviteLandingOf } = await import("../kabinet/invite-landing");
    const perIp = recorder(false);
    await inviteLandingOf("00000000-0000-4000-8000-000000000000", {
      lookup: async () => null,
      limiters: { perIp, perAddress: recorder(true) },
      ip: IPV4,
      now: new Date(),
      sendMagicLink: async () => false,
    });
    expectNoIpIn(perIp.keys, IPV4);
  });

  it("kabinet page loads", async () => {
    const { kabinetPageLoadAllowed } = await import("../kabinet/page-limit");
    const perIp = recorder(true);
    const perUser = recorder(true);
    await kabinetPageLoadAllowed(
      { perIp, perUser },
      { ip: IPV6, userId: async () => "user-1" },
      new Date(),
    );
    expectNoIpIn(perIp.keys, IPV6);
    expect(perUser.keys).toEqual(["user:user-1"]);
  });

  it("the kabinet API route", async () => {
    const { handleKabinetRpc } = await import("../kabinet/rpc-route");
    const perIp = recorder(false);
    const response = await handleKabinetRpc(
      new Request("https://opika.example/api/kabinet/shelter/profile/get", { method: "POST" }),
      {
        limiters: { perIp, perUser: recorder(true) },
        ip: IPV4,
        now: new Date(),
      } as unknown as Parameters<typeof handleKabinetRpc>[1],
    );
    expect(response.status).toBe(429);
    expectNoIpIn(perIp.keys, IPV4);
  });

  // Better Auth's `hooks.before` (verify, get-session, sign-out) is driven
  // through a real Better Auth instance in `kabinet/confirm-route.test.ts`,
  // which asserts the hashed key and the IP's absence.

  describe("the served entry points, on the module-level limiters", () => {
    let api: Recorder;
    let shared: Recorder[];

    beforeEach(() => {
      vi.resetModules();
      api = recorder(true);
      shared = [];
      vi.doMock("./rate-limit", () => ({
        apiRateLimiter: api,
        sharedRateLimiter: () => {
          const limiter = recorder(true);
          shared.push(limiter);
          return limiter;
        },
      }));
      vi.doMock("../seo-flags", () => ({ SITE_IS_PUBLICLY_DISCOVERABLE: true }));
    });

    afterEach(() => {
      vi.doUnmock("./rate-limit");
      vi.doUnmock("./db");
      vi.doUnmock("../seo-flags");
    });

    it("proxy.ts: discovery pages (the adopter limiter) and /kabinet page loads", async () => {
      const { proxy } = await import("../proxy");
      const at = (path: string) =>
        proxy(
          new NextRequest(`https://opika.example${path}`, {
            headers: { "x-vercel-forwarded-for": IPV4 },
          }),
        );
      expect((await at("/tvaryny")).status).toBe(200);
      expectNoIpIn(api.keys, IPV4);
      expect((await at("/kabinet/vkhid")).status).toBe(200);
      expectNoIpIn(
        shared.flatMap((limiter) => limiter.keys),
        IPV4,
      );
    });

    it("the adopter API route (/api/rpc)", async () => {
      api = recorder(false);
      vi.doMock("./rate-limit", () => ({ apiRateLimiter: api, sharedRateLimiter: recorder }));
      // The route opens its (lazy) connection before the limiter; nothing is queried.
      vi.doMock("./db", () => ({ getDb: () => ({}) }));
      const { POST } = await import("../app/api/rpc/[...rpc]/route");
      const response = await POST(
        new Request("https://opika.example/api/rpc/cities/list", {
          method: "POST",
          headers: { "x-forwarded-for": IPV6, "content-type": "application/json" },
          body: "{}",
        }),
      );
      expect(response.status).toBe(429);
      expectNoIpIn(api.keys, IPV6);
    });
  });

  it("the Upstash store: the bytes sent to Redis carry the HMAC, not the address", async () => {
    const { upstashRateLimiter } = await import("./rate-limit");
    const bodies: string[] = [];
    const fetchStub = vi.fn(async (_url: unknown, init?: RequestInit) => {
      bodies.push(String(init?.body ?? ""));
      return new Response(JSON.stringify({ result: [1, 1] }), {
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchStub);
    try {
      const limiter = upstashRateLimiter({
        redis: new Redis({
          url: "https://fake-upstash.invalid",
          token: "t",
          retry: { retries: 0 },
        }),
        windowMs: 60_000,
        maxRequests: 10,
        prefix: "opika-test",
      });
      const key = ipRateLimitKey(IPV4, { RATE_LIMIT_KEY_SECRET: SECRET_A });
      await limiter.check(key, new Date());
    } finally {
      vi.unstubAllGlobals();
    }
    const sent = bodies.join("\n");
    expect(sent, "nothing reached the fake Redis").toContain(ipKeyWith(SECRET_A, IPV4));
    expectNoIpIn(bodies, IPV4);
  });
});

/**
 * No call site builds an IP key by hand: the helper is the only place `ip:`
 * is put in front of anything, and no limiter is charged on a bare address.
 * A scan, alongside the behaviour above, because a new limiter added later
 * would not be in the list above.
 */
describe("the helper is the only way to an IP key", () => {
  const SRC = fileURLToPath(new URL("..", import.meta.url));
  const HELPER = "api/rate-limit-key.ts";

  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });

  const HAND_BUILT = [
    { name: "an `ip:` template", pattern: /`ip:\$\{/ },
    { name: "an `ip:` string concatenation", pattern: /["']ip:["']\s*\+/ },
    {
      name: "a limiter charged on a bare address",
      pattern: /\.check\(\s*(?:clientIp\(|(?:[\w.]+\.)?ip\s*[,)])/,
    },
  ];

  it("finds the source it scans (so an empty result means something)", () => {
    const files = sourceFiles(SRC).map((path) => relative(SRC, path).replaceAll("\\", "/"));
    expect(files).toEqual(expect.arrayContaining([HELPER, "proxy.ts", "kabinet/auth.ts"]));
  });

  it("no file but the helper builds one", () => {
    const found = sourceFiles(SRC)
      .filter((path) => relative(SRC, path).replaceAll("\\", "/") !== HELPER)
      .flatMap((path) => {
        const text = readFileSync(path, "utf8");
        return HAND_BUILT.filter(({ pattern }) => pattern.test(text)).map(
          ({ name }) => `${relative(SRC, path)}: ${name}`,
        );
      });
    expect(found, "build IP limiter keys with ipRateLimitKey (EM-Q11)").toEqual([]);
  });

  it("the patterns catch what they are for", () => {
    const [template, concat, bare] = HAND_BUILT.map(({ pattern }) => pattern);
    // Built from pieces so the sample itself is not a template-in-a-string.
    expect(template?.test(`limiter.check(\`ip:$${"{"}deps.ip}\`, now)`)).toBe(true);
    expect(concat?.test('limiter.check("ip:" + ip, now)')).toBe(true);
    expect(bare?.test("apiRateLimiter.check(clientIp(request), now)")).toBe(true);
    expect(bare?.test("apiRateLimiter.check(ip, now)")).toBe(true);
    expect(bare?.test("limiters.perIp.check(deps.ip, now)")).toBe(true);
    expect(bare?.test("limiters.perIp.check(ipRateLimitKey(deps.ip), now)")).toBe(false);
  });
});
