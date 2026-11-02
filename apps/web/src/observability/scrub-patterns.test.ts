// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { handleMonitoringTunnel } from "../api/monitoring-tunnel";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { coarseFromUserAgentData } from "./coarse-ua";
import {
  BROWSER_FAMILIES,
  FILTERED,
  MAX_INPUT_LENGTH,
  OS_FAMILIES,
  scrubEvent,
  scrubString,
} from "./scrub";

const DSN = "https://publickey@o1.ingest.de.sentry.io/4500000000000001";

/** Sends an event through the real tunnel handler and returns the event Sentry would receive. */
async function throughTunnel(event: Record<string, unknown>): Promise<Record<string, unknown>> {
  const forward = vi.fn(async () => new Response("{}", { status: 200 }));
  const payload = JSON.stringify(event);
  const body = [
    JSON.stringify({ event_id: "e1", dsn: DSN }),
    JSON.stringify({ type: "event", length: Buffer.byteLength(payload) }),
    payload,
  ].join("\n");
  await handleMonitoringTunnel(
    new Request("https://opika.example/api/monitoring", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body,
    }),
    {
      dsn: DSN,
      ipKey: "ip:test",
      limiter: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 100 }),
      now: new Date("2026-11-01T12:00:00Z"),
      forward: forward as unknown as typeof fetch,
    },
  );
  const sent = (forward.mock.calls[0] as unknown as [string, { body: string }])[1].body;
  return JSON.parse(sent.split("\n")[2] as string) as Record<string, unknown>;
}

type Texted = { message: string; exception: { values: { value: string }[] } };

/** The text in every place a string can sit, by every route the scrubber runs on. */
async function outputs(text: string): Promise<string[]> {
  const event = { message: text, exception: { values: [{ type: "Error", value: text }] } };
  const direct = scrubEvent(event) as unknown as Texted;
  const tunnelled = (await throughTunnel(event)) as unknown as Texted;
  return [
    scrubString(text),
    direct.message,
    direct.exception.values[0]?.value as string,
    tunnelled.message,
    tunnelled.exception.values[0]?.value as string,
  ];
}

const REDACTED: [label: string, text: string, secret: string][] = [
  ["PL +48 with spaces", "call +48 500 123 456 now", "500 123"],
  ["PL +48 grouped 2-3-2-2", "tel +48 22 123 45 67 failed", "123 45"],
  ["PL +48 with dashes and brackets", "(+48) 500-123-456 failed", "500-123"],
  ["PL 00 prefix", "0048 500 123 456 failed", "500 123"],
  ["PL with slash", "050/123-45-67 failed", "123-45"],
  ["PL with en dash", "050–123–45–67 failed", "123"],
  ["PL groups without prefix", "number 500 123 456 failed", "500 123"],
  ["UA with en dash", "+38 (050) 123–45–67 failed", "123"],
  ["UA number then a colon and a digit", "0501234567:1 failed", "0501234567"],
  ["UA grouped number then colon", "050 123 45 67:9 failed", "123 45"],
  ["UA +380 then colon", "+380501234567:1 failed", "501234567"],
  ["UA number before a time", "тел. 0501234567:10:30", "0501234567"],
  ["DE", "+49 30 12345678 failed", "12345678"],
  ["DE with trunk zero", "+49 (0) 30 1234567 failed", "1234567"],
  ["FR with dots", "+33 1.23.45.67.89 failed", "23.45"],
  ["UK", "+44 20 7946 0958 failed", "7946"],
  ["CZ", "+420 601 123 456 failed", "601 123"],
  ["SK", "+421 912 345 678 failed", "912 345"],
  ["t.me link", "see https://t.me/olena_k_shelter for", "olena_k"],
  ["t.me without scheme", "see t.me/olena_k_shelter for", "olena_k"],
  ["telegram.me link", "http://telegram.me/olenak and", "olenak"],
  ["telegram.dog link", "https://telegram.dog/olenak and", "olenak"],
  ["tg deep link", "open tg://resolve?domain=olenak now", "olenak"],
  ["handle after telegram", "Telegram: @olena_k please", "olena_k"],
  ["handle after tg", "tg @olena_k please", "olena_k"],
  ["handle before telegram", "write @olena_k in telegram", "olena_k"],
  ["handle Cyrillic context", "Телеграм - @olena_k", "olena_k"],
  ["UA street abbreviated", "доставка: вул. Шевченка, 15 не вдалась", "Шевченка"],
  ["UA street with flat", "вул. Івана Франка 25/3", "Франка"],
  ["UA street spelled out", "вулиця Лесі Українки, буд. 7А", "Українки"],
  ["UA avenue", "просп. Перемоги 12", "Перемоги"],
  ["UA lane", "пров. Тихий, 4", "Тихий"],
  ["UA number first", "15, вул. Шевченка", "Шевченка"],
  ["PL ul. short", "adres: ul. Kwiatowa 12/4 błąd", "Kwiatowa"],
  ["PL ulica", "ulica Marszałkowska 100", "Marszałkowska"],
  ["PL multi word", "ul. Jana Pawła II 5", "Pawła"],
  ["EN name first", "ship to Baker Street 221 failed", "Baker"],
  ["EN St", "ship to Main St 5 failed", "Main"],
  ["EN number first", "ship to 221B Baker Street failed", "Baker"],
  ["EN number first Road", "at 10 Abbey Road today", "Abbey"],
];

