import { describe, expect, it } from "vitest";
import { parseSetCookie } from "./set-cookie";

describe("parseSetCookie", () => {
  it("reads Better Auth's session cookie into cookies().set's shape, the value decoded once", () => {
    expect(
      parseSetCookie(
        "kabinet.session_token=abc.def%2Fg%3D; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax",
      ),
    ).toEqual({
      name: "kabinet.session_token",
      value: "abc.def/g=",
      options: { maxAge: 2592000, path: "/", httpOnly: true, secure: true, sameSite: "lax" },
    });
  });

  it("keeps an expiry date and a domain, and leaves out what it doesn't know", () => {
    const parsed = parseSetCookie(
      "a=b; Expires=Wed, 18 Nov 2026 10:00:00 GMT; Domain=example.org; Priority=High",
    );
    expect(parsed?.options).toEqual({
      expires: new Date("2026-11-18T10:00:00.000Z"),
      domain: "example.org",
    });
  });

  it("is null for a header with no name", () => {
    expect(parseSetCookie("=x; Path=/")).toBeNull();
    expect(parseSetCookie("novalue")).toBeNull();
  });
});
