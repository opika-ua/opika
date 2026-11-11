import type { ShelterContact } from "@opika/domain";
import { describe, expect, it } from "vitest";
import {
  ALL_KINDS,
  type ContactsForm,
  contactOfForm,
  contactsFormOf,
  linkProblem,
  MAX_OTHER_ROWS,
  NEW_OTHER_KINDS,
  parseChannel,
  sentenceCheck,
  sentenceLength,
} from "./fields";

const form = (overrides: Partial<ContactsForm> = {}): ContactsForm => ({
  phone: "",
  telegram: "",
  form: "",
  others: [],
  ...overrides,
});

describe("contactsFormOf (answer 3: nothing stored is hidden)", () => {
  it("puts the first phone and the first Telegram in their fields, the rest in «other» rows", () => {
    const contact: ShelterContact = {
      primary: { kind: "email", address: "a@example.org" },
      additional: [
        { kind: "phone", e164: "+380671234567" },
        { kind: "email", address: "b@example.org" },
        { kind: "telegram", handle: "domivka_brovary" },
        { kind: "phone", e164: "+380501112233" },
      ],
    };
    const result = contactsFormOf(contact);
    expect(result.phone).toBe("+380671234567");
    expect(result.telegram).toBe("@domivka_brovary");
    expect(result.others.map((row) => [row.kind, row.value, row.stored])).toEqual([
      ["email", "a@example.org", true],
      ["email", "b@example.org", true],
      ["phone", "+380501112233", true],
    ]);
  });
});

describe("contactOfForm", () => {
  it("normalises silently (answer 4): spaced and dashed numbers, @handle, t.me links", () => {
    for (const telegram of ["@lapa_shelter", "t.me/lapa_shelter", "https://t.me/lapa_shelter"]) {
      const result = contactOfForm(form({ phone: "+380 67-123 45 67", telegram }));
      expect(result).toEqual({
        kind: "ok",
        contact: {
          primary: { kind: "phone", e164: "+380671234567" },
          additional: [{ kind: "telegram", handle: "lapa_shelter" }],
        },
      });
    }
  });

  it("primary: the phone, else Telegram, else the first other (answer 3)", () => {
    const other = { id: "n1", kind: "email" as const, value: "x@example.org", stored: false };
    const viber = { id: "n2", kind: "viber" as const, value: "+380 50 111 22 33", stored: false };
    expect(contactOfForm(form({ telegram: "@lapa_shelter", others: [other] }))).toMatchObject({
      contact: { primary: { kind: "telegram" }, additional: [{ kind: "email" }] },
    });
    expect(contactOfForm(form({ others: [viber, other] }))).toMatchObject({
      contact: {
        primary: { kind: "viber", e164: "+380501112233" },
        additional: [{ kind: "email" }],
      },
    });
  });

  it("all empty: at least one channel (contacts.atLeastOne)", () => {
    expect(contactOfForm(form({ phone: "  " }))).toEqual({
      kind: "invalid",
      phone: null,
      telegram: null,
      form: null,
      others: {},
      atLeastOne: true,
    });
  });

  it("names the message for each bad field, by row", () => {
    const result = contactOfForm(
      form({
        phone: "+380670000002213",
        telegram: "@abc",
        others: [
          { id: "n1", kind: "email", value: "not-an-email", stored: false },
          { id: "n2", kind: "website", value: "http://example.org", stored: false },
        ],
      }),
    );
    expect(result).toEqual({
      kind: "invalid",
      phone: "phoneFormat",
      telegram: "telegramFormat",
      form: null,
      others: { n1: "emailFormat", n2: "httpsOnly" },
      atLeastOne: false,
    });
  });

  it("saves the Ukrainian local and international forms as +380XXXXXXXXX", () => {
    for (const typed of [
      "067 123 45 67",
      "(067) 123-45-67",
      "0671234567",
      "380671234567",
      "+380 67 123 45 67",
    ]) {
      expect(contactOfForm(form({ phone: typed }))).toEqual({
        kind: "ok",
        contact: { primary: { kind: "phone", e164: "+380671234567" }, additional: [] },
      });
    }
  });

  it("refuses a Viber number with extra digits or another country code", () => {
    for (const typed of ["+380670000002213", "+48 600 100 200", "067123456"]) {
      const result = contactOfForm(
        form({ others: [{ id: "n1", kind: "viber", value: typed, stored: false }] }),
      );
      expect(result).toMatchObject({ kind: "invalid", others: { n1: "viberFormat" } });
    }
  });

  it("a stored row of any kind is checked as that kind (fix 3)", () => {
    const result = contactOfForm(
      form({ others: [{ id: "s0", kind: "phone", value: "+380 50 111 22 33", stored: true }] }),
    );
    expect(result).toEqual({
      kind: "ok",
      contact: { primary: { kind: "phone", e164: "+380501112233" }, additional: [] },
    });
  });
});

