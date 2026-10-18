import { registrySheltersContract } from "@opika/contracts";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { ChannelKind } from "../../profile-edit/fields";
import type { EvidenceRow } from "../evidence-editor/evidence-rows";
import {
  type CreateShelterForm,
  coordinatesOf,
  createInputOf,
  emptyCreateForm,
  type LegalForm,
} from "./create-input";

/**
 * S2's mapping, checked against the contract's own create input schema
 * (`registry.shelters.create`), never a re-implementation of it: what the
 * form sends must parse, and what the form refuses is refused by the schema
 * too. The server parses with that same schema.
 */

const createInputSchema = registrySheltersContract.create["~orpc"].inputSchema as z.ZodType;
const parse = (input: unknown) => createInputSchema.safeParse(input);

const CITY = "c1000000-0000-4000-8000-000000000001";
/** 10:00 in Kyiv, the 13th. */
const NOW = new Date("2026-10-13T07:00:00.000Z");

const siteVisit = (visitedOn: string, id = "visit"): EvidenceRow => ({
  id,
  kind: "site_visit",
  visitedOn,
  notes: "Оглянув вольєри, журнал прийому ведеться.",
});
const reference = (id: string, channelValue: string): EvidenceRow => ({
  id,
  kind: "reference_contact",
  name: "Ветклініка «Айболить»",
  channelKind: "phone",
  channelValue,
  relationship: "veterinary_clinic",
});

const legal = (patch: Partial<LegalForm>): LegalForm => ({
  ...emptyCreateForm().legal,
  ...patch,
});

/** An unregistered initiative with a site visit and two references: RU-B5's rehearsal shelter. */
const initiative = (patch: Partial<CreateShelterForm> = {}): CreateShelterForm => ({
  ...emptyCreateForm(),
  displayName: "  Лапа Вишгорода ",
  description: "Волонтери з Вишгорода, 18 собак і 6 котів.",
  cityId: CITY,
  line1: "вул. Мечникова, 4",
  coordinates: "50.5843, 30.4890",
  legal: legal({ kind: "unregistered_initiative", contactPersonName: "Ірина Коваль" }),
  contacts: { phone: "+380 50 111-22-33", telegram: "", others: [] },
  evidence: [
    siteVisit("2026-10-12"),
    reference("ref-1", "+380 50 555 21 08"),
    reference("ref-2", "+380 67 000 11 22"),
  ],
  adminName: "Ірина",
  adminEmail: " iryna@example.org ",
  ...patch,
});

const okInput = (form: CreateShelterForm) => {
  const result = createInputOf(form, NOW);
  if (result.kind !== "ok") throw new Error(`expected ok, got ${JSON.stringify(result.errors)}`);
  return result.input;
};

describe("the form as registry.shelters.create's input", () => {
  it("maps an unregistered initiative with a site visit and two references, and the contract accepts it", () => {
    const input = okInput(initiative());
    expect(parse(input).success).toBe(true);
    expect(input).toEqual({
      displayName: "Лапа Вишгорода",
      description: { uk: "Волонтери з Вишгорода, 18 собак і 6 котів.", en: null },
      legalEntity: { kind: "unregistered_initiative", contactPersonName: "Ірина Коваль" },
      exactAddress: {
        line1: "вул. Мечникова, 4",
        line2: null,
        postalCode: null,
        cityId: CITY,
        district: null,
        coordinates: { lat: 50.5843, lng: 30.489 },
      },
      contact: { primary: { kind: "phone", e164: "+380501112233" }, additional: [] },
      freshnessSentence: null,
      evidence: [
        {
          kind: "site_visit",
          visitedOn: "2026-10-12",
          notes: "Оглянув вольєри, журнал прийому ведеться.",
        },
        {
          kind: "reference_contact",
          name: "Ветклініка «Айболить»",
          channel: { kind: "phone", e164: "+380505552108" },
          relationship: "veterinary_clinic",
        },
        {
          kind: "reference_contact",
          name: "Ветклініка «Айболить»",
          channel: { kind: "phone", e164: "+380670001122" },
          relationship: "veterinary_clinic",
        },
      ],
      firstAdmin: { name: "Ірина", email: "iryna@example.org" },
    });
  });

  it("maps a registered NGO with its registration date, and the contract accepts it", () => {
    const input = okInput(
      initiative({
        legal: legal({
          kind: "registered_ngo",
          legalName: "ГО «Лапа Вишгорода»",
          edrpou: "43 902 117",
          registeredAt: "2021-03-04",
          contactPersonName: "left from the other form, not sent",
        }),
        line2: "корпус 2",
        postalCode: "07300",
        evidence: [
          { id: "e", kind: "edrpou_registration", edrpou: "43902117", registeredName: "ГО «Лапа»" },
          { id: "b", kind: "bank_account_holder", holderName: "ГО «Лапа»" },
        ],
      }),
    );
    expect(parse(input).success).toBe(true);
    expect(input.legalEntity).toEqual({
      kind: "registered_ngo",
      legalName: "ГО «Лапа Вишгорода»",
      edrpou: "43902117",
      registeredAt: new Date("2021-03-04T00:00:00.000Z"),
    });
    expect(input.exactAddress.line2).toBe("корпус 2");
    expect(input.exactAddress.postalCode).toBe("07300");
  });

  it("maps a sole proprietor with no registration date, and the contract accepts it", () => {
    const input = okInput(
      initiative({
        legal: legal({
          kind: "sole_proprietor",
          legalName: "ФОП Коваль І. В.",
          edrpou: "12345678",
        }),
      }),
    );
    expect(parse(input).success).toBe(true);
    expect(input.legalEntity).toEqual({
      kind: "sole_proprietor",
      legalName: "ФОП Коваль І. В.",
      edrpou: "12345678",
    });
  });

  it("sends no evidence when no card was added, which the contract allows", () => {
    const input = okInput(initiative({ evidence: [] }));
    expect(input.evidence).toEqual([]);
    expect(parse(input).success).toBe(true);
  });

  it("maps every channel kind of a reference, normalised the way K4 normalises contacts", () => {
    const ref = (channelKind: ChannelKind, channelValue: string): EvidenceRow => ({
      id: channelKind,
      kind: "reference_contact",
      name: "Сусідній притулок",
      channelKind,
      channelValue,
      relationship: "partner_organisation",
    });
    const cases: [EvidenceRow, unknown][] = [
      [ref("phone", "+380 50 111-22-33"), { kind: "phone", e164: "+380501112233" }],
      [ref("telegram", "https://t.me/lapa_help"), { kind: "telegram", handle: "lapa_help" }],
      [ref("viber", "+380 67 000 11 22"), { kind: "viber", e164: "+380670001122" }],
      [ref("email", " vet@example.org "), { kind: "email", address: "vet@example.org" }],
      [
        ref("website", "https://vet.example.org"),
        { kind: "website", url: "https://vet.example.org" },
      ],
    ];
    for (const [row, channel] of cases) {
      const input = okInput(initiative({ evidence: [row] }));
      expect(parse(input).success, row.id).toBe(true);
      expect(input.evidence[0]).toMatchObject({ channel });
    }
  });
});

