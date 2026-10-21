import type { ShelterContact } from "@opika/domain";
import { describe, expect, it } from "vitest";
import {
  type ContactsForm,
  contactOfForm,
  contactsFormOf,
  linkProblem,
  sentenceCheck,
  sentenceLength,
} from "./fields";

const form = (overrides: Partial<ContactsForm> = {}): ContactsForm => ({
  phone: "",
  telegram: "",
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
      others: {},
      atLeastOne: true,
    });
  });

  it("names the message for each bad field, by row", () => {
    const result = contactOfForm(
      form({
        phone: "067 123 45 67",
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
      others: { n1: "emailFormat", n2: "httpsOnly" },
      atLeastOne: false,
    });
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
