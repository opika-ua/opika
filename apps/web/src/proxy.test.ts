import { existsSync, readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookieName } from "./api/prelaunch-gate";

const SECRET = "test-proxy-secret";

function request(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL(url, "http://127.0.0.1:3000"), { headers });
}

/**
 * `vi.doMock` + `vi.resetModules()` per test, same pattern `seo-flags.test.ts`
 * already established (and the same reason: the module cache must be torn
 * down between tests, or the second test to run would silently import the
 * first test's mock). `./proxy` reads `SITE_IS_PUBLICLY_DISCOVERABLE` as a
 * plain imported binding — not a function closing over another module's own
 * copy of it — so mocking `./seo-flags` and re-importing `./proxy` fresh is
 * enough; no closure gotcha to work around here.
 *
 * `proxy` is async as of Phase 3, block 4 (`apiRateLimiter.check` is a
 * `Promise<boolean>` once a shared Upstash store can back it) — every call
 * below is awaited now. No Upstash env vars are set anywhere in this file,
 * so `apiRateLimiter` resolves to the in-memory implementation
 * (`rate-limit.ts`'s own module-scope branch), the same one these tests
 * always exercised.
 */
describe("proxy", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("PRELAUNCH_GATE_SECRET", SECRET);
  });

  afterEach(() => {
    vi.doUnmock("./seo-flags");
    vi.unstubAllEnvs();
  });

  describe("while SITE_IS_PUBLICLY_DISCOVERABLE is false", () => {
    beforeEach(() => {
      vi.doMock("./seo-flags", () => ({ SITE_IS_PUBLICLY_DISCOVERABLE: false }));
    });

    it("denies a request with no gate cookie and no gate query parameter", async () => {
      const { proxy } = await import("./proxy");
      const response = await proxy(request("https://opika.example/tvaryny"));
      expect(response.status).toBe(403);
    });

    it("denies a request whose gate cookie is wrong", async () => {
      const { proxy } = await import("./proxy");
      const response = await proxy(
        request("https://opika.example/tvaryny", { cookie: `${cookieName()}=wrong` }),
      );
      expect(response.status).toBe(403);
    });

    it("allows a request whose gate cookie is correct, and does not mint a new one", async () => {
      const { proxy } = await import("./proxy");
      const response = await proxy(
        request("https://opika.example/tvaryny", { cookie: `${cookieName()}=${SECRET}` }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("set-cookie")).toBeNull();
    });

    it("allows a request whose gate query parameter is correct, and mints the cookie", async () => {
      const { proxy } = await import("./proxy");
      const response = await proxy(request(`https://opika.example/tvaryny?gate=${SECRET}`));
      expect(response.status).toBe(200);
      expect(response.headers.get("set-cookie")).toContain(`${cookieName()}=${SECRET}`);
    });

    it("denies a request to a route outside /tvaryny just the same — the gate covers the whole site", async () => {
      const { proxy } = await import("./proxy");
      const response = await proxy(request("https://opika.example/prytulkam"));
      expect(response.status).toBe(403);
    });

    it("lets Vercel's cron reach /api/cron/auth-cleanup without the gate cookie (KH-T5)", async () => {
      const { proxy } = await import("./proxy");
      const response = await proxy(request("https://opika.example/api/cron/auth-cleanup"));
      expect(response.status).toBe(200);
    });

    it.each([
      "/api/cron",
      "/api/cron/other",
      "/api/cron/auth-cleanupx",
      "/api/cron/auth-cleanup/x",
    ])("still gates %s: the exemption is that one exact path", async (path) => {
      const { proxy } = await import("./proxy");
      expect((await proxy(request(`https://opika.example${path}`))).status).toBe(403);
    });

    it("denies the RPC endpoint just the same as a page route", async () => {
      const { proxy } = await import("./proxy");
      const response = await proxy(request("https://opika.example/api/rpc/gallery/list"));
      expect(response.status).toBe(403);
    });

    it("carries no user-agent carve-out: a Telegram-bot-shaped user agent is denied identically", async () => {
      const { proxy } = await import("./proxy");
      const response = await proxy(
        request("https://opika.example/tvaryny/some-id", {
          "user-agent": "TelegramBot (like TwitterBot)",
        }),
      );
      expect(response.status).toBe(403);
    });
  });

  describe("while SITE_IS_PUBLICLY_DISCOVERABLE is true", () => {
    beforeEach(() => {
      vi.doMock("./seo-flags", () => ({ SITE_IS_PUBLICLY_DISCOVERABLE: true }));
    });

    it("allows a request with no gate cookie and no gate query parameter at all", async () => {
      const { proxy } = await import("./proxy");
      const response = await proxy(request("https://opika.example/tvaryny"));
      expect(response.status).toBe(200);
    });

    /**
     * `proxy` is async now — an async function never throws synchronously
     * even if its body does (the throw surfaces as a rejected Promise
     * instead), so `expect(() => proxy(...)).not.toThrow()` would pass
     * trivially regardless of whether the call actually succeeds. Asserting
     * against the resolved Promise is what keeps this test capable of
     * failing — would have let a reintroduced read of
     * `PRELAUNCH_GATE_SECRET` on this path go undetected.
     */
    it("never reads PRELAUNCH_GATE_SECRET at all — an unset secret does not break a launched site", async () => {
      vi.unstubAllEnvs();
      const { proxy } = await import("./proxy");
      await expect(proxy(request("https://opika.example/tvaryny"))).resolves.toBeDefined();
    });
  });

  describe("the discovery-page rate limiter, independent of the gate", () => {
    beforeEach(() => {
      vi.doMock("./seo-flags", () => ({ SITE_IS_PUBLICLY_DISCOVERABLE: true }));
    });

    it("429s a request past the per-IP limit on /tvaryny", async () => {
      const { proxy } = await import("./proxy");
      let last = await proxy(
        request("https://opika.example/tvaryny", { "x-forwarded-for": "9.9.9.9" }),
      );
      for (let i = 0; i < 100; i++) {
        last = await proxy(
          request("https://opika.example/tvaryny", { "x-forwarded-for": "9.9.9.9" }),
        );
      }
      expect(last.status).toBe(429);
    });

    it("429s a /kabinet page load past the kabinet's per-IP limit (KH-Q8)", async () => {
      const { proxy } = await import("./proxy");
      const { KABINET_RATE_LIMITS } = await import("./kabinet/rate-limits");
      const load = (path: string) =>
        proxy(request(`https://opika.example${path}`, { "x-forwarded-for": "7.7.7.7" }));
      // Both pages draw on one budget: 300 loads across them, then refused.
      for (let i = 0; i < KABINET_RATE_LIMITS.perIp.maxRequests; i++) {
        expect((await load(i % 2 === 0 ? "/kabinet" : "/kabinet/vkhid")).status).toBe(200);
      }
      const refused = await load("/kabinet/vkhid");
      expect(refused.status).toBe(429);
      expect(await refused.text()).toBe("Too Many Requests");
    });

    it("leaves /api/kabinet to its route's own limiter, never charging it twice", async () => {
      const { proxy } = await import("./proxy");
      let last = await proxy(
        request("https://opika.example/api/kabinet/shelter/profile/get", {
          "x-forwarded-for": "6.6.6.6",
        }),
      );
      for (let i = 0; i < 350; i++) {
        last = await proxy(
          request("https://opika.example/api/kabinet/shelter/profile/get", {
            "x-forwarded-for": "6.6.6.6",
          }),
        );
      }
      expect(last.status).toBe(200);
    });

    it("does not rate-limit a route outside /tvaryny", async () => {
      const { proxy } = await import("./proxy");
      let last = await proxy(
        request("https://opika.example/prytulkam", { "x-forwarded-for": "8.8.8.8" }),
      );
      for (let i = 0; i < 150; i++) {
        last = await proxy(
          request("https://opika.example/prytulkam", { "x-forwarded-for": "8.8.8.8" }),
        );
      }
      expect(last.status).toBe(200);
    });
  });
});

