import { isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../shelter-load", () => ({
  loadShelterPage: async () => ({
    kind: "ready",
    home: {
      kind: "shelter",
      viewer: "admin",
      view: { displayName: "Домівка" },
      editing: { kind: "read_only" },
    },
    password: null,
  }),
}));
// The helper's contract is {name,email}; the secrets stand for what a leak would add.
vi.mock("../signed-in-person", () => ({
  signedInPerson: async () => ({ name: "Олена", email: "olena@example.test" }),
}));

const { default: ShelterAccountPage } = await import("./page");

describe("/kabinet/akaunt hands the person to the client as plain strings", () => {
  it("the page's props carry name and email and nothing else", async () => {
    const element = await ShelterAccountPage();
    if (!isValidElement<{ person: unknown }>(element)) throw new Error("not an element");
    const { person } = element.props;
    expect(person).toEqual({ name: "Олена", email: "olena@example.test" });
    expect(Object.keys(person as object).sort()).toEqual(["email", "name"]);
    expect(JSON.stringify(element.props)).not.toMatch(/token|userId|role|userAgent|expiresAt|ip"/);
  });
});
