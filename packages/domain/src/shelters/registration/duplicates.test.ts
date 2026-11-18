import { describe, expect, it } from "vitest";
import { CityIdSchema, ShelterIdSchema } from "../../primitives/ids";
import { type DuplicateCandidate, duplicateSignals } from "./duplicates";

const KYIV = CityIdSchema.parse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
const LVIV = CityIdSchema.parse("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
const id = (n: number) => ShelterIdSchema.parse(`00000000-0000-4000-8000-00000000000${n}`);

const application: DuplicateCandidate = {
  shelterId: id(1),
  name: "ГО «Лапа допомоги»",
  cityId: KYIV,
  emails: ["Lapa@Example.org "],
  links: ["https://www.instagram.com/lapa_help/"],
};

const other = (patch: Partial<DuplicateCandidate>): DuplicateCandidate => ({
  shelterId: id(2),
  name: "Інший притулок",
  cityId: LVIV,
  emails: ["other@example.org"],
  links: ["https://other.example.org/"],
  ...patch,
});

describe("duplicateSignals", () => {
  const cases: ReadonlyArray<[string, Partial<DuplicateCandidate>, readonly string[]]> = [
    ["nothing in common", {}, []],
    ["the same name in the same city", { name: "Лапа допомоги", cityId: KYIV }, ["same_name_city"]],
    ["the same name in another city", { name: "Лапа допомоги" }, []],
    ["the same email, any case", { emails: ["lapa@example.org"] }, ["same_email"]],
    ["the same link, another form", { links: ["http://instagram.com/Lapa_Help"] }, ["same_link"]],
    [
      "all three",
      {
        name: "Притулок Лапа допомоги",
        cityId: KYIV,
        emails: ["lapa@example.org"],
        links: ["instagram.com/lapa_help"],
      },
      ["same_name_city", "same_email", "same_link"],
    ],
  ];
  for (const [label, patch, kinds] of cases) {
    it(`flags ${label}`, () => {
      const signals = duplicateSignals(application, [other(patch)]);
      expect(signals.map((s) => s.kind)).toEqual(kinds);
      for (const signal of signals) expect(signal.shelterId).toBe(id(2));
    });
  }

  it("never flags the application against itself", () => {
    expect(duplicateSignals(application, [application])).toEqual([]);
  });

  it("does not match two names that are only legal-form words", () => {
    const bare = { ...application, name: "ГО Притулок" };
    expect(duplicateSignals(bare, [other({ name: "БО притулок", cityId: KYIV })])).toEqual([]);
  });
});