/**
 * Review of the hardening, finding 3: the proxy runs on every route, so an
 * import that reaches Better Auth or the database loads it into every cold
 * start, `/tvaryny` included (measured in the inbox, KH-T4). Walks every
 * import that runs when a module loads, follows the relative ones, and fails
 * if anything reached imports Better Auth or the database.
 *
 * "Runs when a module loads" (review pass 2, finding 1) is wider than
 * `import … from`: a side-effect `import "./x"`, an `export … from`, and an
 * `import()` outside any function (a top-level `await import()`, or one in
 * an object literal) all load their target with the module. An `import()`
 * inside a function body or an arrow's body loads only when that runs,
 * which is the sanctioned way in (`proxy.ts` reaches `kabinet/runtime` that
 * way, on a `/kabinet` page load only).
 *
 * Telling the two apart needs scope, which a regex can't see. The repo's
 * TypeScript (7) has no JS parser API, so this strips the types with Node's
 * own `stripTypeScriptTypes` (positions kept, `import type` erased, since it
 * loads nothing) and runs a small scanner over the JavaScript that tracks
 * strings, comments, templates, regex literals and which braces open a
 * function body. Its first test pins each of those cases.
 */
describe("proxy.ts loads neither Better Auth nor the database at module load", () => {
  const SRC = dirname(fileURLToPath(import.meta.url));

  /** A `{` after `)` opens a function body unless the parenthesis belonged to one of these. */
  const CONTROL_KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "with", "await"]);
  /** After these tokens a `/` starts a regex literal; after anything else it divides. */
  const REGEX_FOLLOWS = new Set([
    ..."(,=:[!&|?{};+-*%<>~^",
    "",
    "=>",
    "return",
    "typeof",
    "case",
    "do",
    "else",
    "in",
    "of",
    "void",
    "await",
    "yield",
    "delete",
    "new",
    "throw",
  ]);
  /** An `import()` whose argument isn't a string literal: what it loads can't be checked. */
  const COMPUTED = "<computed import()>";

  /** Every module specifier `source` loads when it is itself loaded. */
  function moduleLoadImports(source: string): string[] {
    const code = stripTypeScriptTypes(source);
    const found: string[] = [];
    const braces: ("function" | "block" | "template")[] = [];
    const parenKeywords: string[] = [];
    const recent: string[] = [];
    let closedParenKeyword = "";
    let inTemplate = false;
    let i = 0;
    const prev = () => recent.at(-1) ?? "";
    const push = (token: string) => {
      recent.push(token);
      if (recent.length > 4) recent.shift();
    };
    const inArrowBody = () =>
      recent.filter((token) => token !== "await" && token !== "(").at(-1) === "=>";
    const skipTo = (needle: string, from: number) => {
      const at = code.indexOf(needle, from);
      return at === -1 ? code.length : at + needle.length;
    };

    while (i < code.length) {
      const ch = code[i] ?? "";
      const next = code[i + 1] ?? "";
      if (inTemplate) {
        if (ch === "\\") i += 2;
        else if (ch === "`") {
          inTemplate = false;
          push("`");
          i++;
        } else if (ch === "$" && next === "{") {
          braces.push("template");
          inTemplate = false;
          push("{");
          i += 2;
        } else i++;
      } else if (/\s/.test(ch)) {
        i++;
      } else if (ch === "/" && next === "/") {
        i = skipTo("\n", i);
      } else if (ch === "/" && next === "*") {
        i = skipTo("*/", i + 2);
      } else if (ch === '"' || ch === "'") {
        i++;
        while (i < code.length && code[i] !== ch) i += code[i] === "\\" ? 2 : 1;
        i++;
        push("string");
      } else if (ch === "`") {
        inTemplate = true;
        i++;
      } else if (ch === "/" && REGEX_FOLLOWS.has(prev())) {
        let inClass = false;
        i++;
        while (i < code.length && (inClass || code[i] !== "/")) {
          if (code[i] === "\\") i++;
          else if (code[i] === "[") inClass = true;
          else if (code[i] === "]") inClass = false;
          i++;
        }
        i++;
        while (/[a-z]/i.test(code[i] ?? "")) i++;
        push("regex");
      } else if (/[A-Za-z_$]/.test(ch)) {
        const rest = code.slice(i);
        const word = /^[\w$]+/.exec(rest)?.[0] ?? ch;
        const isKeyword = prev() !== ".";
        if (word === "import" && isKeyword) {
          const dynamic = /^import\s*\(\s*(?:(["'])([^"']+)\1\s*[,)])?/.exec(rest);
          if (dynamic !== null) {
            if (!braces.includes("function") && !inArrowBody()) {
              found.push(dynamic[2] ?? COMPUTED);
            }
          } else if (!/^import\s*\.\s*meta\b/.test(rest)) {
            const statement = /^import\s+(?:[^"';]*?\s*from\s*)?(["'])([^"']+)\1/.exec(rest);
            if (statement?.[2] !== undefined) found.push(statement[2]);
          }
        } else if (word === "export" && isKeyword) {
          const reexport = /^export\s+[^"';]*?\bfrom\s*(["'])([^"']+)\1/.exec(rest);
          if (reexport?.[2] !== undefined) found.push(reexport[2]);
        }
        push(word);
        i += word.length;
      } else if (ch === "(") {
        parenKeywords.push(/^[\w$]+$/.test(prev()) ? prev() : "");
        push("(");
        i++;
      } else if (ch === ")") {
        closedParenKeyword = parenKeywords.pop() ?? "";
        push(")");
        i++;
      } else if (ch === "{") {
        const opensFunction =
          prev() === "=>" || (prev() === ")" && !CONTROL_KEYWORDS.has(closedParenKeyword));
        braces.push(opensFunction ? "function" : "block");
        push("{");
        i++;
      } else if (ch === "}") {
        if (braces.pop() === "template") inTemplate = true;
        push("}");
        i++;
      } else if (ch === "=" && next === ">") {
        push("=>");
        i += 2;
      } else {
        push(ch);
        i++;
      }
    }
    return found;
  }

  function closure(file: string, seen = new Set<string>()): Set<string> {
    if (seen.has(file)) return seen;
    if (file.endsWith(".tsx")) {
      // stripTypeScriptTypes rejects JSX: fail loudly rather than skip the file.
      throw new Error(`${file}: the scanner reads .ts only, and a .tsx is now in the walk`);
    }
    seen.add(file);
    for (const specifier of moduleLoadImports(readFileSync(file, "utf8"))) {
      if (!specifier.startsWith(".")) continue;
      const base = resolve(dirname(file), specifier);
      const target = [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find(existsSync);
      if (target !== undefined) closure(target, seen);
    }
    return seen;
  }

  const HEAVY = new RegExp(
    [
      String.raw`^better-auth(\/|$)`,
      String.raw`^@better-auth\/`,
      String.raw`^@opika\/db(\/|$)`,
      String.raw`^postgres(\/|$)`,
      String.raw`^drizzle-orm(\/|$)`,
      String.raw`^@neondatabase\/`,
      String.raw`\/api\/db$`,
      String.raw`^\.\.?\/db$`,
    ].join("|"),
  );

  const heavyImports = (files: Set<string>) =>
    [...files].flatMap((file) =>
      moduleLoadImports(readFileSync(file, "utf8"))
        .filter((specifier) => specifier === COMPUTED || HEAVY.test(specifier))
        .map((specifier) => `${relative(SRC, file).replaceAll("\\", "/")}: ${specifier}`),
    );

  it("the scanner counts what loads with the module, and nothing a function defers", () => {
    const source = [
      'import "./side-effect";',
      'import type { Shape } from "./types-only";',
      'import { a, type B } from "./named";',
      'export { c } from "./reexport";',
      'export * from "./star";',
      'const lazy = await import("./top-level-await");',
      'const table = { load: import("./object-literal") };',
      "const computed = await import(name);",
      'if (flag) { await import("./top-level-block"); }',
      '// import "./commented-out";',
      'const text = "import \\"./in-a-string\\"";',
      "const re = /[{]/;",
      "const url = import.meta.url;",
      'export async function load(): Promise<void> { await import("./in-function"); }',
      'const arrow = () => import("./arrow-expression");',
      'const arrowBlock = async () => { await import("./arrow-block"); };',
      'class K { method() { return import("./method"); } }',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: source text for the scanner, holding a template on purpose
      'const later = `${x}`; import("./after-template");',
    ].join("\n");
    expect(moduleLoadImports(source)).toEqual([
      "./side-effect",
      "./named",
      "./reexport",
      "./star",
      "./top-level-await",
      "./object-literal",
      COMPUTED,
      "./top-level-block",
      "./after-template",
    ]);
  });

  it.each([
    "better-auth",
    "better-auth/plugins",
    "@better-auth/core",
    "@opika/db",
    "@opika/db/client",
    "postgres",
    "drizzle-orm/neon-http",
    "@neondatabase/serverless",
    "../api/db",
    "./db",
  ])("counts %s as heavy", (specifier) => {
    expect(HEAVY.test(specifier)).toBe(true);
  });

  it("sanity: the walk reaches the kabinet limiters and the page limit, not the runtime", () => {
    const files = [...closure(join(SRC, "proxy.ts"))].map((f) =>
      relative(SRC, f).replaceAll("\\", "/"),
    );
    expect(files).toEqual(
      expect.arrayContaining(["kabinet/limiters.ts", "kabinet/page-limit.ts", "api/rate-limit.ts"]),
    );
    // proxy.ts's own `import("./kabinet/runtime")` sits in a function body.
    expect(files).not.toContain("kabinet/runtime.ts");
  });

  it("finds nothing reachable at module load that imports Better Auth or the database", () => {
    expect(heavyImports(closure(join(SRC, "proxy.ts")))).toEqual([]);
  });

  it("the check itself sees one: kabinet/runtime.ts does import both", () => {
    expect(heavyImports(closure(join(SRC, "kabinet/runtime.ts")))).toEqual(
      expect.arrayContaining(["kabinet/runtime.ts: ../api/db", "kabinet/auth.ts: better-auth"]),
    );
  });
});
