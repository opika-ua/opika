import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONTACT_INPUT_MAX_LENGTH,
  ContactChannelInputSchema,
  MAX_ADDITIONAL_CHANNELS,
  ContactChannelSchema,
  isCanonicalFacebookUrl,
  normalizeFacebook,
  normalizeInstagram,
  normalizeUaPhone,
  ShelterContactInputSchema,
  ShelterContactSchema,
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

  const FB = "https://www.facebook.com/";
  const refused = { kind: "error", error: "facebookFormat" };

  it("counts the Facebook path decoded: 100 characters pass, 101 are refused", () => {
    expect(normalizeFacebook(`${FB}${"a".repeat(100)}/`)).toEqual({
      kind: "ok",
      url: `${FB}${"a".repeat(100)}`,
    });
    expect(normalizeFacebook(`${FB}${"a".repeat(101)}`)).toEqual(refused);
    expect(normalizeFacebook(`${FB}groups/${"1".repeat(94)}`)).toEqual(refused);
    // 100 Cyrillic letters escape to exactly 600 characters, the encoded ceiling.
    const at100 = normalizeFacebook(`${FB}${"д".repeat(100)}`);
    expect(at100.kind === "ok" && at100.url.length - FB.length).toBe(600);
    expect(normalizeFacebook(`${FB}${"д".repeat(101)}`)).toEqual(refused);
  });

  it("caps the escaped path at 600 characters even when the decoded one is short", () => {
    // U+1D400, a letter outside the BMP: 12 characters escaped, one code point.
    const letters = "𝐀".repeat(50);
    const at600 = normalizeFacebook(`${FB}${letters}`);
    expect(at600.kind === "ok" && at600.url.length - FB.length).toBe(600);
    expect(normalizeFacebook(`${FB}${letters}a`)).toEqual(refused);
  });

  it("refuses a path whose escapes do not decode", () => {
    expect(normalizeFacebook(`${FB}%D0`)).toEqual(refused);
    expect(isCanonicalFacebookUrl(`${FB}%D0`)).toBe(false);
  });

  it("takes a Cyrillic people/ URL on input and on read", () => {
    const typed = `${FB}people/Притулок-Добрі-Лапки/100012345678901`;
    const result = normalizeFacebook(typed);
    if (result.kind !== "ok") throw new Error("refused");
    expect(result.url).toHaveLength(158);
    expect(isCanonicalFacebookUrl(result.url)).toBe(true);
    expect(ContactChannelSchema.safeParse({ kind: "facebook", url: result.url }).success).toBe(
      true,
    );
    expect(ContactChannelInputSchema.parse({ kind: "facebook", url: typed })).toEqual({
      kind: "facebook",
      url: result.url,
    });
  });

  // The parser drops a bare `@` and folds fullwidth letters to ASCII; only the raw authority shows them.
  it.each(["https://@www.facebook.com/x", "https://www.ｆａｃｅｂｏｏｋ.com/x"])(
    "refuses %s, which the URL parser alone would read as www.facebook.com",
    (url) => {
      expect(normalizeFacebook(url)).toEqual(refused);
    },
  );

  it.each(["https://@instagram.com/dobri_lapy", "https://ｉｎｓｔａｇｒａｍ.com/dobri_lapy"])(
    "refuses %s, which the URL parser alone would read as instagram.com",
    (url) => {
      expect(normalizeInstagram(url)).toBeNull();
    },
  );

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

