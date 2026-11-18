import { describe, expect, it } from "vitest";
import { RegistrationInputSchema } from "./registration";

const VALID = {
  name: "  ГО «Лапа допомоги»  ",
  cityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  link: "instagram.com/Lapa_Help",
  contact: "067 123 45 67",
  email: "  Lapa@Example.ORG ",
  password: "довгий пароль 2026",
  passwordRepeat: "довгий пароль 2026",
  hp: "",
  formStamp: "1763459200000.abcdef",
};

const issuesOf = (input: Record<string, unknown>) => {
  const result = RegistrationInputSchema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map((issue) => [issue.path.join("."), issue.message]);
};

describe("RegistrationInputSchema", () => {
  it("normalizes rather than rejects (§11.4)", () => {
    const parsed = RegistrationInputSchema.parse(VALID);
    expect(parsed).toMatchObject({
      name: "ГО «Лапа допомоги»",
      link: "https://www.instagram.com/lapa_help/",
      contact: { kind: "phone", e164: "+380671234567" },
      email: "lapa@example.org",
    });
  });

  it("takes an empty or blank contact as none, and still refuses a wrong one (owner, 2026-11-19)", () => {
    expect(RegistrationInputSchema.parse({ ...VALID, contact: "" }).contact).toBeNull();
    expect(RegistrationInputSchema.parse({ ...VALID, contact: "   " }).contact).toBeNull();
    expect(issuesOf({ ...VALID, contact: "0671234" })).toEqual([["contact", "contact"]]);
  });

  it("never trims the password", () => {
    const spaced = {
      ...VALID,
      password: " пароль із пробілом ",
      passwordRepeat: " пароль із пробілом ",
    };
    expect(RegistrationInputSchema.parse(spaced).password).toBe(" пароль із пробілом ");
  });

  it("refuses a repeat that doesn't match, on the repeat field (server side of §13.2)", () => {
    expect(issuesOf({ ...VALID, passwordRepeat: "довгий пароль 2027" })).toEqual([
      ["passwordRepeat", "password_mismatch"],
    ]);
  });

  it("names each field's problem with its error code", () => {
    expect(issuesOf({ ...VALID, link: "@lapa_help" })).toEqual([["link", "link"]]);
    expect(issuesOf({ ...VALID, contact: "0671234" })).toEqual([["contact", "contact"]]);
    expect(issuesOf({ ...VALID, password: "коротко", passwordRepeat: "коротко" })).toEqual([
      ["password", "password_short"],
    ]);
  });

  it("counts the password as a reader would: 10 Cyrillic letters are enough", () => {
    const ten = "пароль1234";
    expect(
      RegistrationInputSchema.safeParse({ ...VALID, password: ten, passwordRepeat: ten }).success,
    ).toBe(true);
  });

  it("carries the honeypot through for the action to judge, refusing only an absurd length", () => {
    expect(RegistrationInputSchema.parse({ ...VALID, hp: "spam" }).hp).toBe("spam");
    expect(RegistrationInputSchema.safeParse({ ...VALID, hp: "x".repeat(257) }).success).toBe(
      false,
    );
  });
});