describe("Instagram and Facebook rows", () => {
  it("are offered for new «other» rows", () => {
    expect(NEW_OTHER_KINDS).toContain("instagram");
    expect(NEW_OTHER_KINDS).toContain("facebook");
  });

  it.each(["@Dobri_Lapy", "dobri_lapy", "https://www.instagram.com/dobri_lapy/?igsh=x"])(
    "Instagram %s is the handle",
    (typed) =>
      expect(parseChannel("instagram", typed)).toEqual({
        kind: "ok",
        channel: { kind: "instagram", handle: "dobri_lapy" },
      }),
  );

  it("Facebook keeps the canonical URL only", () => {
    expect(parseChannel("facebook", "https://fb.com/dobri.lapy?ref=x")).toEqual({
      kind: "ok",
      channel: { kind: "facebook", url: "https://www.facebook.com/dobri.lapy" },
    });
  });

  it.each([
    ["instagram", "https://instagram.com/p/abc", "instagramFormat"],
    ["instagram", "http://instagram.com/dobri_lapy", "httpsOnly"],
    ["instagram", "a..b", "instagramFormat"],
    ["facebook", "https://evil.example/dobri.lapy", "facebookFormat"],
    ["facebook", "https://www.facebook.com/l.php?u=https%3A%2F%2Fevil.example", "facebookFormat"],
    ["facebook", "http://www.facebook.com/dobri.lapy", "httpsOnly"],
    ["facebook", "facebook.com/dobri.lapy", "httpsOnly"],
    ["facebook", "просто текст", "notAUrl"],
  ] as const)("%s %s -> %s", (kind, typed, error) =>
    expect(parseChannel(kind, typed)).toEqual({ kind: "error", error }),
  );

  // Valid but over the input cap: the field's existing message, no new copy.
  it.each([
    ["website", `https://a.org/?q=${"a".repeat(2048)}`, "notAUrl"],
    ["email", `${"a".repeat(2043)}@b.org`, "emailFormat"],
  ] as const)("%s over the length cap -> %s", (kind, typed, error) =>
    expect(parseChannel(kind, typed)).toEqual({ kind: "error", error }),
  );
});

describe("linkProblem", () => {
  it.each([
    ["https://dobro.ua/fund/domivka", null],
    ["http://dobro.ua/fund", "httpsOnly"],
    ["dobro.ua/fund", "httpsOnly"],
    ["ftp://dobro.ua", "notAUrl"],
    ["просто текст", "notAUrl"],
  ])("%s → %s", (value, expected) => {
    expect(linkProblem(value)).toBe(expected);
  });
});