/**
 * Answer 3 (verbatim: "Yes: the four document-free evidence types. Document
 * upload is a later R2 block."), and RG-Q5: the server refuses any
 * `documentKey`. The form has nowhere to type one and never adds one.
 */
describe("no documentKey, ever", () => {
  const everyKind: EvidenceRow[] = [
    { id: "e", kind: "edrpou_registration", edrpou: "43902117", registeredName: "ГО «Лапа»" },
    { id: "b", kind: "bank_account_holder", holderName: "ГО «Лапа»" },
    reference("r", "+380505552108"),
    siteVisit("2026-10-13", "s"),
  ];

  it("leaves documentKey out of every item, so the contract fills its null default", () => {
    const input = okInput(initiative({ evidence: everyKind }));
    for (const item of input.evidence) {
      expect(Object.keys(item), item.kind).not.toContain("documentKey");
    }
    const parsed = parse(input);
    expect(parsed.success).toBe(true);
    const evidence = (parsed.data as { evidence: { kind: string; documentKey?: unknown }[] })
      .evidence;
    for (const item of evidence.filter((i) => "documentKey" in i)) {
      expect(item.documentKey, item.kind).toBeNull();
    }
    expect(evidence.map((item) => item.kind)).not.toContain("supporting_document");
  });

  it("sends nothing the server would read as a document, for every kind", () => {
    const input = okInput(initiative({ evidence: everyKind }));
    expect(JSON.stringify(input)).not.toMatch(/documentKey|supporting_document/);
  });
});

