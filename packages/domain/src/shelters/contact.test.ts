import { describe, expect, it } from "vitest";
import {
  ContactChannelInputSchema,
  ContactChannelSchema,
  isCanonicalFacebookUrl,
  normalizeFacebook,
  normalizeInstagram,
  normalizeUaPhone,
  ShelterContactInputSchema,
} from "./contact";

describe("normalizeUaPhone", () => {
  it.each([
    ["+380671234567", "+380671234567"],
    ["+380 67 123 45 67", "+380671234567"],
    ["380671234567", "+380671234567"],
    ["0671234567", "+380671234567"],
    ["(067) 123-45-67", "+380671234567"],
    ["067.123.45.67", "+380671234567"],
  ])("%s -> %s", (typed, expected) => expect(normalizeUaPhone(typed)).toBe(expected));

  it.each([
    "+380670000002213",
    "+38067123456",
    "+48600100200",
    "671234567",
    "+380 67 abc 45 67",
    "0012345678",
    "+380012345678",
    "380012345678",
    "",
  ])("%s is not a Ukrainian number", (typed) => expect(normalizeUaPhone(typed)).toBeNull());
});

describe("ContactChannelInputSchema (writes)", () => {
  it("normalises a typed phone and Viber on the server side too", () => {
    expect(ContactChannelInputSchema.parse({ kind: "phone", e164: "067 123 45 67" })).toEqual({
      kind: "phone",
      e164: "+380671234567",
    });
    expect(ContactChannelInputSchema.parse({ kind: "viber", e164: "+380 50 111 22 33" })).toEqual({
      kind: "viber",
      e164: "+380501112233",
    });
  });

  it("refuses the number that was accepted before: +380 and 12 digits", () => {
    for (const kind of ["phone", "viber"] as const) {
      expect(ContactChannelInputSchema.safeParse({ kind, e164: "+380670000002213" }).success).toBe(
        false,
      );
    }
  });

  it("refuses a non-Ukrainian number in a whole contact", () => {
    expect(
      ShelterContactInputSchema.safeParse({
        primary: { kind: "phone", e164: "+48600100200" },
        additional: [],
      }).success,
    ).toBe(false);
  });

  it("leaves email, Telegram and website as they were", () => {
    expect(ContactChannelInputSchema.safeParse({ kind: "email", address: "a@b.org" }).success).toBe(
      true,
    );
    expect(ContactChannelInputSchema.safeParse({ kind: "telegram", handle: "abc" }).success).toBe(
      false,
    );
  });
});

describe("ContactChannelSchema (stored rows, reveal outputs)", () => {
  it("still reads an older non-Ukrainian number, so output validation does not break", () => {
    expect(ContactChannelSchema.safeParse({ kind: "phone", e164: "+48600100200" }).success).toBe(
      true,
    );
  });
});

describe("normalizeInstagram", () => {
  it.each([
    ["@Dobri_Lapy", "dobri_lapy"],
    ["dobri.lapy", "dobri.lapy"],
    ["  @dobri.lapy  ", "dobri.lapy"],
    ["instagram.com/dobri_lapy", "dobri_lapy"],
    ["www.instagram.com/dobri_lapy/", "dobri_lapy"],
    ["https://www.instagram.com/dobri_lapy/?igsh=x", "dobri_lapy"],
    ["https://m.instagram.com/dobri_lapy#a", "dobri_lapy"],
    ["https://Instagram.com/Dobri_Lapy", "dobri_lapy"],
    ["a".repeat(30), "a".repeat(30)],
  ])("%s -> %s", (typed, expected) => expect(normalizeInstagram(typed)).toBe(expected));

  it.each([
    "http://instagram.com/x",
    "https://instagram.com/p/abc",
    "https://www.instagram.com/reel/abc/",
    "https://instagram.com/explore",
    "https://instagram.com/dobri_lapy/tagged",
    "https://instagram.com.evil.com/x",
    "https://evil.com/dobri_lapy",
    "https://evilinstagram.com/x",
    "https://user@instagram.com/x",
    "https://instagram.com:8443/x",
    "https://instagram.com/",
    "javascript:alert(1)",
    ".abc",
    "abc.",
    "a..b",
    "a".repeat(31),
    "добрі_лапи",
    "dobri lapy",
    "",
  ])("%s is refused", (typed) => expect(normalizeInstagram(typed)).toBeNull());
});

