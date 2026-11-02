import { describe, expect, it } from "vitest";
import { coarseFromUserAgent, coarseFromUserAgentData } from "./coarse-ua";

const UA = {
  chromeWin:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  edgeWin:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.70",
  firefoxMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  safariIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Mobile/15E148 Safari/604.1",
  chromeIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1",
  ipadSafari:
    "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.58 Mobile Safari/537.36",
  samsung:
    "Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  firefoxAndroid: "Mozilla/5.0 (Android 14; Mobile; rv:133.0) Gecko/133.0 Firefox/133.0",
  operaWin:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0",
  linuxFirefox: "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
  chromeOs:
    "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  googlebot:
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.85 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
};

describe("coarseFromUserAgent: family and major version, over real user-agent strings", () => {
  it.each([
    [UA.chromeWin, { name: "Chrome", version: "131" }, { name: "Windows", version: "10" }],
    [UA.edgeWin, { name: "Edge", version: "131" }, { name: "Windows", version: "10" }],
    [UA.firefoxMac, { name: "Firefox", version: "133" }, { name: "macOS" }],
    [UA.safariMac, { name: "Safari", version: "18" }, { name: "macOS" }],
    [UA.safariIos, { name: "Safari", version: "18" }, { name: "iOS", version: "18" }],
    [UA.chromeIos, { name: "Chrome", version: "130" }, { name: "iOS", version: "17" }],
    [UA.ipadSafari, { name: "Safari", version: "17" }, { name: "iOS", version: "17" }],
    [UA.chromeAndroid, { name: "Chrome", version: "130" }, { name: "Android", version: "14" }],
    [UA.samsung, { name: "Samsung Internet", version: "25" }, { name: "Android", version: "13" }],
    [UA.firefoxAndroid, { name: "Firefox", version: "133" }, { name: "Android", version: "14" }],
    [UA.operaWin, { name: "Opera", version: "115" }, { name: "Windows", version: "10" }],
    [UA.linuxFirefox, { name: "Firefox", version: "128" }, { name: "Linux" }],
    [UA.chromeOs, { name: "Chrome", version: "131" }, { name: "ChromeOS" }],
    [UA.googlebot, { name: "Bot" }, { name: "Android", version: "6" }],
  ])("%s", (ua, browser, os) => {
    expect(coarseFromUserAgent(ua)).toEqual({ browser, os });
  });

  it.each([
    ["empty", ""],
    ["unrecognised", "SECRETAGENT/9.9.9 (device model X)"],
    ["not a string", undefined],
  ])("%s gives unknown, never the input", (_label, input) => {
    const out = coarseFromUserAgent(input);
    expect(out).toEqual({ browser: { name: "unknown" }, os: { name: "unknown" } });
    expect(JSON.stringify(out)).not.toContain("SECRETAGENT");
  });

  it("garbage with the right words but no digits gives a name without a version", () => {
    const out = coarseFromUserAgent("\u0000\ud800 ((( Chrome/ Version/ Safari/ Windows NT Android");
    expect(out.browser.version).toBeUndefined();
    expect(out.os.version).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain("(((");
  });

  it("never returns more than a short name and at most three digits, whatever the input", () => {
    const hostile = `Chrome/${"9".repeat(5000)} Android ${"8".repeat(5000)} ${"a".repeat(100000)}`;
    const out = coarseFromUserAgent(hostile);
    for (const part of [out.browser, out.os]) {
      expect(part.name).toMatch(/^[A-Za-z ]{1,32}$/);
      expect(part.version ?? "").toMatch(/^\d{0,3}$/);
    }
  });

  it("drops a version of more than three digits instead of cutting it short", () => {
    expect(coarseFromUserAgent("Chrome/1300.0.0 Safari/537.36").browser).toEqual({
      name: "unknown",
    });
    expect(coarseFromUserAgent("Linux; Android 1400").os).toEqual({ name: "Android" });
    expect(
      coarseFromUserAgentData({ brands: [{ brand: "Google Chrome", version: "1300" }] }).browser,
    ).toEqual({
      name: "Chrome",
    });
  });

  it("names Yandex Browser, which also carries a Chrome token", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 YaBrowser/24.4.0 Yowser/2.5 Safari/537.36";
    expect(coarseFromUserAgent(ua).browser).toEqual({ name: "Yandex", version: "24" });
  });

  it("is linear on a long input", () => {
    const started = performance.now();
    coarseFromUserAgent(`${"Mozilla ".repeat(200000)}Chrome/131`);
    expect(performance.now() - started).toBeLessThan(200);
  });
});

describe("coarseFromUserAgentData: low-entropy brands and platform only", () => {
  it("skips the placeholder brand and prefers a specific brand over Chromium", () => {
    expect(
      coarseFromUserAgentData({
        brands: [
          { brand: "Not A(Brand", version: "8.0.0.0" },
          { brand: "Chromium", version: "131.0.6778.86" },
          { brand: "Microsoft Edge", version: "131.0.2903.70" },
        ],
        platform: "macOS",
      }),
    ).toEqual({ browser: { name: "Edge", version: "131" }, os: { name: "macOS" } });
  });

  it("falls back to Chromium when it is the only real brand", () => {
    expect(
      coarseFromUserAgentData({
        brands: [
          { brand: "Chromium", version: "131" },
          { brand: "Not;A=Brand", version: "24" },
        ],
        platform: "Chrome OS",
      }),
    ).toEqual({ browser: { name: "Chromium", version: "131" }, os: { name: "ChromeOS" } });
  });

  it("takes the system's major version from the UA only when the platform agrees", () => {
    const data = { brands: [{ brand: "Google Chrome", version: "130" }], platform: "Android" };
    expect(coarseFromUserAgentData(data, UA.chromeAndroid).os).toEqual({
      name: "Android",
      version: "14",
    });
    expect(coarseFromUserAgentData({ ...data, platform: "Windows" }, UA.chromeAndroid).os).toEqual({
      name: "Windows",
    });
  });

  it("uses the UA string for what userAgentData does not give, and unknown for nothing", () => {
    expect(coarseFromUserAgentData({}, UA.safariIos)).toEqual(coarseFromUserAgent(UA.safariIos));
    expect(coarseFromUserAgentData({ brands: [], platform: "Unknown" })).toEqual({
      browser: { name: "unknown" },
      os: { name: "unknown" },
    });
  });
});
