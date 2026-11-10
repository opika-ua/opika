import { describe, expect, it } from "vitest";
import {
  ContactChannelInputSchema,
  ContactChannelSchema,
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
