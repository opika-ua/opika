import { isLiveLinkUrl } from "@opika/domain/core";

/** A run of shelter-written text: plain, or a web link found in it. `start` is its offset in the text. */
export type TextPart =
  | { kind: "text"; start: number; text: string }
  | { kind: "link"; start: number; href: string; label: string };

// Only RFC 3986 URL characters, so whitespace, quotes, «», <> and Cyrillic glued on all end a link.
const URL_RUN = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi;
const SCHEME = /^https?:\/\//i;
const SENTENCE_PUNCTUATION = ".,;:!?'";

/**
 * Splits shelter-written text into plain runs and https links to a real host. An http, IP,
 * single-label, lookalike or explicit-port address stays text (`isLiveLinkUrl`), and nothing else
 * becomes a link (no javascript:, data:, bare domains); markup is never parsed, so it stays text.
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

/**
 * Drops sentence punctuation and an unmatched closing bracket: «(див. https://x.org).»
 * Bracket counts are taken once and kept as the end moves, so a long run of «)» stays linear.
 */
function trimTrailing(raw: string): string {
  const counts = { "(": 0, ")": 0, "[": 0, "]": 0 };
  for (const char of raw) if (char in counts) counts[char as keyof typeof counts]++;
  let end = raw.length;
  while (end > 0) {
    const last = raw[end - 1] ?? "";
    if (last === ")" && counts[")"] > counts["("]) counts[")"]--;
    else if (last === "]" && counts["]"] > counts["["]) counts["]"]--;
    else if (!SENTENCE_PUNCTUATION.includes(last)) break;
    end--;
  }
  return raw.slice(0, end);
}

// «https://monobank.ua@other.site» reads as one site and opens another, so it stays text.
const safeHref = (raw: string): string | null => (isLiveLinkUrl(raw) ? new URL(raw).href : null);
