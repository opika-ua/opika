import { existsSync, readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function request(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL(url, "http://127.0.0.1:3000"), { headers });
}

/**
 * `vi.resetModules()` per test so each import gets a fresh `apiRateLimiter`. No Upstash env vars are
 * set in this file, so the limiter is the in-memory one.
 */
describe("proxy", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("./api/rate-limit");
    vi.unstubAllEnvs();
  });

  describe("a launched site", () => {
    it("serves a request with no cookie and no query parameter", async () => {
      const { proxy } = await import("./proxy");
      const response = await proxy(request("https://opika.example/tvaryny"));
      expect(response.status).toBe(200);
    });

    // Step 14.4: the per-animal link-preview image is reachable without a cookie; its noindex and short
    // cache for revocable shelters are pinned in seo/og-image.test.tsx and post-flip-noindex.test.ts.
    it("serves the per-animal link-preview image and every page without a cookie (step 14.4)", async () => {
      const { proxy } = await import("./proxy");
      for (const path of [
        "/opengraph-image",
        "/tvaryny/cccccccc-cccc-4ccc-8ccc-cccccccccccc/opengraph-image",
        "/tvaryny/cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        "/prytulky/dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      ]) {
        const response = await proxy(request(`https://opika.example${path}`));
        expect(response.status, path).toBe(200);
        expect(response.headers.get("set-cookie"), path).toBeNull();
      }
    });

    it("answers the discovery rate limit with noindex, so a refusal is never indexed as the page", async () => {
      const { apiRateLimiter } = await import("./api/rate-limit");
      vi.spyOn(apiRateLimiter, "check").mockResolvedValue(false);
      const { proxy } = await import("./proxy");
      const response = await proxy(
        request("https://opika.example/tvaryny/cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
      );
      expect(response.status).toBe(429);
      expect(response.headers.get("x-robots-tag")).toBe("noindex");
    });
  });

  describe("the discovery-page rate limiter", () => {
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

    it("429s a shelter page past the same per-IP limit (designer round 1, S6)", async () => {
      const { proxy } = await import("./proxy");
      const load = () =>
        proxy(
          request("https://opika.example/prytulky/dddddddd-dddd-4ddd-8ddd-dddddddddddd", {
            "x-forwarded-for": "9.9.9.10",
          }),
        );
      let last = await load();
      for (let i = 0; i < 100; i++) last = await load();
      expect(last.status).toBe(429);
      expect(last.headers.get("x-middleware-rewrite")).toContain("/rate-limited");
    });

    it("rewrites that 429 to the branded screen, noindex, with Retry-After from the limiter's state (RL-F1, QA 2026-10-29)", async () => {
      // The page itself is rendered by `RateLimitedScreen` (its own test and the harness spec);
      // here only the proxy's answer: status, target, and the header's number.
      const { proxy } = await import("./proxy");
      const load = () =>
        proxy(request("https://opika.example/tvaryny", { "x-forwarded-for": "8.8.4.4" }));
      let last = await load();
      for (let i = 0; i < 100; i++) last = await load();
      expect(last.status).toBe(429);
      expect(last.headers.get("x-middleware-rewrite")).toBe("https://opika.example/rate-limited");
      expect(last.headers.get("x-robots-tag")).toBe("noindex");
      const seconds = Number(last.headers.get("retry-after"));
      expect(Number.isInteger(seconds)).toBe(true);
      expect(seconds).toBeGreaterThanOrEqual(1);
      expect(seconds).toBeLessThanOrEqual(60);
    });

    it("falls back to the window length when the limiter cannot say when it frees up", async () => {
      vi.doMock("./api/rate-limit", async (importOriginal) => ({
        ...(await importOriginal<typeof import("./api/rate-limit")>()),
        apiRateLimiter: { check: async () => false },
      }));
      const { proxy } = await import("./proxy");
      const refused = await proxy(
        request("https://opika.example/tvaryny/cccccccc-cccc-4ccc-8ccc-cccccccccccc", {
          "x-forwarded-for": "8.8.4.5",
        }),
      );
      expect(refused.status).toBe(429);
      expect(refused.headers.get("retry-after")).toBe("60");
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

    /**
     * The merge of #95 into the invite PR: the confirm page's POST runs the
     * verify, which `auth.ts`'s `hooks.before` charges on these same budgets,
     * so the proxy leaves the POST alone. Its GET is still a page load.
     */
    it("leaves the sign-in confirm POST to Better Auth's hook, and still charges its GET", async () => {
      const { proxy } = await import("./proxy");
      const { KABINET_RATE_LIMITS } = await import("./kabinet/rate-limits");
      const confirm = (method: string) =>
        proxy(
          new NextRequest("https://opika.example/kabinet/vkhid/pidtverdzhennia", {
            method,
            headers: { "x-forwarded-for": "5.5.5.5" },
          }),
        );
      for (let i = 0; i <= KABINET_RATE_LIMITS.perIp.maxRequests; i++) {
        expect((await confirm("POST")).status).toBe(200);
      }
      for (let i = 0; i < KABINET_RATE_LIMITS.perIp.maxRequests; i++) {
        expect((await confirm("GET")).status).toBe(200);
      }
      expect((await confirm("GET")).status).toBe(429);
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
 * import that runs when a module loads, follows the relative and `@/` ones
 * (an unresolvable one throws), and fails if anything reached imports Better
 * Auth or the database.
 *
 * "Runs when a module loads" (review pass 2, finding 1) is wider than
 * `import … from`: a side-effect `import "./x"`, an `export … from`, and an
 * `import()` outside any function (a top-level `await import()`, or one in
 * an object literal) all load their target with the module. An `import()`
 * inside a function body or an arrow's body loads only when that runs,
 * which is the sanctioned way in (`proxy.ts` reaches `kabinet/runtime` that
 * way, on a `/kabinet` page load only), unless the function is invoked where
 * it is defined: an IIFE's body runs with the module (review pass 3, finding
 * 1). See `moduleLoadImports` for what the syntactic walk can't see.
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

  /** Where the first pass found IIFEs, for the second to treat their bodies as module-load code. */
  type ScanHints = {
    /** Index of each `{` opening a function body that is invoked where it is defined. */
    iifeBodies: ReadonlySet<number>;
    /** Index of each grouping `(` whose `)` is immediately followed by a call `(`. */
    invokedGroups: ReadonlySet<number>;
  };
  type ScanResult = {
    found: string[];
    /** Function body `{` index → its `}` index. */
    functionBodies: Map<number, number>;
    /** Grouping `(` index (an expression in parentheses, not a call's arguments) → its `)` index. */
    groups: Map<number, number>;
  };

  /** The index of the next character that isn't whitespace or inside a comment. */
  function nextSignificant(code: string, from: number): number {
    let i = from;
    while (i < code.length) {
      if (/\s/.test(code[i] ?? "")) {
        i++;
      } else if (code.startsWith("//", i)) {
        const end = code.indexOf("\n", i);
        i = end === -1 ? code.length : end;
      } else if (code.startsWith("/*", i)) {
        const end = code.indexOf("*/", i + 2);
        i = end === -1 ? code.length : end + 2;
      } else {
        return i;
      }
    }
    return i;
  }

  function scan(code: string, hints: ScanHints): ScanResult {
    const found: string[] = [];
    const functionBodies = new Map<number, number>();
    const groups = new Map<number, number>();
    const braces: { kind: "function" | "block" | "template"; at: number; body: boolean }[] = [];
    const parens: { keyword: string; at: number; group: boolean }[] = [];
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
    /**
     * An arrow's expression body runs when the arrow does: `(() => import(…))()`
     * runs it now. The arrow sits in the parenthesis that was innermost at its
     * `=>`, which is the one below any `(` opened since.
     */
    const arrowInvokedNow = () => {
      const opened = recent
        .slice(recent.lastIndexOf("=>") + 1)
        .filter((token) => token === "(").length;
      const enclosing = parens.at(-1 - opened);
      return enclosing !== undefined && hints.invokedGroups.has(enclosing.at);
    };
    const deferred = () =>
      braces.some((brace) => brace.kind === "function") || (inArrowBody() && !arrowInvokedNow());
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
          braces.push({ kind: "template", at: i, body: false });
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
            if (!deferred()) found.push(dynamic[2] ?? COMPUTED);
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
        // After an operator, a keyword like `void`, or nothing, `(` groups an
        // expression; after a name or `)` it holds a call's arguments.
        parens.push({
          keyword: /^[\w$]+$/.test(prev()) ? prev() : "",
          at: i,
          group: REGEX_FOLLOWS.has(prev()),
        });
        push("(");
        i++;
      } else if (ch === ")") {
        const paren = parens.pop();
        closedParenKeyword = paren?.keyword ?? "";
        if (paren?.group) groups.set(paren.at, i);
        push(")");
        i++;
      } else if (ch === "{") {
        const body =
          prev() === "=>" || (prev() === ")" && !CONTROL_KEYWORDS.has(closedParenKeyword));
        // An IIFE's body runs now, so it scans as a plain block.
        const kind = body && !hints.iifeBodies.has(i) ? "function" : "block";
        braces.push({ kind, at: i, body });
        push("{");
        i++;
      } else if (ch === "}") {
        const brace = braces.pop();
        if (brace?.kind === "template") inTemplate = true;
        if (brace?.body) functionBodies.set(brace.at, i);
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
    return { found, functionBodies, groups };
  }

  /**
   * Every module specifier `source` loads when it is itself loaded.
   *
   * Two passes over the same code. The first finds every function body and
   * every parenthesised expression; between them, the IIFEs are worked out
   * from what follows each closing `}` or `)`: `function () {…}()`,
   * `(function () {…})()`, `(async () => {…})()`, `void (async () => {…})()`
   * and `(() => import(…))()` all run their body as the module loads (review
   * pass 3, finding 1). The second pass scans those bodies as plain blocks.
   *
   * The walk is syntactic. It cannot know that a function *passed* somewhere
   * runs at once (`run(() => import(…))`, `new Promise((r) => …)`,
   * `[x].forEach(…)`, `fn.call(…)`), so those read as deferred: a known blind
   * spot, kept small by `proxy.ts` having no such call at module scope. Where
   * it guesses the other way (`function f() {…}` followed by a statement that
   * starts with `(`, a curried `g(() => {…})(x)`), it over-counts, which can
   * only turn the check red, never green.
   */
  function moduleLoadImports(source: string): string[] {
    const code = stripTypeScriptTypes(source);
    const first = scan(code, { iifeBodies: new Set(), invokedGroups: new Set() });
    const invokedGroups = new Set(
      [...first.groups]
        .filter(([, close]) => code[nextSignificant(code, close + 1)] === "(")
        .map(([open]) => open),
    );
    const groupClosingAt = new Map([...first.groups].map(([open, close]) => [close, open]));
    const iifeBodies = new Set(
      [...first.functionBodies]
        .filter(([, close]) => {
          const after = nextSignificant(code, close + 1);
          if (code[after] === "(") return true; // function () {…}()
          const group = groupClosingAt.get(after); // (function () {…})(), (() => {…})()
          return group !== undefined && invokedGroups.has(group);
        })
        .map(([open]) => open),
    );
    return scan(code, { iifeBodies, invokedGroups }).found;
  }

  /**
   * `tsconfig.json`'s `paths`, as prefix → directory (`@/` → `src/`), so the
   * walk follows an aliased import instead of passing it by as a package
   * (review pass 3, finding 3: before, `import "@/kabinet/runtime"` went red
   * only because vitest couldn't resolve the alias). Only the `prefix/*` →
   * `[dir/*]` shape is understood; anything else throws rather than being
   * ignored. The file has comments, but only whole-line ones.
   */
  function tsconfigAliases(): Map<string, string> {
    const appRoot = resolve(SRC, "..");
    const raw = readFileSync(join(appRoot, "tsconfig.json"), "utf8");
    const config = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "")) as {
      compilerOptions?: { paths?: Record<string, string[]> };
    };
    const aliases = new Map<string, string>();
    for (const [key, targets] of Object.entries(config.compilerOptions?.paths ?? {})) {
      const target = targets.length === 1 ? targets[0] : undefined;
      if (!key.endsWith("/*") || target === undefined || !target.endsWith("/*")) {
        throw new Error(`tsconfig paths entry ${key}: only "prefix/*": ["dir/*"] is understood`);
      }
      aliases.set(key.slice(0, -1), resolve(appRoot, target.slice(0, -1)));
    }
    return aliases;
  }
  const ALIASES = tsconfigAliases();

  /**
   * The file a specifier names, or `undefined` for a package (checked by
   * `HEAVY` instead). A relative or aliased specifier that names no file
   * throws (review pass 3, finding 2): skipping it would leave whatever it
   * really loads unchecked.
   */
  function resolveLocal(specifier: string, fromFile: string): string | undefined {
    const alias = [...ALIASES.keys()].find((prefix) => specifier.startsWith(prefix));
    let base: string;
    if (alias !== undefined) {
      base = join(ALIASES.get(alias) ?? "", specifier.slice(alias.length));
    } else if (specifier.startsWith(".")) {
      base = resolve(dirname(fromFile), specifier);
    } else {
      return undefined;
    }
    const candidates = [
      `${base}.ts`,
      `${base}.tsx`,
      join(base, "index.ts"),
      join(base, "index.tsx"),
    ];
    const target = candidates.find(existsSync);
    if (target === undefined) {
      throw new Error(`${fromFile}: "${specifier}" resolves to none of ${candidates.join(", ")}`);
    }
    return target;
  }

  function closure(file: string, seen = new Set<string>()): Set<string> {
    if (seen.has(file)) return seen;
    if (file.endsWith(".tsx")) {
      // stripTypeScriptTypes rejects JSX: fail loudly rather than skip the file.
      throw new Error(`${file}: the scanner reads .ts only, and a .tsx is now in the walk`);
    }
    seen.add(file);
    for (const specifier of moduleLoadImports(readFileSync(file, "utf8"))) {
      const target = resolveLocal(specifier, file);
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

  it("counts an IIFE's body as module-load code, and a function only passed or stored as deferred", () => {
    const source = [
      '(async () => { await import("./iife-arrow"); })();',
      'void (async () => { await import("./iife-void"); })();',
      '(function () { import("./iife-function"); })();',
      '(function () { import("./iife-call-inside"); }());',
      '!function () { import("./iife-bang"); }();',
      '(() => import("./iife-expression"))();',
      '(async () => (await import("./iife-expression-nested")).x)();',
      '(async () => { /* gap */ await import("./iife-commented"); }) /* gap */ ();',
      'run(() => { import("./callback-block"); });',
      'run(() => import("./callback-expression"));',
      'const stored = (async () => { await import("./wrapped-not-called"); });',
      'promise.then(() => { import("./then"); }).catch(() => {});',
      'export function outer() { (async () => { await import("./iife-in-function"); })(); }',
      'const lazyIife = () => { (() => import("./iife-in-arrow"))(); };',
    ].join("\n");
    expect(moduleLoadImports(source)).toEqual([
      "./iife-arrow",
      "./iife-void",
      "./iife-function",
      "./iife-call-inside",
      "./iife-bang",
      "./iife-expression",
      "./iife-expression-nested",
      "./iife-commented",
    ]);
  });

  it("sees the review's own false green: an IIFE appended to proxy.ts loads kabinet/runtime", () => {
    const source = `${readFileSync(join(SRC, "proxy.ts"), "utf8")}
void (async () => { await import("./kabinet/runtime"); })();
`;
    expect(moduleLoadImports(source)).toContain("./kabinet/runtime");
    expect(moduleLoadImports(readFileSync(join(SRC, "proxy.ts"), "utf8"))).not.toContain(
      "./kabinet/runtime",
    );
  });

  it("follows the @/ alias from tsconfig.json to src/, and leaves packages to HEAVY", () => {
    expect([...ALIASES]).toEqual([["@/", SRC]]);
    const proxyFile = join(SRC, "proxy.ts");
    expect(resolveLocal("@/kabinet/runtime", proxyFile)).toBe(join(SRC, "kabinet", "runtime.ts"));
    expect(resolveLocal("./kabinet/limiters", proxyFile)).toBe(join(SRC, "kabinet", "limiters.ts"));
    expect(resolveLocal("next/server", proxyFile)).toBeUndefined();
    expect(resolveLocal("better-auth", proxyFile)).toBeUndefined();
  });

  it.each(["./kabinet/does-not-exist", "../nowhere", "@/kabinet/does-not-exist"])(
    "throws on %s, which resolves to no file, rather than skipping it",
    (specifier) => {
      expect(() => resolveLocal(specifier, join(SRC, "proxy.ts"))).toThrow(/resolves to none of/);
    },
  );

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
      expect.arrayContaining(["kabinet/kabinet-db.ts: ../api/db", "kabinet/auth.ts: better-auth"]),
    );
  });
});
