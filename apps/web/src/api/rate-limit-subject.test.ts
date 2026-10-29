import { describe, expect, it } from "vitest";
import { ipKeyWith } from "./rate-limit-key";
import { rateLimitSubjectOf, UNPARSED_SUBJECT } from "./rate-limit-subject";

/**
 * Audit F2: every per-IP budget keys an IPv6 caller on its /64. Asserted on
 * the subject and again on the HMAC'd key, since `ipKeyWith` is the path every
 * per-IP limiter takes (`rate-limit-key.test.ts` scans for any other).
 */
const SECRET = "test-rate-limit-key-secret-aaaaaaaaaaaaaaaa";

describe("rateLimitSubjectOf", () => {
  it("leaves an IPv4 address as it is: no wider prefix", () => {
    expect(rateLimitSubjectOf("203.0.113.77")).toBe("203.0.113.77");
    expect(rateLimitSubjectOf(" 203.0.113.77 ")).toBe("203.0.113.77");
    expect(rateLimitSubjectOf("203.0.113.78")).not.toBe(rateLimitSubjectOf("203.0.113.77"));
  });

  it("reduces IPv6 to its /64: two addresses in one /64 collide", () => {
    expect(rateLimitSubjectOf("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe("2001:db8:1:2::/64");
    expect(rateLimitSubjectOf("2001:db8:1:2::1")).toBe("2001:db8:1:2::/64");
    expect(ipKeyWith(SECRET, "2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe(
      ipKeyWith(SECRET, "2001:db8:1:2::1"),
    );
  });

  it("keeps different /64s apart, down to the last bit of the prefix", () => {
    expect(rateLimitSubjectOf("2001:db8:1:3::1")).toBe("2001:db8:1:3::/64");
    expect(ipKeyWith(SECRET, "2001:db8:1:2::1")).not.toBe(ipKeyWith(SECRET, "2001:db8:1:3::1"));
    expect(ipKeyWith(SECRET, "2001:db8:1:2::1")).not.toBe(ipKeyWith(SECRET, "2001:db8:1:0::1"));
  });

  it("reads every spelling of one address the same: compressed, zero-padded, upper case", () => {
    const spellings = [
      "2001:0db8:0001:0002:0000:0000:0000:0001",
      "2001:db8:1:2:0:0:0:1",
      "2001:db8:1:2::1",
      "2001:DB8:1:2::1",
      "2001:db8:1:2:0::1",
    ];
    for (const spelling of spellings) {
      expect(rateLimitSubjectOf(spelling), spelling).toBe("2001:db8:1:2::/64");
    }
    // `::` standing for the prefix's own zeros.
    expect(rateLimitSubjectOf("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(rateLimitSubjectOf("2001:db8::")).toBe("2001:db8:0:0::/64");
    expect(rateLimitSubjectOf("::1")).toBe("0:0:0:0::/64");
    expect(rateLimitSubjectOf("::")).toBe("0:0:0:0::/64");
    // An IPv4 tail on an ordinary IPv6 address is just its last 32 bits.
    expect(rateLimitSubjectOf("64:ff9b::192.0.2.1")).toBe("64:ff9b:0:0::/64");
  });

  it("treats an IPv4-mapped IPv6 address as that IPv4 address, in any spelling", () => {
    for (const mapped of [
      "::ffff:203.0.113.77",
      "::FFFF:203.0.113.77",
      "0:0:0:0:0:ffff:203.0.113.77",
      "::ffff:cb00:714d",
    ]) {
      expect(rateLimitSubjectOf(mapped), mapped).toBe("203.0.113.77");
      expect(ipKeyWith(SECRET, mapped), mapped).toBe(ipKeyWith(SECRET, "203.0.113.77"));
    }
  });

  /**
   * Decided: malformed input falls back to one shared bucket, never to the raw
   * string. Keyed on the raw string, every distinct garbage value would be a
   * fresh budget.
   */
  it("puts anything it can't parse into one shared bucket, so garbage can't mint budgets", () => {
    const malformed = [
      "unknown",
      "",
      "   ",
      "not-an-ip",
      "256.1.1.1",
      "1.2.3",
      "1.2.3.4.5",
      "203.0.113.77:443",
      "[2001:db8::1]",
      "[2001:db8::1]:443",
      "fe80::1%eth0",
      "2001:db8::1::2",
      "2001:db8:1:2:3:4:5:6:7",
      "2001:db8:1:2:3:4:5",
      "2001:db8:1:2:3:4:5:6::",
      ":2001:db8::1",
      "2001:db8::1:",
      "12345::1",
      "g::1",
      "1.2.3.4::1",
      "::ffff:256.0.0.1",
    ];
    for (const value of malformed) {
      expect(rateLimitSubjectOf(value), JSON.stringify(value)).toBe(UNPARSED_SUBJECT);
      expect(ipKeyWith(SECRET, value), JSON.stringify(value)).toBe(ipKeyWith(SECRET, "unknown"));
    }
  });
});