describe("what the form refuses, and the contract refuses too", () => {
  const valid = okInput(initiative());

  it.each<[string, Partial<CreateShelterForm>, string, string, unknown]>([
    [
      "a blank name",
      { displayName: "   " },
      "displayName",
      "required",
      { ...valid, displayName: "   " },
    ],
    [
      "a blank description",
      { description: "" },
      "description",
      "required",
      { ...valid, description: { uk: "", en: null } },
    ],
    [
      "no city",
      { cityId: "" },
      "cityId",
      "required",
      { ...valid, exactAddress: { ...valid.exactAddress, cityId: "" } },
    ],
    [
      "no street",
      { line1: " " },
      "line1",
      "required",
      { ...valid, exactAddress: { ...valid.exactAddress, line1: "" } },
    ],
    [
      "coordinates out of range",
      { coordinates: "91, 30.5" },
      "coordinates",
      "coordinatesFormat",
      { ...valid, exactAddress: { ...valid.exactAddress, coordinates: { lat: 91, lng: 30.5 } } },
    ],
    [
      "no first admin name",
      { adminName: "" },
      "adminName",
      "required",
      { ...valid, firstAdmin: { ...valid.firstAdmin, name: " " } },
    ],
    [
      "a first admin address that isn't one",
      { adminEmail: "iryna@" },
      "adminEmail",
      "emailFormat",
      { ...valid, firstAdmin: { ...valid.firstAdmin, email: "iryna@" } },
    ],
  ])("%s", (_case, patch, field, error, rawInput) => {
    const result = createInputOf(initiative(patch), NOW);
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.errors.fields).toEqual({ [field]: error });
    }
    expect(parse(rawInput).success).toBe(false);
  });

  it("an EDRPOU that isn't 8 digits", () => {
    const form = initiative({
      legal: legal({ kind: "sole_proprietor", legalName: "ФОП", edrpou: "1234567" }),
    });
    const result = createInputOf(form, NOW);
    expect(result.kind === "invalid" && result.errors.fields).toEqual({ edrpou: "edrpouFormat" });
    expect(
      parse({
        ...valid,
        legalEntity: { kind: "sole_proprietor", legalName: "ФОП", edrpou: "1234567" },
      }).success,
    ).toBe(false);
  });

  it("no legal form picked, and each picked form's own required fields", () => {
    const none = createInputOf(initiative({ legal: legal({}) }), NOW);
    expect(none.kind === "invalid" && none.errors.fields).toEqual({ legalKind: "required" });
    const ngo = createInputOf(initiative({ legal: legal({ kind: "registered_ngo" }) }), NOW);
    expect(ngo.kind === "invalid" && ngo.errors.fields).toEqual({
      legalName: "required",
      edrpou: "required",
      registeredAt: "required",
    });
    const group = createInputOf(
      initiative({ legal: legal({ kind: "unregistered_initiative" }) }),
      NOW,
    );
    expect(group.kind === "invalid" && group.errors.fields).toEqual({
      contactPersonName: "required",
    });
    expect(
      parse({ ...valid, legalEntity: { kind: "unregistered_initiative", contactPersonName: "" } })
        .success,
    ).toBe(false);
  });

  it("no way of contact at all (K4's at-least-one rule), which the contract has no primary for", () => {
    const result = createInputOf(
      initiative({ contacts: { phone: "", telegram: "", others: [] } }),
      NOW,
    );
    expect(result.kind === "invalid" && result.errors.contacts?.atLeastOne).toBe(true);
    expect(parse({ ...valid, contact: { additional: [] } }).success).toBe(false);
  });

  it("each evidence card's own required fields and formats, by row id", () => {
    const result = createInputOf(
      initiative({
        evidence: [
          { id: "e", kind: "edrpou_registration", edrpou: "12 34", registeredName: " " },
          { id: "b", kind: "bank_account_holder", holderName: "" },
          {
            id: "r",
            kind: "reference_contact",
            name: "",
            channelKind: "phone",
            channelValue: "050",
            relationship: "",
          },
          { id: "s", kind: "site_visit", visitedOn: "", notes: "" },
        ],
      }),
      NOW,
    );
    expect(result.kind === "invalid" && result.errors.evidence).toEqual({
      e: { edrpou: "edrpouFormat", registeredName: "required" },
      b: { holderName: "required" },
      r: { name: "required", channelValue: "phoneFormat", relationship: "required" },
      s: { visitedOn: "required", notes: "required" },
    });
    expect(
      parse({ ...valid, evidence: [{ kind: "bank_account_holder", holderName: "" }] }).success,
    ).toBe(false);
    expect(parse({ ...valid, evidence: [{ kind: "site_visit", notes: "x" }] }).success).toBe(false);
  });
});

/**
 * The form warns on the server's own rule (`isSiteVisitInFuture`, Kyiv's
 * calendar): at 00:30 or 01:30 in Kyiv on the 8th, UTC still says the 7th.
 */
describe("a site visit's date, on Kyiv's calendar", () => {
  const justAfterKyivMidnight = new Date("2026-10-07T22:30:00.000Z");

  it("accepts Kyiv's today just after local midnight", () => {
    const result = createInputOf(
      initiative({ evidence: [siteVisit("2026-10-08")] }),
      justAfterKyivMidnight,
    );
    expect(result.kind).toBe("ok");
  });

  it("refuses Kyiv's tomorrow", () => {
    const result = createInputOf(
      initiative({ evidence: [siteVisit("2026-10-09")] }),
      justAfterKyivMidnight,
    );
    expect(result.kind === "invalid" && result.errors.evidence).toEqual({
      visit: { visitedOn: "siteVisitInFuture" },
    });
  });
});

describe("coordinatesOf", () => {
  it.each([
    ["50.4501, 30.5234", { lat: 50.4501, lng: 30.5234 }],
    ["50.4501,30.5234", { lat: 50.4501, lng: 30.5234 }],
    ["  50.4501   30.5234 ", { lat: 50.4501, lng: 30.5234 }],
    ["-33.9, 151.2", { lat: -33.9, lng: 151.2 }],
  ])("reads «%s»", (raw, expected) => {
    expect(coordinatesOf(raw)).toEqual(expected);
  });

  it.each(["50.4501", "50,4501, 30,5234", "91, 30", "50.45, 181", "широта, довгота", ""])(
    "refuses «%s»",
    (raw) => {
      expect(coordinatesOf(raw)).toBeNull();
    },
  );
});
