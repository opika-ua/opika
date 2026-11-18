import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { addressKeyWith, derivedKeyWith, derivedSecretKey, ipKeyWith } from "./rate-limit-key";

const SECRET = "a-secret-long-enough-for-every-rule-here-0123456789";
const digestOf = (key: string) => key.slice(key.indexOf(":") + 1);

describe("derivedSecretKey: a key of its own under the rate-limit secret", () => {
  it("is HMAC(secret, 'derive:' + label), the same for the same label", () => {
    expect(derivedKeyWith(SECRET, "registration-form-stamp")).toBe(
      createHmac("sha256", SECRET).update("derive:registration-form-stamp").digest("base64url"),
    );
    expect(derivedSecretKey("x", { RATE_LIMIT_KEY_SECRET: SECRET })).toBe(
      derivedKeyWith(SECRET, "x"),
    );
  });

  it("never equals a limiter key's digest, even for a label spelled like an address or an IP", () => {
    for (const label of ["olena@example.org", "198.51.100.7", "registration-form-stamp"]) {
      expect(derivedKeyWith(SECRET, label)).not.toBe(digestOf(addressKeyWith(SECRET, label)));
      expect(derivedKeyWith(SECRET, label)).not.toBe(digestOf(ipKeyWith(SECRET, label)));
    }
  });

  it("differs by label", () => {
    expect(derivedKeyWith(SECRET, "a")).not.toBe(derivedKeyWith(SECRET, "b"));
  });
});