describe("Facebook path escapes", () => {
  const FB = "https://www.facebook.com/";
  const refused = { kind: "error", error: "facebookFormat" };

  it("counts code points, not UTF-16 units: 49 non-BMP letters and abc pass", () => {
    const path = `${"𝐀".repeat(49)}abc`;
    const result = normalizeFacebook(`${FB}${path}`);
    if (result.kind !== "ok") throw new Error("refused");
    expect(result.url.length - FB.length).toBe(591);
    expect([...path]).toHaveLength(52);
    expect(path).toHaveLength(101);
    expect(isCanonicalFacebookUrl(result.url)).toBe(true);
  });

  const HIDDEN = [
    `${FB}%6C.php?u=https://evil.com`,
    `${FB}%4C.PHP?u=https://evil.com`,
    `${FB}dialog%2Ffeed`,
    `${FB}%2Fevil.com`,
    `${FB}x%25y`,
    `${FB}x%00y`,
    `${FB}x%0Ay`,
    `${FB}%E2%80%AEevil`,
    `${FB}x%E2%81%A6y`,
    `${FB}x%E2%80%8Fy`,
    `${FB}x%D8%9Cy`,
    `${FB}x\u202Ey`,
  ];

  it.each(HIDDEN)("refuses %s on input", (typed) => {
    expect(normalizeFacebook(typed)).toEqual(refused);
    expect(ContactChannelInputSchema.safeParse({ kind: "facebook", url: typed }).success).toBe(
      false,
    );
  });

  it.each(HIDDEN.map((url) => url.replace(/\?.*$/, "")))("refuses the stored row %s", (url) => {
    expect(isCanonicalFacebookUrl(url)).toBe(false);
    expect(ContactChannelSchema.safeParse({ kind: "facebook", url }).success).toBe(false);
  });

  it("reads an escaped profile.php as profile.php, so only the id form is stored", () => {
    expect(normalizeFacebook(`${FB}profile%2Ephp?id=42`)).toEqual({
      kind: "ok",
      url: `${FB}profile.php?id=42`,
    });
    expect(isCanonicalFacebookUrl(`${FB}profile%2Ephp?id=42`)).toBe(false);
    expect(normalizeFacebook(`${FB}profile%2Ephp`)).toEqual(refused);
  });

  it("still takes the Cyrillic people/ URL", () => {
    const result = normalizeFacebook(`${FB}people/Притулок-Добрі-Лапки/100012345678901`);
    expect(result.kind === "ok" && isCanonicalFacebookUrl(result.url)).toBe(true);
  });

  // Instagram has no such gap: a handle allows no `%`, so any escaped spelling is refused outright.
  it.each(["https://instagram.com/%65xplore", "https://instagram.com/dobri%5Flapy"])(
    "Instagram refuses the escaped spelling %s",
    (typed) => {
      expect(normalizeInstagram(typed)).toBeNull();
    },
  );
});

describe("Facebook decoded-path allowlist", () => {
  const FB = "https://www.facebook.com/";

  it.each([
    "https://www.facebook.com/dobri.lapy",
    "https://www.facebook.com/groups/my.group",
    "https://www.facebook.com/people/%d0%bb%d0%b0%d0%bf%d0%b8/100012345678901",
    "https://www.facebook.com/x%2Dy",
    "https://www.facebook.com/dobri_lapy",
    "https://www.facebook.com/groups/12345",
    // «Й» spelled as И plus a combining breve: a letter and a mark.
    "https://www.facebook.com/%D0%98%CC%86%D0%B6%D0%B0%D0%BA",
  ])("keeps %s", (url) => {
    expect(normalizeFacebook(url)).toEqual({ kind: "ok", url });
    expect(isCanonicalFacebookUrl(url)).toBe(true);
    expect(ContactChannelSchema.safeParse({ kind: "facebook", url }).success).toBe(true);
  });

  it.each([
    ["https://www.facebook.com/Profile.PHP?id=1", `${FB}profile.php?id=1`],
    ["https://www.facebook.com/profile%2ephp?id=1", `${FB}profile.php?id=1`],
  ])("takes %s on input as %s", (typed, expected) => {
    expect(normalizeFacebook(typed)).toEqual({ kind: "ok", url: expected });
    expect(isCanonicalFacebookUrl(expected)).toBe(true);
  });

  it("takes the Cyrillic people/ URL on input and on read", () => {
    const result = normalizeFacebook(`${FB}people/Притулок-Добрі-Лапки/100012345678901`);
    if (result.kind !== "ok") throw new Error("refused");
    expect(result.url).toHaveLength(158);
    expect(ContactChannelSchema.safeParse({ kind: "facebook", url: result.url }).success).toBe(
      true,
    );
  });

  const OUTSIDE = [
    ["?", "x%3Fy"],
    ["#", "x%23y"],
    [";", "x%3By"],
    ["backslash", "x%5Cy"],
    ["space", "x%20y"],
    ["tab", "x%09y"],
    ["NUL", "x%00y"],
    ["RLO", "x%E2%80%AEy"],
    ["%", "x%25y"],
    ["apostrophe", "x%27y"],
    ["emoji", "x%F0%9F%90%95y"],
  ] as const;

  it.each(OUTSIDE)("refuses a decoded %s on input and in a stored row", (_what, path) => {
    const url = `${FB}${path}`;
    expect(normalizeFacebook(url)).toEqual({ kind: "error", error: "facebookFormat" });
    expect(isCanonicalFacebookUrl(url)).toBe(false);
    expect(ContactChannelSchema.safeParse({ kind: "facebook", url }).success).toBe(false);
  });
});