describe("free-text scrubber: contact and address formats", () => {
  it.each(REDACTED)(
    "removes %s in message, exception value and through the tunnel",
    async (_label, text, secret) => {
      expect(text).toContain(secret);
      for (const out of await outputs(text)) {
        expect(out).not.toContain(secret);
        expect(out).toContain(FILTERED);
      }
    },
  );

  it("keeps the words around a removed phone or handle", () => {
    expect(scrubString("call +48 500 123 456 now")).toBe(`call ${FILTERED} now`);
    expect(scrubString("Telegram: @olena_k please")).toBe(`Telegram: ${FILTERED} please`);
  });
});

const UNTOUCHED = [
  "2026-11-02T10:30:15.123Z",
  "02.11.2026 10:30",
  "12/11/2026",
  "Next.js 16.4.1 and react 19.2.0",
  "node v24.1.0, version 18.1.2, 1.0.0+20130313144700",
  "build 8acdd80 and commit 8acdd80f2b7c4d1e9a3b5c6d7e8f9a0b1c2d3e4f",
  "deploy dpl_5xK2mQ9Rw3TzYvB1",
  "ECONNREFUSED 127.0.0.1:5432 on port 3000",
  "HTTP 500, code E1234, errno -4058, status 404",
  "id 12345678 and 3 of 10 cards",
  "uuid 3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b",
  "Не вдалося завантажити вулицю та проспект",
  "вулкан Етна 5 разів, провулок без номера",
  "вулиця Шевченка",
  "at reveal (webpack-internal:///(app-pages-browser)/./src/features/animals/card.tsx:123:45)",
  "at Object.<anonymous> (/app/.next/server/chunks/ssr/page.js:10:2048)",
  "import @types/node and @sentry/nextjs failed",
  "Telegram integration is disabled",
  "1st Street is not a thing, 2 Streets",
  "price 1 200 000 UAH, 500 items",
];

describe("free-text scrubber: false positives stay untouched", () => {
  it.each(UNTOUCHED)("leaves %s alone", async (text) => {
    for (const out of await outputs(text)) expect(out).toBe(text);
  });
});

