import { readFileSync } from "node:fs";
import {
  CityIdSchema,
  EdrpouSchema,
  type ExactAddress,
  type LocationPrivacyPolicy,
  ModeratorIdSchema,
  publicLocationOf,
  type Shelter,
  ShelterIdSchema,
  testOnlyLocationPolicy,
} from "@opika/domain";
import { describe, expect, it } from "vitest";
import { ContactRevealViewSchema } from "./reveal";
import { PublicShelterViewSchema, ShelterSummaryViewSchema } from "./shelter";

const AT = new Date("2026-08-05T00:00:00.000Z");
const SHELTER_ID = ShelterIdSchema.parse("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
const CITY_ID = CityIdSchema.parse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
const MODERATOR = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");

const contact = {
  primary: { kind: "phone", e164: "+380501234567" },
  additional: [],
} as const;

const exactAddress: ExactAddress = {
  line1: "вул. Прикладна, 1",
  line2: null,
  postalCode: "61000",
  cityId: CITY_ID,
  district: null,
  coordinates: { lat: 49.9935, lng: 36.2304 },
};

const privacyPolicy: LocationPrivacyPolicy = testOnlyLocationPolicy("test-key");

// Not hand-assembled: the branded fuzzed type makes publicLocationOf the only
// way to build this, which is exactly the property under test.
const publicLocation = publicLocationOf(SHELTER_ID, exactAddress, privacyPolicy);

const shelter: Shelter = {
  id: SHELTER_ID,
  displayName: "Тестовий притулок",
  description: { uk: "Опис", en: null },
  legalEntity: {
    kind: "registered_ngo",
    legalName: "Тестовий притулок",
    edrpou: EdrpouSchema.parse("12345678"),
    registeredAt: AT,
  },
  publicLocation,
  exactAddress,
  contact,
  donation: null,
  logo: null,
  pendingDonation: null,
  version: 0,
  freshnessSentence: null,
  verification: {
    status: "verified",
    verifiedAt: AT,
    verifiedBy: MODERATOR,
    evidence: { items: [], submittedAt: AT },
  },
  createdAt: AT,
  lastUpdatedAt: AT,
};

describe("public shelter projections withhold the private fields", () => {
  const projected = PublicShelterViewSchema.parse({ ...shelter, verification: "verified" });

  it("does not carry the exact address", () => {
    expect(projected).not.toHaveProperty("exactAddress");
  });

  it("does not carry contact details", () => {
    expect(projected).not.toHaveProperty("contact");
  });

  it("does not carry the legal entity", () => {
    expect(projected).not.toHaveProperty("legalEntity");
  });

  it("reduces verification to a badge, dropping moderators and evidence", () => {
    expect(projected.verification).toBe("verified");
  });

  it("carries the city only: no district, no fuzzed point (EM-Q10)", () => {
    // The domain location still holds the fuzzed point (built server-side by
    // publicLocationOf above); the public view no longer serializes it.
    expect(publicLocation.precision).toBe("fuzzed_address");
    expect(projected.publicLocation).toEqual({ cityId: CITY_ID });
    expect(JSON.stringify(projected)).not.toContain(String(exactAddress.coordinates.lat));
  });

  it("withholds the same fields from the card summary", () => {
    const summary = ShelterSummaryViewSchema.parse({ ...shelter, verification: "verified" });
    expect(summary).not.toHaveProperty("exactAddress");
    expect(summary).not.toHaveProperty("contact");
  });

  /** Pet card PR 3a: `logo` carries the same `AnimalPhoto`-shaped storage key
   * and dimensions in both views - a public, non-sensitive field, unlike the
   * ones withheld above. */
  it("carries the logo, both on the shelter page's view and on the card summary", () => {
    const withLogo = {
      ...shelter,
      logo: { storageKey: "shelters/x/logo/y", width: 160, height: 160 },
    };
    expect(PublicShelterViewSchema.parse({ ...withLogo, verification: "verified" }).logo).toEqual(
      withLogo.logo,
    );
    expect(ShelterSummaryViewSchema.parse({ ...withLogo, verification: "verified" }).logo).toEqual(
      withLogo.logo,
    );
  });

  /**
   * Designer round 1, S6 (Oleksii's DR1-Q1, verbatim: "the shelter’s freshness
   * sentence leaves the deck and animal pages and shows only on the shelter
   * page."): the shelter page's view carries it, the card summary never does,
   * even when handed a shelter that has one.
   */
  it("carries the freshness sentence on the shelter page's view only, never on a card", () => {
    const withSentence = {
      ...shelter,
      freshnessSentence: { uk: "Оновлюємо щосуботи.", en: null },
      verification: "verified" as const,
    };
    expect(PublicShelterViewSchema.parse(withSentence).freshnessSentence).toEqual({
      uk: "Оновлюємо щосуботи.",
      en: null,
    });
    const summary = ShelterSummaryViewSchema.parse(withSentence);
    expect(summary).not.toHaveProperty("freshnessSentence");
    expect(JSON.stringify(summary)).not.toContain("щосуботи");
  });

  /**
   * H2 (N20): a proposed donation link is unapproved by definition, and the
   * live link is the one adopters trust because it was verified. The input
   * carries a real pending link, so this can't pass merely because the field
   * was null.
   */
  it("never carries a pending (unapproved) donation link, in either view", () => {
    const withPending = {
      ...shelter,
      pendingDonation: {
        link: { url: "https://send.monobank.ua/jar/swapped", provider: "monobank_jar" as const },
        proposedAt: AT,
        proposedBy: "44444444-4444-4444-8444-444444444444" as never,
      },
      verification: "verified" as const,
    };
    for (const view of [
      PublicShelterViewSchema.parse(withPending),
      ShelterSummaryViewSchema.parse(withPending),
    ]) {
      expect(view).not.toHaveProperty("pendingDonation");
      expect(JSON.stringify(view)).not.toContain("swapped");
    }
  });
});

describe("the reveal is the one sanctioned path to the contact details, and never to the address", () => {
  /** The stored first-reveal record, whole: what a regressed handler might hand the view. */
  const record = {
    shelterId: SHELTER_ID,
    displayName: shelter.displayName,
    contact,
    exactAddress,
    publicLocation: shelter.publicLocation,
    verificationStatusAtReveal: "verified",
    donation: null,
  } as const;
  const revealOf = (extra: Record<string, unknown> = {}) => ({
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    animalId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    revealedAt: AT,
    shelterContact: { source: "current", displayName: shelter.displayName, contact },
    shelterAtFirstReveal: record,
    animalSnapshot: { name: "Мурчик", primaryPhoto: null },
    ...extra,
  });

  /**
   * EM-D1 (Oleksii, 2026-10-15, verbatim: "the exact address never leaves the
   * server for adopters"): the view strips the exact address and the
   * district and point of the public location even when handed them, and
   * keeps the contact channels and the city.
   */
  it("carries the contact and the city, and strips the exact address, district and point", () => {
    const view = ContactRevealViewSchema.parse(
      revealOf({
        shelterContact: {
          source: "current",
          displayName: shelter.displayName,
          contact,
          exactAddress,
        },
      }),
    );

    expect(view.shelterAtFirstReveal).not.toHaveProperty("exactAddress");
    expect(view.shelterContact).not.toHaveProperty("exactAddress");
    expect(view.shelterAtFirstReveal.publicLocation).toEqual({ cityId: CITY_ID });
    const json = JSON.stringify(view);
    for (const leaked of ["вул. Прикладна", "61000", '"district"', '"coordinates"', '"lat"']) {
      expect(json, leaked).not.toContain(leaked);
    }
    expect(view.shelterContact.contact.primary).toEqual(contact.primary);
  });

  it("records the verification status as it stood at reveal time", () => {
    // A shelter suspended next month was verified when this adopter was sent
    // to it, and both facts matter when a complaint is investigated.
    const parsed = ContactRevealViewSchema.parse(revealOf());
    expect(parsed.shelterAtFirstReveal.verificationStatusAtReveal).toBe("verified");
  });
});

/**
 * K4-B5 (Oleksii, verbatim: "rename shelterSnapshot.contact. While the shelter
 * is visible it holds CURRENT contacts, and "snapshot" will mislead whoever
 * reads it next. The API has no outside consumers, so rename it now (e.g.
 * shelterContact, with the stored first-reveal snapshot clearly named as the
 * record)."). The contacts say where they came from, and the view's fields
 * stay exactly these at every level: a field added to the stored record or
 * the reveal reaches adopters only through an edit here, and the exact
 * address stays out (decision #2, EM-D1).
 */
describe("the reveal view's exact field set (K4-B4, K4-B5)", () => {
  const over = {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    animalId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    adopterId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    shelterId: SHELTER_ID,
    revealedAt: AT,
    // The old name, handed alongside: it must not come back through.
    shelterSnapshot: { contact },
    shelterAtFirstReveal: {
      shelterId: SHELTER_ID,
      displayName: shelter.displayName,
      contact,
      exactAddress,
      publicLocation: shelter.publicLocation,
      verificationStatusAtReveal: "verified",
      donation: null,
      pauseNote: "internal",
    },
    animalSnapshot: { name: "Мурчик", primaryPhoto: null },
  };

  it.each(["current", "first_reveal"] as const)(
    "%s: these keys and no others, even when handed more",
    (source) => {
      const view = ContactRevealViewSchema.parse({
        ...over,
        shelterContact: {
          source,
          displayName: "Лапа допомоги",
          contact,
          // The rest of the stored record, handed alongside: none of it comes back here.
          shelterId: SHELTER_ID,
          exactAddress,
          publicLocation: shelter.publicLocation,
          verificationStatusAtReveal: "verified",
          donation: null,
        },
      });
      expect(Object.keys(view).sort()).toEqual([
        "animalId",
        "animalSnapshot",
        "id",
        "revealedAt",
        "shelterAtFirstReveal",
        "shelterContact",
      ]);
      expect(Object.keys(view.shelterContact).sort()).toEqual(["contact", "displayName", "source"]);
      expect(view.shelterContact.source).toBe(source);
      expect(view.shelterContact.displayName).toBe("Лапа допомоги");
      // The first-reveal object carries neither the name nor the contacts: they
      // are `shelterContact`'s alone, so they come from one moment (RUI4-F1).
      expect(Object.keys(view.shelterAtFirstReveal).sort()).toEqual([
        "donation",
        "publicLocation",
        "shelterId",
        "verificationStatusAtReveal",
      ]);
    },
  );

  it("refuses contacts that don't say where they came from", () => {
    for (const shelterContact of [
      { displayName: "Лапа", contact },
      { source: "snapshot", displayName: "Лапа", contact },
    ]) {
      expect(() => ContactRevealViewSchema.parse({ ...over, shelterContact })).toThrow();
    }
  });

  /**
   * RUI4-F1: the name an adopter reads above the channels travels with them.
   * Contacts with no name of their own are refused, so the view can't fall
   * back to a name from some other moment.
   */
  it.each(["current", "first_reveal"] as const)(
    "%s: refuses contacts without the shelter's name beside them",
    (source) => {
      for (const displayName of [undefined, ""]) {
        expect(() =>
          ContactRevealViewSchema.parse({
            ...over,
            shelterContact: {
              source,
              contact,
              ...(displayName === undefined ? {} : { displayName }),
            },
          }),
        ).toThrow();
      }
    },
  );

  /**
   * `pick`, never `omit` (standing constraints, Code): the key tests above
   * can't tell them apart today, since both give the same set until a field is
   * added to the stored record, and then only `omit` lets it through.
   */
  it("is built with pick, never omit", () => {
    const source = readFileSync(new URL("./reveal.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/\.omit\(/);
    expect(source.match(/ShelterContactSnapshotSchema\.pick\(/g)).toHaveLength(3);
    expect(source).toMatch(/ContactRevealSchema\.pick\(/);
  });
});

/**
 * K4-B4, answer 2 (Oleksii, verbatim: "show the pause note under the paused
 * line, labelled «Коментар», visible only to that shelter's admins (and
 * operator/support)."): no public view can carry it. A public view holds
 * verification as a badge word only, so a paused state with its reason and
 * note can't even be passed through, and the views' keys are exactly these.
 */
describe("the pause note reaches no public view (K4-B4)", () => {
  const paused = {
    ...shelter,
    verification: {
      status: "paused",
      verifiedAt: AT,
      verifiedBy: MODERATOR,
      pausedAt: AT,
      reason: { code: "relocation", note: "Переїжджаємо до Бучі, телефон зміниться" },
      evidence: { items: [], submittedAt: AT },
    },
  };

  it("public views hold verification as a badge word, so the paused state with its note is refused", () => {
    expect(PublicShelterViewSchema.safeParse(paused).success).toBe(false);
    expect(ShelterSummaryViewSchema.safeParse(paused).success).toBe(false);
  });

  it("their keys are exactly these", () => {
    const publicView = PublicShelterViewSchema.parse({ ...paused, verification: "unverified" });
    expect(Object.keys(publicView).sort()).toEqual([
      "createdAt",
      "description",
      "displayName",
      "donation",
      "freshnessSentence",
      "id",
      "logo",
      "publicLocation",
      "verification",
    ]);
    const summary = ShelterSummaryViewSchema.parse({ ...paused, verification: "unverified" });
    expect(Object.keys(summary).sort()).toEqual([
      "displayName",
      "id",
      "logo",
      "publicLocation",
      "verification",
    ]);
    expect(JSON.stringify([publicView, summary])).not.toContain("Переїжджаємо");
  });
});
