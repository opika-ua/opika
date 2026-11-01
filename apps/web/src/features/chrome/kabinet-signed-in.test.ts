import { describe, expect, it } from "vitest";
import { kabinetSessionCookiePresent, kabinetSignedInFrom } from "./kabinet-signed-in";

function storeWith(...names: string[]) {
  return { has: (name: string) => names.includes(name) };
}

describe("kabinetSignedInFrom", () => {
  it("is true when the production-mode (__Host-) cookie is present", () => {
    expect(kabinetSignedInFrom(storeWith("__Host-kabinet.session_token"))).toBe(true);
  });

  it("is true when the dev-mode (bare) cookie is present", () => {
    expect(kabinetSignedInFrom(storeWith("kabinet.session_token"))).toBe(true);
  });

  it("is false with no kabinet cookie at all", () => {
    expect(kabinetSignedInFrom(storeWith())).toBe(false);
  });

  it("is false for an unrelated cookie, even one with a similar name", () => {
    expect(kabinetSignedInFrom(storeWith("session", "kabinet.dont_remember"))).toBe(false);
  });
});

describe("kabinetSessionCookiePresent", () => {
  it("fails to 'not signed in' outside a real request scope, never throws - this vitest process is exactly such a scope", async () => {
    await expect(kabinetSessionCookiePresent()).resolves.toBe(false);
  });
});