describe("normalizeFacebook", () => {
  it.each([
    ["https://facebook.com/dobri.lapy", "https://www.facebook.com/dobri.lapy"],
    ["https://www.facebook.com/dobri.lapy/", "https://www.facebook.com/dobri.lapy"],
    ["https://m.facebook.com/dobri.lapy?ref=x#top", "https://www.facebook.com/dobri.lapy"],
    ["https://fb.com/dobri.lapy", "https://www.facebook.com/dobri.lapy"],
    ["https://www.fb.com/groups/12345/", "https://www.facebook.com/groups/12345"],
    [
      "https://www.facebook.com/profile.php?id=100012345678&sk=about",
      "https://www.facebook.com/profile.php?id=100012345678",
    ],
    ["https://www.facebook.com/share/1AbC/", "https://www.facebook.com/share/1AbC"],
  ])("%s -> %s", (typed, expected) =>
    expect(normalizeFacebook(typed)).toEqual({ kind: "ok", url: expected }),
  );

  it.each([
    ["http://www.facebook.com/dobri.lapy", "httpsOnly"],
    ["facebook.com/dobri.lapy", "httpsOnly"],
    ["javascript:alert(1)", "notAUrl"],
    ["not a link", "notAUrl"],
    ["https://www.facebook.com", "facebookFormat"],
    ["https://www.facebook.com/", "facebookFormat"],
    ["https://l.facebook.com/l.php?u=https%3A%2F%2Fevil.com", "facebookFormat"],
    ["https://www.facebook.com/l.php?u=https%3A%2F%2Fevil.com", "facebookFormat"],
    ["https://www.facebook.com/flx/warn/?u=https%3A%2F%2Fevil.com", "facebookFormat"],
    ["https://www.facebook.com/login.php", "facebookFormat"],
    ["https://evilfacebook.com/dobri.lapy", "facebookFormat"],
    ["https://facebook.com.evil.com/dobri.lapy", "facebookFormat"],
    ["https://fb.me/dobri.lapy", "facebookFormat"],
    ["https://www.facebook.com:8443/dobri.lapy", "facebookFormat"],
    ["https://user@www.facebook.com/dobri.lapy", "facebookFormat"],
    ["https://www.faсebook.com/dobri.lapy", "facebookFormat"],
    ["https://www.xn--fcebook-8va.com/dobri.lapy", "facebookFormat"],
    ["https://www.facebook.com//evil.com", "facebookFormat"],
    ["https://www.facebook.com/profile.php", "facebookFormat"],
    ["https://www.facebook.com/profile.php?id=abc", "facebookFormat"],
    ["https://www.facebook.com/@evil.com", "facebookFormat"],
    ["https://www.facebook.com/dobri;lapy", "facebookFormat"],
  ])("%s is refused as %s", (typed, error) =>
    expect(normalizeFacebook(typed)).toEqual({ kind: "error", error }),
  );
});