describe("contact input length cap", () => {
  afterEach(() => vi.restoreAllMocks());
  const MAX = CONTACT_INPUT_MAX_LENGTH;
  const pad = (value: string, length: number): string => value + " ".repeat(length - value.length);

  /** [kind, field, a value of exactly `length` characters, whether that value is valid] */
  const KINDS = [
    ["phone", "e164", (length: number) => pad("+380671234567", length), true],
    ["viber", "e164", (length: number) => pad("+380671234567", length), true],
    ["email", "address", (length: number) => `${"a".repeat(length - 6)}@b.org`, true],
    ["telegram", "handle", (length: number) => "a".repeat(length), false],
    ["website", "url", (length: number) => `https://a.org/?q=${"a".repeat(length - 17)}`, true],
    ["instagram", "handle", (length: number) => pad("dobri_lapy", length), true],
    [
      "facebook",
      "url",
      (length: number) => pad("https://www.facebook.com/dobri.lapy", length),
      true,
    ],
  ] as const;

  it.each(KINDS)(
    "%s: the cap lets the limit through and refuses one more",
    (kind, field, at, valid) => {
      expect(at(MAX)).toHaveLength(MAX);
      const atCap = ContactChannelInputSchema.safeParse({ kind, [field]: at(MAX) });
      expect(atCap.success).toBe(valid);
      expect(atCap.error?.issues.some((issue) => issue.code === "too_big") ?? false).toBe(false);
      const over = ContactChannelInputSchema.safeParse({ kind, [field]: at(MAX + 1) });
      expect(over.error?.issues.map((issue) => issue.code)).toEqual(["too_big"]);
      // Malformed and over the cap: a format check that ran first would report instead.
      const junk = ContactChannelInputSchema.safeParse({ kind, [field]: "x".repeat(MAX + 1) });
      expect(junk.error?.issues.map((issue) => issue.code)).toEqual(["too_big"]);
    },
  );

  it("refuses 100k slashes before any URL is parsed", () => {
    const urlSpy = vi.spyOn(globalThis, "URL");
    const huge = `https://www.facebook.com/${"/".repeat(100_000)}x`;
    const result = ContactChannelInputSchema.safeParse({ kind: "facebook", url: huge });
    expect(result.error?.issues.map((issue) => issue.code)).toEqual(["too_big"]);
    expect(urlSpy).not.toHaveBeenCalled();
  });

  it("the normaliser itself refuses 100k slashes without the quadratic trim", () => {
    const huge = `https://www.facebook.com/${"/".repeat(100_000)}x`;
    const started = performance.now();
    expect(normalizeFacebook(huge)).toEqual({ kind: "error", error: "facebookFormat" });
    expect(isCanonicalFacebookUrl(huge)).toBe(false);
    // Generous: the trim alone takes seconds on this input.
    expect(performance.now() - started).toBeLessThan(200);
  });
});

