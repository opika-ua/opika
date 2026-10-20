import { describe, expect, it } from "vitest";
import {
  type CommonPasswordList,
  foldForComparison,
  type PasswordSubject,
  passwordVerdictOf,
  personalPartsOf,
} from "./password-policy";

/**
 * The policy as `docs/shelter-passwords.md` §3 and §9 answer 2 state it. The
 * numbers are written out here (10, 128, 3), not read from the constants
 * under test: a test that compared the verdict with the constant producing it
 * would pass whatever the constant said.
 */

/** A list holding exactly these entries, folded the way the real one is. */
const listOf = (...entries: string[]): CommonPasswordList => {
  const set = new Set(entries.map(foldForComparison));
  return { has: (folded) => set.has(folded) };
};
const NO_LIST = listOf();

/** Fictional subject; the site's name is a placeholder, as it comes from app config. */
const SUBJECT: PasswordSubject = {
  email: "olena.koval@example.org",
  shelterName: "Притулок «Сіріус»",
  siteName: "Сайтнейм",
};

const verdict = (password: string, list: CommonPasswordList = NO_LIST, subject = SUBJECT) =>
  passwordVerdictOf(password, subject, list);

describe("length: 10 to 128 characters, as a reader counts them", () => {
  it.each([
    [9, "too_short"],
    [10, "ok"],
    [128, "ok"],
    [129, "too_long"],
  ])("%i characters → %s", (length, kind) => {
    expect(verdict("ж".repeat(length)).kind).toBe(kind);
  });

  it("names the limit it refused on", () => {
    expect(verdict("x".repeat(9))).toEqual({ kind: "too_short", min: 10 });
    expect(verdict("x".repeat(129))).toEqual({ kind: "too_long", max: 128 });
  });

  it("counts a multi-part emoji as one character, not by UTF-16 units", () => {
    // 9 letters and a family: 10 characters, though `.length` is 17.
    const password = "ґґґґґґґґґ👨‍👩‍👧";
    expect(password.length).toBe(17);
    expect(verdict(password).kind).toBe("ok");
    // 8 letters and the family: 9 characters, though `.length` is 16, over the floor in units.
    expect(verdict("ґґґґґґґґ👨‍👩‍👧").kind).toBe("too_short");
  });

  it("has no composition rules: letters only, digits only and spaces all pass", () => {
    for (const password of ["всебуквиголовне", "8402917365", "три слова разом"]) {
      expect(verdict(password).kind, password).toBe("ok");
    }
  });

  it("is never trimmed: surrounding spaces are characters", () => {
    expect(verdict("  дев'ять ").kind).toBe("ok");
    expect(verdict(" вісім ".padEnd(9, " ")).kind).toBe("too_short");
  });
});

describe("the common list: the whole password, case-insensitively, on submit", () => {
  const list = listOf("qwertyuiop", "1234567890");

  it("refuses a listed password in any case", () => {
    expect(verdict("qwertyuiop", list)).toEqual({ kind: "common" });
    expect(verdict("QwErTyUiOp", list)).toEqual({ kind: "common" });
  });

  it("matches the whole password, not a part of it", () => {
    expect(verdict("qwertyuiop-ліс", list).kind).toBe("ok");
  });

  it("folds compatibility forms, so fullwidth Latin is the same password", () => {
    expect(verdict("ｑｗｅｒｔｙｕｉｏｐ", list).kind).toBe("common");
  });
});

describe("personal parts (§9 answer 2): the email's local part, the shelter's name, the site's name", () => {
  it("refuses a password containing the email's local part, in any case", () => {
    expect(verdict("xx-OLENA.KOVAL-xx")).toEqual({ kind: "contains_personal" });
  });

  it("refuses the shelter's name, and the quoted part of it, in any case", () => {
    expect(verdict("притулок «сіріус» 2026").kind).toBe("contains_personal");
    expect(verdict("СІРІУС-найкращий").kind).toBe("contains_personal");
  });

  it("refuses the site's name, from the subject (app config), in any case", () => {
    expect(verdict("мій САЙТНЕЙМ пароль").kind).toBe("contains_personal");
  });

  it("checks a part of three characters, never a shorter one", () => {
    const short = { ...SUBJECT, email: "ab@example.org", shelterName: "Ко" };
    expect(verdict("абкоabкодев", NO_LIST, short).kind).toBe("ok");
    const three = { ...SUBJECT, email: "abc@example.org" };
    expect(verdict("xxabcxxxxxxx", NO_LIST, three).kind).toBe("contains_personal");
  });

  it("checks lengths first and the list last", () => {
    const list = listOf("olena.koval123");
    expect(verdict("olena", list).kind).toBe("too_short");
    expect(verdict("olena.koval123", list).kind).toBe("contains_personal");
  });

  it("lists exactly the parts it compares, folded", () => {
    expect(personalPartsOf(SUBJECT)).toEqual([
      "olena.koval",
      "притулок «сіріус»",
      "сіріус",
      "сайтнейм",
    ]);
    expect(
      personalPartsOf({ ...SUBJECT, shelterName: "  Добрі   руки  ", email: "x@y.z" }),
    ).toEqual(["добрі руки", "сайтнейм"]);
  });
});
