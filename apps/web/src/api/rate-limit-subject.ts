/**
 * What a per-IP budget is charged to, before it is HMAC'd into a key
 * (`ipKeyWith`, the one path every per-IP limiter takes).
 *
 * Audit F2: an IPv6 /64 is one subscriber's allocation, so keying on the full
 * address gives one caller 2^64 fresh budgets. Each form, one subject:
 * - IPv4: the address itself (no wider prefix).
 * - IPv4-mapped IPv6 (`::ffff:a.b.c.d`, in any spelling): that IPv4 address.
 * - Any other IPv6, in any spelling: its /64, as `a:b:c:d::/64`.
 * - Anything that parses as neither: one shared subject, `UNPARSED_SUBJECT`.
 *   A garbled or spoofed value can then never mint a fresh budget; at worst a
 *   misconfigured proxy merges callers into one bucket, which shows up as an
 *   over-eager limiter rather than a missing one.
 */
export const UNPARSED_SUBJECT = "unknown";

export function rateLimitSubjectOf(ip: string): string {
  const text = ip.trim();
  const v4 = ipv4OctetsOf(text);
  if (v4 !== null) return v4.join(".");
  const v6 = ipv6HextetsOf(text);
  if (v6 === null) return UNPARSED_SUBJECT;
  if (isIpv4Mapped(v6)) {
    const [, , , , , , high = 0, low = 0] = v6;
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
  }
  return `${v6
    .slice(0, 4)
    .map((h) => h.toString(16))
    .join(":")}::/64`;
}

/** Four decimal octets, each 0-255, or null. */
function ipv4OctetsOf(text: string): number[] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (match === null) return null;
  const octets = match.slice(1).map(Number);
  return octets.every((o) => o <= 255) ? octets : null;
}

/** The eight 16-bit groups of an RFC 4291 textual address, or null. No zone ids, no brackets. */
function ipv6HextetsOf(text: string): number[] | null {
  if (!/^[0-9A-Fa-f:.]+$/.test(text)) return null;
  const halves = text.split("::");
  if (halves.length > 2) return null;
  if (halves.length === 1) {
    const groups = groupsOf(halves[0] ?? "", true);
    return groups?.length === 8 ? groups : null;
  }
  // An embedded IPv4 may only end the address, so only the part after `::` may hold one.
  const head = groupsOf(halves[0] ?? "", false);
  const tail = groupsOf(halves[1] ?? "", true);
  if (head === null || tail === null) return null;
  const elided = 8 - head.length - tail.length;
  if (elided < 1) return null;
  return [...head, ...new Array<number>(elided).fill(0), ...tail];
}

function groupsOf(part: string, ipv4MayEnd: boolean): number[] | null {
  if (part === "") return [];
  const fields = part.split(":");
  const groups: number[] = [];
  for (const [index, field] of fields.entries()) {
    if (ipv4MayEnd && index === fields.length - 1 && field.includes(".")) {
      const octets = ipv4OctetsOf(field);
      if (octets === null) return null;
      const [a = 0, b = 0, c = 0, d = 0] = octets;
      groups.push((a << 8) | b, (c << 8) | d);
    } else if (/^[0-9A-Fa-f]{1,4}$/.test(field)) {
      groups.push(Number.parseInt(field, 16));
    } else {
      return null;
    }
  }
  return groups;
}

/** `::ffff:0:0/96`: 80 zero bits, then 16 one bits. */
function isIpv4Mapped(groups: readonly number[]): boolean {
  return groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
}
