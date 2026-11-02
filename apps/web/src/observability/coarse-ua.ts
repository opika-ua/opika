/**
 * Browser and system as a family plus a major version ("Safari 18", "iOS 18"), nothing finer: never
 * the raw user-agent string, a minor version or a device model. This is what the approved /pro
 * sentence ("the browser and the operating system") promises. Pure, no regex over the input.
 */

export type CoarseName = { name: string; version?: string };
export type CoarseContexts = { browser: CoarseName; os: CoarseName };

export const UNKNOWN = "unknown";
/** A real UA is well under this; the cap keeps every scan bounded. */
const MAX_UA_LENGTH = 512;

const isDigit = (ch: string | undefined): boolean => ch !== undefined && ch >= "0" && ch <= "9";

/** The digits right after `token` (the major version, up to 3 digits), or undefined. */
function majorAfter(ua: string, token: string): string | undefined {
  const at = ua.indexOf(token);
  if (at === -1) return undefined;
  let end = at + token.length;
  const start = end;
  while (end < ua.length && end - start < 3 && isDigit(ua[end])) end += 1;
  return end > start ? ua.slice(start, end) : undefined;
}

const named = (name: string, version?: string): CoarseName =>
  version === undefined ? { name } : { name, version };

const BROWSER_TOKENS: readonly (readonly [token: string, name: string])[] = [
  ["EdgA/", "Edge"],
  ["EdgiOS/", "Edge"],
  ["Edg/", "Edge"],
  ["OPR/", "Opera"],
  ["SamsungBrowser/", "Samsung Internet"],
  ["FxiOS/", "Firefox"],
  ["Firefox/", "Firefox"],
  ["CriOS/", "Chrome"],
  ["Chrome/", "Chrome"],
];

const BOT_MARKERS = ["bot", "crawl", "spider", "slurp"];

function browserOf(ua: string): CoarseName {
  const lower = ua.toLowerCase();
  if (BOT_MARKERS.some((marker) => lower.includes(marker))) return { name: "Bot" };
  for (const [token, name] of BROWSER_TOKENS) {
    const version = majorAfter(ua, token);
    if (version !== undefined) return named(name, version);
  }
  const safari = ua.includes("Safari/") ? majorAfter(ua, "Version/") : undefined;
  return safari === undefined ? { name: UNKNOWN } : named("Safari", safari);
}

function osOf(ua: string): CoarseName {
  const windows = majorAfter(ua, "Windows NT ");
  if (windows !== undefined) return named("Windows", windows === "10" ? "10" : undefined);
  const android = majorAfter(ua, "Android ");
  if (ua.includes("Android")) return named("Android", android);
  if (ua.includes("iPhone") || ua.includes("iPad") || ua.includes("iPod")) {
    return named("iOS", majorAfter(ua, "iPhone OS ") ?? majorAfter(ua, "CPU OS "));
  }
  if (ua.includes("Mac OS X")) {
    // Browsers freeze the macOS version at 10_15_7, so a 10 says nothing true.
    const major = majorAfter(ua, "Mac OS X ");
    return named("macOS", major !== undefined && Number(major) >= 11 ? major : undefined);
  }
  if (ua.includes("CrOS")) return { name: "ChromeOS" };
  if (ua.includes("Linux")) return { name: "Linux" };
  return { name: UNKNOWN };
}

/** From a User-Agent header or `navigator.userAgent`; anything unrecognised becomes "unknown". */
export function coarseFromUserAgent(userAgent: unknown): CoarseContexts {
  if (typeof userAgent !== "string") return { browser: { name: UNKNOWN }, os: { name: UNKNOWN } };
  const ua = userAgent.slice(0, MAX_UA_LENGTH);
  return { browser: browserOf(ua), os: osOf(ua) };
}

/** The low-entropy part of `navigator.userAgentData` (what it gives without asking the user). */
export type UserAgentDataLike = {
  brands?: unknown;
  platform?: unknown;
};

const BRAND_RENAMES: Record<string, string> = {
  "Google Chrome": "Chrome",
  "Microsoft Edge": "Edge",
  "Chrome OS": "ChromeOS",
  "Chromium OS": "ChromeOS",
};
const rename = (value: string): string => BRAND_RENAMES[value] ?? value;
const isGrease = (brand: string): boolean => /^not.{0,4}a.{0,4}brand/i.test(brand);

function majorOf(version: unknown): string | undefined {
  if (typeof version !== "string") return undefined;
  const dot = version.indexOf(".");
  const major = (dot === -1 ? version : version.slice(0, dot)).slice(0, 3);
  return major !== "" && [...major].every(isDigit) ? major : undefined;
}

/**
 * Prefers `userAgentData` (brand and platform, low entropy only); the UA string, when given, only
 * fills what it lacks (the system's major version), and only its coarse result is kept.
 */
export function coarseFromUserAgentData(
  data: UserAgentDataLike | undefined,
  fallbackUserAgent?: unknown,
): CoarseContexts {
  const fallback = coarseFromUserAgent(fallbackUserAgent);
  // A tampered or odd `brands` (not an array, null or non-object entries) counts as missing, never throws.
  const list: readonly unknown[] = Array.isArray(data?.brands) ? data.brands : [];
  const brands = list.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { brand, version } = entry as { brand?: unknown; version?: unknown };
    return typeof brand === "string" && brand.length <= 64 && !isGrease(brand)
      ? [{ name: rename(brand), version: majorOf(version) }]
      : [];
  });
  // "Chromium" is the engine every Chromium browser lists; a specific brand beats it.
  const brand = brands.find((b) => b.name !== "Chromium") ?? brands[0];
  const platform = typeof data?.platform === "string" ? rename(data.platform) : "";
  const browser = brand === undefined ? fallback.browser : named(brand.name, brand.version);
  const os =
    platform === "" || platform === "Unknown"
      ? fallback.os
      : named(platform, fallback.os.name === platform ? fallback.os.version : undefined);
  return { browser, os };
}
