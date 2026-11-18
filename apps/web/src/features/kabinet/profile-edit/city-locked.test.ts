import { describe, expect, it } from "vitest";
import { writeFailureOf } from "../shared/write-result";
import { cityLockedMessage } from "./city-locked";

describe("a city locked by a verified address (owner, 2026-11-18)", () => {
  it("reads the owner's sentence with the operator's address", () => {
    expect(cityLockedMessage()).toBe(
      "Ваша адреса вже перевірена, тому місто змінюю я. Напишіть мені на hello@opika.org.ua.",
    );
  });

  it("CITY_LOCKED maps to its own failure, not a generic one", () => {
    expect(writeFailureOf(Object.assign(new Error("x"), { code: "CITY_LOCKED" }))).toEqual({
      kind: "city_locked",
    });
  });
});