describe("Instagram and Facebook channels", () => {
  it("the input schema stores the canonical forms", () => {
    expect(
      ContactChannelInputSchema.parse({
        kind: "instagram",
        handle: "https://www.instagram.com/Dobri_Lapy/?igsh=x",
      }),
    ).toEqual({ kind: "instagram", handle: "dobri_lapy" });
    expect(
      ContactChannelInputSchema.parse({
        kind: "facebook",
        url: "https://m.facebook.com/profile.php?id=42&sk=about",
      }),
    ).toEqual({ kind: "facebook", url: "https://www.facebook.com/profile.php?id=42" });
  });

  it("the input schema refuses what the normalisers refuse, including a www redirector", () => {
    for (const url of [
      "https://www.facebook.com/l.php?u=https%3A%2F%2Fevil.com",
      "https://evil.com/x",
      "http://www.facebook.com/x",
    ]) {
      expect(ContactChannelInputSchema.safeParse({ kind: "facebook", url }).success).toBe(false);
    }
    expect(
      ContactChannelInputSchema.safeParse({ kind: "instagram", handle: "https://evil.com/x" })
        .success,
    ).toBe(false);
  });

  it("the read schema refuses a Facebook URL on another host and an uppercase handle", () => {
    expect(
      ContactChannelSchema.safeParse({ kind: "facebook", url: "https://evil.com/x" }).success,
    ).toBe(false);
    expect(
      ContactChannelSchema.safeParse({ kind: "facebook", url: "https://facebook.com/x" }).success,
    ).toBe(false);
    expect(ContactChannelSchema.safeParse({ kind: "instagram", handle: "Dobri" }).success).toBe(
      false,
    );
    expect(
      ContactChannelSchema.safeParse({ kind: "facebook", url: "https://www.facebook.com/x" })
        .success,
    ).toBe(true);
  });
});

describe("hardening: reserved Instagram names, Facebook path length, stored rows", () => {
  const RESERVED = ["p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct"];

  it.each(RESERVED)("refuses the route name %s as a bare handle, with or without @", (name) => {
    expect(normalizeInstagram(name)).toBeNull();
    expect(normalizeInstagram(`@${name.toUpperCase()}`)).toBeNull();
    expect(ContactChannelInputSchema.safeParse({ kind: "instagram", handle: name }).success).toBe(
      false,
    );
    expect(ContactChannelSchema.safeParse({ kind: "instagram", handle: name }).success).toBe(false);
  });

  it("still accepts a handle that only starts with a route name", () => {
    expect(normalizeInstagram("explore_dogs")).toBe("explore_dogs");
    expect(normalizeInstagram("p.s")).toBe("p.s");
  });

  it("accepts a 100-character Facebook path and refuses 101", () => {
    const at100 = `https://www.facebook.com/${"a".repeat(100)}`;
    expect(normalizeFacebook(at100)).toEqual({ kind: "ok", url: at100 });
    expect(normalizeFacebook(`${at100}/`)).toEqual({ kind: "ok", url: at100 });
    expect(normalizeFacebook(`https://www.facebook.com/${"a".repeat(101)}`)).toEqual({
      kind: "error",
      error: "facebookFormat",
    });
    expect(normalizeFacebook(`https://www.facebook.com/groups/${"1".repeat(94)}`)).toEqual({
      kind: "error",
      error: "facebookFormat",
    });
  });

  const STORED_HOSTILE = [
    "https://www.facebook.com/l.php?u=https://evil.com",
    "https://u@www.facebook.com/x",
    "https://www.facebook.com:8443/x",
  ];

  it.each(STORED_HOSTILE)("the normaliser refuses %s", (url) => {
    expect(normalizeFacebook(url)).toEqual({ kind: "error", error: "facebookFormat" });
    expect(isCanonicalFacebookUrl(url)).toBe(false);
  });

  it.each([
    ...STORED_HOSTILE,
    "https://www.facebook.com/x/",
    "https://www.facebook.com/x?ref=evil",
    "https://www.facebook.com/x#top",
    `https://www.facebook.com/${"a".repeat(101)}`,
  ])("the read schema refuses the stored row %s", (url) => {
    expect(ContactChannelSchema.safeParse({ kind: "facebook", url }).success).toBe(false);
  });

  it("the read schema still takes canonical rows", () => {
    for (const url of [
      "https://www.facebook.com/dobri.lapy",
      "https://www.facebook.com/profile.php?id=42",
      `https://www.facebook.com/${"a".repeat(100)}`,
    ]) {
      expect(isCanonicalFacebookUrl(url)).toBe(true);
      expect(ContactChannelSchema.safeParse({ kind: "facebook", url }).success).toBe(true);
    }
  });
});
