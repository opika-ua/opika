import { describe, expect, expectTypeOf, it } from "vitest";
import type { kabinetSessionPersonOf } from "./principal";
import { personLineOf, personOf, type SignedInPerson } from "./signed-in-person";

describe("personOf", () => {
  it("keeps name and email and drops every other session field", () => {
    const session = {
      name: "Олена",
      email: "olena@example.test",
      id: "user-1",
      token: "tok",
      role: "super_admin",
      ip: "203.0.113.9",
      userAgent: "UA",
      expiresAt: new Date(),
    };
    const person = personOf(session);
    expect(person).toEqual({ name: "Олена", email: "olena@example.test" });
    expect(Object.keys(person).sort()).toEqual(["email", "name"]);
    expect(JSON.stringify(person)).not.toMatch(/tok|user-1|super_admin|203\.0|UA/);
  });

  it("a blank name is none; a missing address is none", () => {
    expect(personOf({ name: "  ", email: "a@b.test" })).toEqual({ name: null, email: "a@b.test" });
    expect(personOf({ name: "О" })).toEqual({ name: "О", email: null });
  });

  it("the helper's type is exactly { name, email } or null", () => {
    expectTypeOf<
      Awaited<ReturnType<typeof kabinetSessionPersonOf>>
    >().toEqualTypeOf<SignedInPerson | null>();
    expectTypeOf<SignedInPerson>().toEqualTypeOf<{ name: string | null; email: string | null }>();
  });
});

describe("personLineOf", () => {
  it("is the name, else the address, else nothing", () => {
    expect(personLineOf({ name: "О", email: "a@b.test" })).toBe("О");
    expect(personLineOf({ name: null, email: "a@b.test" })).toBe("a@b.test");
    expect(personLineOf({ name: null, email: null })).toBeNull();
    expect(personLineOf(null)).toBeNull();
  });
});
