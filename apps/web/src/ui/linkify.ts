/** A run of shelter-written text: plain, or a web link found in it. `start` is its offset in the text. */
export type TextPart =
  | { kind: "text"; start: number; text: string }
  | { kind: "link"; start: number; href: string; label: string };

// Only RFC 3986 URL characters, so whitespace, quotes, «», <> and Cyrillic glued on all end a link.
const URL_RUN = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi;
const SCHEME = /^https?:\/\//i;
const SENTENCE_PUNCTUATION = ".,;:!?'";

/**
 * Splits shelter-written text into plain runs and http(s) links. Nothing else becomes a link
 * (no javascript:, data:, bare domains); markup is never parsed, so it stays text.
 */
export function linkParts(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RUN)) {
    const raw = trimTrailing(match[0]);
    const href = safeHref(raw);
    if (href === null) continue;
    if (match.index > last) {
      parts.push({ kind: "text", start: last, text: text.slice(last, match.index) });
    }
    parts.push({ kind: "link", start: match.index, href, label: raw.replace(SCHEME, "") });
    last = match.index + raw.length;
  }
  if (last < text.length) parts.push({ kind: "text", start: last, text: text.slice(last) });
  return parts;
}

/** Drops sentence punctuation and an unmatched closing bracket: «(див. https://x.org).» */
function trimTrailing(raw: string): string {
  let url = raw;
  for (;;) {
    const end = url.at(-1) ?? "";
    const unmatched =
      (end === ")" && count(url, ")") > count(url, "(")) ||
      (end === "]" && count(url, "]") > count(url, "["));
    if (end === "" || (!SENTENCE_PUNCTUATION.includes(end) && !unmatched)) return url;
    url = url.slice(0, -1);
  }
}

const count = (text: string, char: string): number => text.split(char).length - 1;

function safeHref(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // «https://monobank.ua@other.site» reads as one site and opens another, so it stays text.
  if (url.username !== "" || url.password !== "" || url.hostname === "") return null;
  return url.href;
}