describe("sentenceCheck (his messages for the K-Q6 rule)", () => {
  it("blank is no sentence", () => {
    expect(sentenceCheck("   ")).toEqual({ kind: "ok", text: null });
  });

  it("trims what it accepts", () => {
    expect(sentenceCheck("  Оновлюємо щосуботи. ")).toEqual({
      kind: "ok",
      text: "Оновлюємо щосуботи.",
    });
  });

  it("refuses {імʼя} in any spelling with its own message (DR1-Q5)", () => {
    for (const text of ["{ім'я} досі шукає дім.", "Чи {імʼя} тут?", "{ІМ’Я}"]) {
      expect(sentenceCheck(text)).toEqual({ kind: "invalid", error: { key: "nameTokenGone" } });
    }
  });

  it("{дата} gets its own message (answer 5), in any case and spacing", () => {
    for (const text of ["Оновлено {дата}.", "Оновлено {Дата}.", "Оновлено { дата }."]) {
      expect(sentenceCheck(text)).toEqual({ kind: "invalid", error: { key: "dateTokenGone" } });
    }
  });

  it("any other braced text is an unknown token, named", () => {
    expect(sentenceCheck("Привіт, {name}.")).toEqual({
      kind: "invalid",
      error: { key: "unknownToken", token: "{name}" },
    });
  });

  it("a stray brace, and over 280 characters", () => {
    expect(sentenceCheck("Дужка { без пари")).toEqual({
      kind: "invalid",
      error: { key: "strayBrace" },
    });
    expect(sentenceCheck("а".repeat(281))).toEqual({
      kind: "invalid",
      error: { key: "sentenceTooLong" },
    });
    expect(sentenceCheck("а".repeat(280))).toEqual({ kind: "ok", text: "а".repeat(280) });
  });

  it("counts characters as a reader sees them", () => {
    expect(sentenceLength("  🐾 ок  ")).toBe(4);
  });
});

describe("WhatsApp rows and the form field", () => {
  it("normalises a WhatsApp row like Viber and refuses a foreign number with the phone message", () => {
    const row = (value: string) => ({ id: "n1", kind: "whatsapp" as const, value, stored: false });
    expect(contactOfForm(form({ phone: "0671234567", others: [row("050 111 22 33")] }))).toEqual({
      kind: "ok",
      contact: {
        primary: { kind: "phone", e164: "+380671234567" },
        additional: [{ kind: "whatsapp", e164: "+380501112233" }],
      },
    });
    expect(contactOfForm(form({ others: [row("+48600100200")] }))).toMatchObject({
      kind: "invalid",
      others: { n1: "phoneFormat" },
    });
  });

  it("puts the form field in the additional list, never in primary", () => {
    const anketa = "https://forms.example/anketa";
    expect(contactOfForm(form({ form: anketa, telegram: "@domivka_brovary" }))).toEqual({
      kind: "ok",
      contact: {
        primary: { kind: "telegram", handle: "domivka_brovary" },
        additional: [{ kind: "form", url: anketa }],
      },
    });
  });

  it("a form alone is no way to call or write: contacts.atLeastOne", () => {
    expect(contactOfForm(form({ form: "https://forms.example/anketa" }))).toEqual({
      kind: "invalid",
      phone: null,
      telegram: null,
      form: null,
      others: {},
      atLeastOne: true,
    });
  });

  it.each([
    ["http://forms.example/anketa", "httpsOnly"],
    ["forms.example/anketa", "httpsOnly"],
    ["просто текст", "notAUrl"],
  ] as const)("the form field refuses %s with %s", (typed, error) => {
    expect(contactOfForm(form({ phone: "0671234567", form: typed }))).toMatchObject({
      kind: "invalid",
      form: error,
    });
  });

  it("loads a stored form into its field, not into an «other» row, and back unchanged", () => {
    const stored = {
      primary: { kind: "phone", e164: "+380671234567" },
      additional: [
        { kind: "form", url: "https://forms.example/anketa" },
        { kind: "whatsapp", e164: "+380501112233" },
      ],
    } as const;
    const loaded = contactsFormOf(stored);
    expect(loaded.form).toBe("https://forms.example/anketa");
    expect(loaded.others.map((row) => row.kind)).toEqual(["whatsapp"]);
    expect(contactOfForm(loaded)).toEqual({ kind: "ok", contact: stored });
  });

  it("offers WhatsApp and never a form as an «other» kind; the add cap is the domain's four", () => {
    expect(NEW_OTHER_KINDS).toContain("whatsapp");
    expect(NEW_OTHER_KINDS as readonly string[]).not.toContain("form");
    expect(ALL_KINDS as readonly string[]).not.toContain("form");
    expect(MAX_OTHER_ROWS).toBe(4);
  });
});
