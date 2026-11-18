import { describe, expect, it } from "vitest";
import {
  linkMatchKey,
  normalizeAdopterContact,
  normalizePublicLink,
  shelterNameMatchKey,
} from "./normalize";

describe("normalizePublicLink", () => {
  const accepted: ReadonlyArray<[string, string]> = [
    ["instagram.com/Vash_Prytulok", "https://www.instagram.com/vash_prytulok/"],
    [
      "https://www.instagram.com/vash_prytulok/?igsh=abc",
      "https://www.instagram.com/vash_prytulok/",
    ],
    ["m.instagram.com/vash.prytulok", "https://www.instagram.com/vash.prytulok/"],
    ["t.me/prytulok_kyiv", "https://t.me/prytulok_kyiv"],
    ["https://telegram.me/prytulok_kyiv/", "https://t.me/prytulok_kyiv"],
    ["facebook.com/prytulok.lapa", "https://www.facebook.com/prytulok.lapa"],
    ["prytulok.org.ua", "https://prytulok.org.ua/"],
    ["http://prytulok.org.ua/pro-nas", "https://prytulok.org.ua/pro-nas"],
    ["  https://prytulok.org.ua/#top  ", "https://prytulok.org.ua/"],
  ];
  for (const [raw, url] of accepted) {
    it(`accepts ${JSON.stringify(raw)}`, () => {
      expect(normalizePublicLink(raw)).toEqual({ kind: "ok", url });
    });
  }

  const refused = [
    "",
    "@vash_prytulok", // Instagram or Telegram: the operator must open the right one
    "prytulok",
    "javascript:alert(1)",
    "ftp://prytulok.org.ua",
    "https://user@evil.example/",
    "https://prytulok.org.ua:8443/",
    "http://127.0.0.1/admin",
    "http://[::1]/",
    "https://localhost/",
    "instagram.com/p/abc123",
    "t.me/",
    "prytulok .org.ua",
    `https://prytulok.org.ua/${"a".repeat(2100)}`,
  ];
  for (const raw of refused) {
    it(`refuses ${JSON.stringify(raw.slice(0, 40))}`, () => {
      expect(normalizePublicLink(raw)).toEqual({ kind: "invalid" });
    });
  }
});

describe("linkMatchKey", () => {
  it("ignores the scheme, www., m., a trailing slash, case and the query", () => {
    expect(linkMatchKey("https://www.Instagram.com/Lapa/")).toBe("instagram.com/lapa");
    expect(linkMatchKey("http://m.instagram.com/lapa?x=1")).toBe("instagram.com/lapa");
  });

  it("keeps Facebook's numeric profile id, which is the whole identity", () => {
    expect(linkMatchKey("https://www.facebook.com/profile.php?id=100")).not.toBe(
      linkMatchKey("https://www.facebook.com/profile.php?id=200"),
    );
  });

  it("is null for what isn't a public link", () => {
    expect(linkMatchKey("not a link")).toBeNull();
  });
});

describe("normalizeAdopterContact", () => {
  const accepted: ReadonlyArray<[string, unknown]> = [
    ["+380 67 123 45 67", { kind: "phone", e164: "+380671234567" }],
    ["067-123-45-67", { kind: "phone", e164: "+380671234567" }],
    ["380671234567", { kind: "phone", e164: "+380671234567" }],
    ["(067) 123 45 67", { kind: "phone", e164: "+380671234567" }],
    ["@Lapa_help", { kind: "telegram", handle: "Lapa_help" }],
    ["t.me/lapa_help", { kind: "telegram", handle: "lapa_help" }],
    ["https://t.me/lapa_help/", { kind: "telegram", handle: "lapa_help" }],
    ["lapa_help", { kind: "telegram", handle: "lapa_help" }],
  ];
  for (const [raw, channel] of accepted) {
    it(`accepts ${JSON.stringify(raw)}`, () => {
      expect(normalizeAdopterContact(raw)).toEqual({ kind: "ok", channel });
    });
  }

  const refused = ["", "@abc", "0671234", "+48 601 234 567", "12345678", "лапа_допомоги", "@a b"];
  for (const raw of refused) {
    it(`refuses ${JSON.stringify(raw)}`, () => {
      expect(normalizeAdopterContact(raw)).toEqual({ kind: "invalid" });
    });
  }
});

describe("shelterNameMatchKey", () => {
  const same: ReadonlyArray<[string, string]> = [
    ["ГО «Лапа допомоги»", "Лапа допомоги"],
    ['БО "Лапа допомоги"', "лапа  допомоги"],
    ["Притулок «Лапа допомоги»", "Лапа-допомоги"],
    ["Громадська організація Лапа допомоги", "лапа допомоги"],
    ["Сірко’s дім", "Сіркоʼs дім"],
  ];
  for (const [a, b] of same) {
    it(`matches ${JSON.stringify(a)} with ${JSON.stringify(b)}`, () => {
      expect(shelterNameMatchKey(a)).toBe(shelterNameMatchKey(b));
    });
  }

  it("keeps different shelters apart", () => {
    expect(shelterNameMatchKey("Лапа допомоги")).not.toBe(shelterNameMatchKey("Лапа надії"));
  });

  it("reduces a name that is only legal-form words to empty", () => {
    expect(shelterNameMatchKey("ГО Притулок")).toBe("");
  });
});