describe("free-text scrubber: timing", () => {
  const SIZE = 64 * 1024;
  const fill = (unit: string) => unit.repeat(Math.ceil(SIZE / unit.length)).slice(0, SIZE);
  // Trigger tokens of every pattern, near-misses (no number, no street word end) and long runs of
  // the separators the phone and address patterns skip over.
  const hostile: Record<string, string> = {
    digits: fill("1"),
    "digit-space": fill("1 "),
    "zero-space": fill("0 "),
    plus: fill("+"),
    "plus-digit": fill("+1 "),
    "intl-prefix": fill("00 "),
    "ua-prefix": fill("+38 (0"),
    spaces: fill(" "),
    "digit-then-spaces": `1${fill(" ")}A`,
    dots: fill("."),
    hyphens: fill("-"),
    "en-dashes": fill("–"),
    "mixed-separators": fill(" .-–()"),
    "digit-separators": fill("1 .-"),
    "polish-groups": fill("500 123 "),
    slashes: fill("12/"),
    "street-uk": fill("вул. "),
    "street-uk-glued": fill("вул."),
    "street-boulevard": fill("б-р. "),
    "street-boulevard-glued": fill("б-р."),
    "street-prospect": fill("просп. "),
    "street-pl": fill("ul. A "),
    "street-pl-glued": fill("ul."),
    "street-name-words": `вул. ${fill("Шевченка ")}`,
    "street-name-dots": `вул. ${fill("а.")}`,
    "street-name-hyphens": `вул. ${fill("а-")}`,
    "number-first": fill("1, вул. "),
    "number-first-letters": fill("12а, ul. "),
    "english-names": fill("1 Aa "),
    "english-suffix": fill("Aa Street "),
    "english-name-first": fill("Aa Bb Cc Street No "),
    telegram: fill("Telegram "),
    handles: fill("@aaaa "),
    "handle-gap": fill("@abc tg "),
    "tme-links": fill("t.me/"),
    "tg-links": fill("tg://"),
    emails: fill("a@b."),
    "email-labels": `${fill("a")}@${fill("b")}`,
    "email-dots": fill("a.b@"),
    bearer: fill("Bearer "),
    "bearer-token": `Bearer ${fill("a")}`,
    cookie: fill("cookie:"),
    gate: fill("gate="),
    query: fill("http://a/?"),
    "query-path": fill("/a?"),
    letters: fill("A"),
    unicode: fill("Ж"),
  };

  it("scrubs 64 kB hostile inputs in under 50 ms each, once warm", () => {
    scrubString("warm-up call 0501234567 вул. Шевченка 1");
    for (const [label, input] of Object.entries(hostile)) {
      expect(input.length, label).toBeGreaterThanOrEqual(SIZE);
      // Best of three: a noisy CI neighbour slows one run, a quadratic pattern slows all of them.
      const times = [0, 1, 2].map(() => {
        const started = performance.now();
        scrubString(input);
        return performance.now() - started;
      });
      expect(Math.min(...times), `slow on ${label}`).toBeLessThan(50);
    }
  });

  it("cuts a string at the input cap before any pattern runs, and says so", () => {
    const out = scrubString(`${"x".repeat(MAX_INPUT_LENGTH)}+380501234567`);
    expect(out).not.toContain("0501234567");
    expect(out.endsWith("[truncated]")).toBe(true);
  });

  it("still redacts a contact inside the cap, however long the string", () => {
    const out = scrubString(`call +380 50 123 45 67 now${" ".repeat(MAX_INPUT_LENGTH * 2)}`);
    expect(out).not.toContain("123 45 67");
    expect(out).toContain(FILTERED);
  });
});

const ctxEvent = (browser: unknown, os: unknown) => ({
  event_id: "e1",
  contexts: { browser, os },
});
type Ctx = { contexts: Record<string, unknown> };