describe("WhatsApp and application form channels", () => {
  it.each([
    ["+380671234567", "+380671234567"],
    ["380671234567", "+380671234567"],
    ["0671234567", "+380671234567"],
    ["(067) 123-45-67", "+380671234567"],
  ])("WhatsApp %s is stored as %s, like Viber", (typed, e164) => {
    expect(ContactChannelInputSchema.parse({ kind: "whatsapp", e164: typed })).toEqual({
      kind: "whatsapp",
      e164,
    });
  });

  it.each(["+48600100200", "+380670000002213", "abc", ""])(
    "WhatsApp refuses %s on input",
    (typed) => {
      expect(ContactChannelInputSchema.safeParse({ kind: "whatsapp", e164: typed }).success).toBe(
        false,
      );
    },
  );

  it("reads a stored non-Ukrainian WhatsApp number (the wide read schema)", () => {
    expect(ContactChannelSchema.safeParse({ kind: "whatsapp", e164: "+48600100200" }).success).toBe(
      true,
    );
    expect(ContactChannelSchema.safeParse({ kind: "whatsapp", e164: "0671234567" }).success).toBe(
      false,
    );
  });

  it("a form takes any https host, as typed", () => {
    const url = "https://docs.google.com/forms/d/e/abc/viewform";
    expect(ContactChannelInputSchema.parse({ kind: "form", url })).toEqual({ kind: "form", url });
    expect(ContactChannelSchema.safeParse({ kind: "form", url }).success).toBe(true);
  });

  it.each(["http://forms.example/a", "javascript:alert(1)", "forms.example/a", ""])(
    "a form refuses %s",
    (url) => {
      expect(ContactChannelInputSchema.safeParse({ kind: "form", url }).success).toBe(false);
      expect(ContactChannelSchema.safeParse({ kind: "form", url }).success).toBe(false);
    },
  );

  it("caps both new inputs at the shared limit, before parsing", () => {
    const over = (value: string) => value + " ".repeat(CONTACT_INPUT_MAX_LENGTH + 1 - value.length);
    for (const channel of [
      { kind: "whatsapp", e164: over("+380671234567") },
      { kind: "form", url: `https://f.example/?q=${"a".repeat(CONTACT_INPUT_MAX_LENGTH)}` },
      { kind: "form", url: "x".repeat(CONTACT_INPUT_MAX_LENGTH + 1) },
    ]) {
      const result = ContactChannelInputSchema.safeParse(channel);
      expect(result.error?.issues.map((issue) => issue.code)).toEqual(["too_big"]);
    }
    expect(
      ContactChannelInputSchema.safeParse({
        kind: "whatsapp",
        e164: "+380671234567".padEnd(CONTACT_INPUT_MAX_LENGTH, " "),
      }).success,
    ).toBe(true);
  });

  const phone = { kind: "phone", e164: "+380671234567" } as const;
  const form = { kind: "form", url: "https://forms.example/anketa" } as const;

  it("refuses a form as the primary on input, and reads one stored that way", () => {
    expect(
      ShelterContactInputSchema.safeParse({ primary: form, additional: [phone] }).success,
    ).toBe(false);
    expect(
      ShelterContactInputSchema.safeParse({ primary: phone, additional: [form] }).success,
    ).toBe(true);
    expect(ShelterContactSchema.safeParse({ primary: form, additional: [phone] }).success).toBe(
      true,
    );
  });

  it("refuses a second form on input, and reads two stored that way", () => {
    const second = { kind: "form", url: "https://forms.example/other" } as const;
    expect(
      ShelterContactInputSchema.safeParse({ primary: phone, additional: [form, second] }).success,
    ).toBe(false);
    expect(
      ShelterContactSchema.safeParse({ primary: phone, additional: [form, second] }).success,
    ).toBe(true);
  });
});

describe("rows stored before WhatsApp and form still read (contact is jsonb, no migration)", () => {
  it("parses every earlier kind, a non-Ukrainian phone included", () => {
    const stored = {
      primary: { kind: "phone", e164: "+48600100200" },
      additional: [
        { kind: "email", address: "a@domivka.example" },
        { kind: "telegram", handle: "domivka_brovary" },
        { kind: "viber", e164: "+380671234567" },
        { kind: "website", url: "https://domivka.example" },
        { kind: "instagram", handle: "dobri_lapy" },
        { kind: "facebook", url: "https://www.facebook.com/dobri.lapy" },
      ],
    };
    expect(ShelterContactSchema.parse(stored)).toEqual(stored);
  });
});

describe("how many channels a write may carry", () => {
  it("takes Telegram, a form and four others beside the primary, and refuses one more", () => {
    const email = (n: number) => ({ kind: "email", address: `a${n}@domivka.example` }) as const;
    const additional = [
      { kind: "telegram", handle: "domivka_brovary" },
      { kind: "form", url: "https://forms.example/anketa" },
      email(1),
      email(2),
      email(3),
      email(4),
    ];
    const primary = { kind: "phone", e164: "+380671234567" } as const;
    expect(MAX_ADDITIONAL_CHANNELS).toBe(6);
    expect(ShelterContactInputSchema.safeParse({ primary, additional }).success).toBe(true);
    const seven = { primary, additional: [...additional, email(5)] };
    expect(ShelterContactInputSchema.safeParse(seven).success).toBe(false);
    // Reads stay permissive: a longer stored list still parses.
    expect(ShelterContactSchema.safeParse(seven).success).toBe(true);
  });
});
