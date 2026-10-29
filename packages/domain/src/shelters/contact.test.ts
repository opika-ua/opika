import { describe, expect, it } from "vitest";
import {
  ContactChannelInputSchema,
  ContactChannelSchema,
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