describe("contexts: closed family lists, server-side", () => {
  const free = [
    "Tel 050 123 45 67",
    "olena@example.ua",
    "https://t.me/olena",
    "Олена Коваль",
    "x".repeat(40),
    "Mozilla/5.0 (Linux; Android 14)",
  ];

  it.each(free)(
    "turns %j into other as browser name and as os name, also through the tunnel",
    async (text) => {
      const event = ctxEvent({ name: text, version: "130" }, { name: text, version: "14" });
      const direct = scrubEvent(event) as Ctx;
      const tunnelled = (await throughTunnel(event)) as Ctx;
      for (const out of [direct, tunnelled]) {
        expect(out.contexts).toEqual({
          browser: { name: "other", version: "130" },
          os: { name: "other", version: "14" },
        });
      }
    },
  );

  it.each([
    ["Chrome", "Android"],
    ["Safari", "iOS"],
    ["Firefox", "Windows"],
    ["Edge", "macOS"],
    ["Samsung Internet", "Linux"],
    ["Opera", "ChromeOS"],
    ["Yandex", "iPadOS"],
  ])("keeps the listed names %s and %s", (browser, os) => {
    expect(scrubEvent(ctxEvent({ name: browser }, { name: os })).contexts).toEqual({
      browser: { name: browser },
      os: { name: os },
    });
  });

  it("is case sensitive, and a name from the other list is other", () => {
    expect(scrubEvent(ctxEvent({ name: "chrome" }, { name: "Haiku" })).contexts).toEqual({
      browser: { name: "other" },
      os: { name: "other" },
    });
    expect(scrubEvent(ctxEvent({ name: "Windows" }, { name: "Chrome" })).contexts).toEqual({
      browser: { name: "other" },
      os: { name: "other" },
    });
  });

  it("keeps the parser's own unknown", () => {
    expect(scrubEvent(ctxEvent({ name: "unknown" }, { name: "unknown" })).contexts).toEqual({
      browser: { name: "unknown" },
      os: { name: "unknown" },
    });
  });

  it("pins the closed lists exactly, so adding a name fails here", () => {
    expect([...BROWSER_FAMILIES].sort()).toEqual(
      [
        "Chrome",
        "Safari",
        "Firefox",
        "Edge",
        "Samsung Internet",
        "Opera",
        "Yandex",
        "unknown",
      ].sort(),
    );
    expect([...OS_FAMILIES].sort()).toEqual(
      ["iOS", "iPadOS", "Android", "Windows", "macOS", "Linux", "ChromeOS", "unknown"].sort(),
    );
  });

  it("passes exactly the listed literals plus unknown and other, per list", () => {
    const browsers = ["Chrome", "Safari", "Firefox", "Edge", "Samsung Internet", "Opera", "Yandex"];
    const systems = ["iOS", "iPadOS", "Android", "Windows", "macOS", "Linux", "ChromeOS"];
    const nameOf = (ctx: unknown, key: "browser" | "os") =>
      (scrubEvent({ contexts: { [key]: ctx } }).contexts as Record<string, { name: string }>)[key]
        ?.name;
    for (const [key, list] of [
      ["browser", browsers],
      ["os", systems],
    ] as const) {
      for (const name of [...list, "unknown", "other"]) {
        expect(nameOf({ name }, key), `${key} ${name}`).toBe(name);
      }
      const forged = [
        "Unknown",
        "UNKNOWN",
        "unknown ",
        " unknown",
        "Other",
        "",
        ["unknown"],
        ["Chrome"],
        5,
        null,
      ];
      for (const name of forged) {
        expect(nameOf({ name }, key), `${key} ${JSON.stringify(name)}`).toBe("other");
      }
    }
  });

  it("treats a context that is not an object as other", () => {
    expect(scrubEvent(ctxEvent("Chrome", null)).contexts).toEqual({
      browser: { name: "other" },
      os: { name: "other" },
    });
  });
});

describe("contexts: the major-version check", () => {
  const versionOf = (version: unknown) =>
    (
      scrubEvent(ctxEvent({ name: "Chrome", version }, { name: "Android" })).contexts as {
        browser: { version?: string };
      }
    ).browser.version;

  it.each([
    "130.0.6723.58",
    "130.0",
    "1300",
    "13a",
    "",
    " 130",
    "130 ",
    "-1",
    "Tel 050 123 45 67",
    130,
    null,
  ])("drops the version %j", (version) => {
    expect(versionOf(version)).toBeUndefined();
  });

  it.each(["1", "18", "130"])("keeps the major version %s", (version) => {
    expect(versionOf(version)).toBe(version);
  });

  it("drops a forged minor version through the tunnel too", async () => {
    const out = (await throughTunnel(
      ctxEvent(
        { name: "Chrome", version: "130.0.6723.58" },
        { name: "Windows", version: "10.0.1" },
      ),
    )) as Ctx;
    expect(out.contexts).toEqual({ browser: { name: "Chrome" }, os: { name: "Windows" } });
  });
});

describe("userAgentData with a malformed brands list", () => {
  const fallbackUa =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

  it.each([
    ["a string", "Chrome"],
    ["an object", { brand: "Chrome", version: "130" }],
    ["a number", 7],
    ["null", null],
    ["undefined", undefined],
  ])("treats brands that is %s as missing", (_label, brands) => {
    const out = coarseFromUserAgentData({ brands, platform: "Windows" }, fallbackUa);
    expect(out.browser).toEqual({ name: "Chrome", version: "130" });
    expect(out.os.name).toBe("Windows");
  });

  it("renames the YaBrowser brand to Yandex", () => {
    const out = coarseFromUserAgentData({
      brands: [
        { brand: "YaBrowser", version: "24.10.1" },
        { brand: "Chromium", version: "130" },
      ],
      platform: "Windows",
    });
    expect(out.browser).toEqual({ name: "Yandex", version: "24" });
  });

  it("skips null and non-object entries and keeps the good ones", () => {
    const out = coarseFromUserAgentData({
      brands: [null, undefined, "Chrome", 5, { brand: "Google Chrome", version: "131.0.1" }],
      platform: "Android",
    });
    expect(out.browser).toEqual({ name: "Chrome", version: "131" });
  });
});
