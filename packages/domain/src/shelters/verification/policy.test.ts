import { describe, expect, it } from "vitest";
import { CityIdSchema, EdrpouSchema, ModeratorIdSchema } from "../../primitives/ids";
import type { ShelterLegalEntity } from "../legal-entity";
import type { ExactAddress } from "../location";
import type { EvidenceItem, VerificationEvidence } from "./evidence";
import {
  approvalGaps,
  DEFAULT_VERIFICATION_POLICY,
  type EvidenceGap,
  EvidenceGapSchema,
  evidenceGaps,
  meetsEvidenceRequirements,
  type VerificationPolicy,
} from "./policy";

const AT = new Date("2026-01-01T00:00:00.000Z");
const MODERATOR = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");
const EDRPOU = EdrpouSchema.parse("12345678");

const evidence = (items: readonly EvidenceItem[]): VerificationEvidence => ({
  items,
  submittedAt: AT,
});

const reference = (name: string): EvidenceItem => ({
  kind: "reference_contact",
  name,
  channel: { kind: "phone", e164: "+380501234567" },
  relationship: "veterinary_clinic",
});

const NGO: ShelterLegalEntity = {
  kind: "registered_ngo",
  legalName: "Тестовий притулок",
  edrpou: EDRPOU,
  registeredAt: AT,
};

const INITIATIVE: ShelterLegalEntity = {
  kind: "unregistered_initiative",
  contactPersonName: "Оксана",
};

const EDRPOU_ITEM: EvidenceItem = {
  kind: "edrpou_registration",
  edrpou: EDRPOU,
  registeredName: "ГО «Тестовий притулок»",
  documentKey: null,
};
const VIDEO_CALL: EvidenceItem = {
  kind: "site_visit",
  visitedAt: AT,
  visitedBy: MODERATOR,
  notes: "Відеодзвінок",
};
const BANK: EvidenceItem = {
  kind: "bank_account_holder",
  holderName: "Тестовий притулок",
  documentKey: null,
};

const FOP: ShelterLegalEntity = { kind: "sole_proprietor", legalName: "ФОП Тест", edrpou: EDRPOU };

/** An initiative's open-sources check: no ЄДР entry to record. */
const OPEN_SOURCES: EvidenceItem = {
  kind: "open_sources_review",
  registry: null,
  pages: ["https://prytulok.example.org/"],
  reviews: "Відгуки в Google: тварин віддають після стерилізації",
  notes: "Сторінка ведеться з 2022 року, тварин віддають після стерилізації",
  checkedAt: AT,
  checkedBy: MODERATOR,
};
/** A registered form's: the same check with its ЄДР entry. */
const OPEN_SOURCES_REGISTRY: EvidenceItem = {
  ...OPEN_SOURCES,
  registry: {
    edrpou: EDRPOU,
    registeredName: "ГО «Тестовий притулок»",
    registeredAddress: "м. Київ, вул. Тестова, 1",
  },
} as EvidenceItem;

const REGISTRY_ENTRY_GAP = { rule: "registry_entry", minimum: 1, provided: 0 } as const;
const CALL_OR_OPEN_SOURCES_GAP = {
  rule: "any_of",
  kinds: ["site_visit", "open_sources_review"],
  minimum: 1,
  provided: 0,
} as const;
const NO_REFERENCE = { rule: "kind", kind: "reference_contact", minimum: 1, provided: 0 } as const;

/**
 * Every legal form against every evidence set that matters to the rule, with the exact gaps.
 * The table is the policy as data: a changed line shows up here as a changed row.
 */
const TABLE: ReadonlyArray<{
  name: string;
  items: readonly EvidenceItem[];
  registered: readonly EvidenceGap[];
  initiative: readonly EvidenceGap[];
}> = [
  {
    name: "nothing",
    items: [],
    registered: [REGISTRY_ENTRY_GAP, CALL_OR_OPEN_SOURCES_GAP],
    initiative: [CALL_OR_OPEN_SOURCES_GAP, NO_REFERENCE],
  },
  {
    name: "registration and a video call",
    items: [EDRPOU_ITEM, VIDEO_CALL],
    registered: [],
    initiative: [NO_REFERENCE],
  },
  {
    name: "open sources with the registry, alone",
    items: [OPEN_SOURCES_REGISTRY],
    registered: [],
    initiative: [NO_REFERENCE],
  },
  {
    name: "open sources without the registry, alone",
    items: [OPEN_SOURCES],
    registered: [REGISTRY_ENTRY_GAP],
    initiative: [NO_REFERENCE],
  },
  {
    name: "registration and open sources without the registry",
    items: [EDRPOU_ITEM, OPEN_SOURCES],
    registered: [],
    initiative: [NO_REFERENCE],
  },
  {
    name: "open sources without the registry and a reference",
    items: [OPEN_SOURCES, reference("Ветклініка")],
    registered: [REGISTRY_ENTRY_GAP],
    initiative: [],
  },
  {
    name: "open sources with the registry and a reference",
    items: [OPEN_SOURCES_REGISTRY, reference("Ветклініка")],
    registered: [],
    initiative: [],
  },
  {
    name: "two open-sources checks",
    items: [OPEN_SOURCES, { ...OPEN_SOURCES, checkedAt: new Date(2) } as EvidenceItem],
    registered: [REGISTRY_ENTRY_GAP],
    initiative: [NO_REFERENCE],
  },
  {
    name: "registration, banking and a reference",
    items: [EDRPOU_ITEM, BANK, reference("Ветклініка")],
    registered: [CALL_OR_OPEN_SOURCES_GAP],
    initiative: [CALL_OR_OPEN_SOURCES_GAP],
  },
  {
    name: "a video call alone",
    items: [VIDEO_CALL],
    registered: [REGISTRY_ENTRY_GAP],
    initiative: [NO_REFERENCE],
  },
  {
    name: "a video call and a reference",
    items: [VIDEO_CALL, reference("Ветклініка")],
    registered: [REGISTRY_ENTRY_GAP],
    initiative: [],
  },
  {
    name: "two references",
    items: [reference("Ветклініка"), reference("Сусідня організація")],
    registered: [REGISTRY_ENTRY_GAP, CALL_OR_OPEN_SOURCES_GAP],
    initiative: [CALL_OR_OPEN_SOURCES_GAP],
  },
];

const kindsOf = (gap: EvidenceGap): readonly string[] =>
  gap.rule === "kind" ? [gap.kind] : gap.rule === "any_of" ? gap.kinds : [];

describe("evidence requirements, every legal form against the table", () => {
  it.each(TABLE)("registered NGO and ФОП: $name", ({ items, registered }) => {
    for (const entity of [NGO, FOP]) {
      expect(evidenceGaps(entity, evidence(items), DEFAULT_VERIFICATION_POLICY)).toEqual(
        registered,
      );
      expect(meetsEvidenceRequirements(entity, evidence(items), DEFAULT_VERIFICATION_POLICY)).toBe(
        registered.length === 0,
      );
    }
  });

  it.each(TABLE)("unregistered initiative: $name", ({ items, initiative }) => {
    expect(evidenceGaps(INITIATIVE, evidence(items), DEFAULT_VERIFICATION_POLICY)).toEqual(
      initiative,
    );
    expect(
      meetsEvidenceRequirements(INITIATIVE, evidence(items), DEFAULT_VERIFICATION_POLICY),
    ).toBe(initiative.length === 0);
  });
});

describe("evidence requirements", () => {
  it("makes the video call optional for a registered form once open sources are checked", () => {
    for (const entity of [NGO, FOP]) {
      const gaps = evidenceGaps(
        entity,
        evidence([OPEN_SOURCES_REGISTRY]),
        DEFAULT_VERIFICATION_POLICY,
      );
      expect(gaps).toEqual([]);
    }
  });

  it("counts only an open-sources check carrying the registry as a registry entry", () => {
    for (const entity of [NGO, FOP]) {
      expect(evidenceGaps(entity, evidence([OPEN_SOURCES]), DEFAULT_VERIFICATION_POLICY)).toEqual([
        REGISTRY_ENTRY_GAP,
      ]);
    }
  });

  it("lets an initiative's open sources replace the call, never the reference", () => {
    const checks = evidence([OPEN_SOURCES, OPEN_SOURCES_REGISTRY]);
    expect(evidenceGaps(INITIATIVE, checks, DEFAULT_VERIFICATION_POLICY)).toEqual([NO_REFERENCE]);
    expect(
      meetsEvidenceRequirements(
        INITIATIVE,
        evidence([OPEN_SOURCES, reference("Ветклініка")]),
        DEFAULT_VERIFICATION_POLICY,
      ),
    ).toBe(true);
  });

  it("requires a call from no legal form unconditionally", () => {
    for (const entity of [NGO, FOP, INITIATIVE]) {
      const lines = DEFAULT_VERIFICATION_POLICY.requirementsByLegalEntity[entity.kind];
      expect(lines).not.toContainEqual(
        expect.objectContaining({ rule: "kind", kind: "site_visit" }),
      );
    }
  });

  it("counts items of either kind together under an any-of line", () => {
    const policy: VerificationPolicy = {
      requirementsByLegalEntity: {
        ...DEFAULT_VERIFICATION_POLICY.requirementsByLegalEntity,
        registered_ngo: [
          { rule: "any_of", kinds: ["site_visit", "reference_contact"], minimum: 3 },
        ],
      },
    };
    expect(
      evidenceGaps(NGO, evidence([VIDEO_CALL, reference("Ветклініка"), BANK]), policy),
    ).toEqual([
      { rule: "any_of", kinds: ["site_visit", "reference_contact"], minimum: 3, provided: 2 },
    ]);
  });

  it("requires neither banking nor a reference from a registered form", () => {
    for (const entity of [NGO, FOP]) {
      const kinds = evidenceGaps(entity, evidence([]), DEFAULT_VERIFICATION_POLICY).flatMap(
        kindsOf,
      );
      expect(kinds).not.toContain("bank_account_holder");
      expect(kinds).not.toContain("reference_contact");
    }
  });

  it("does not require registration paperwork from an unregistered group", () => {
    const gaps = evidenceGaps(INITIATIVE, evidence([]), DEFAULT_VERIFICATION_POLICY);
    expect(gaps.map((gap) => gap.rule)).not.toContain("registry_entry");
    expect(gaps.flatMap(kindsOf)).not.toContain("edrpou_registration");
  });

  it("refuses an empty submission from every legal form", () => {
    for (const entity of [NGO, FOP, INITIATIVE]) {
      expect(meetsEvidenceRequirements(entity, evidence([]), DEFAULT_VERIFICATION_POLICY)).toBe(
        false,
      );
    }
  });

  it("gives every gap a shape the API error can carry", () => {
    for (const entity of [NGO, FOP, INITIATIVE]) {
      for (const gap of evidenceGaps(entity, evidence([]), DEFAULT_VERIFICATION_POLICY)) {
        expect(EvidenceGapSchema.parse(gap)).toEqual(gap);
      }
    }
  });
});

const ADDRESS: ExactAddress = {
  line1: "вул. Тестова, 1",
  line2: null,
  postalCode: null,
  cityId: CityIdSchema.parse("22222222-2222-4222-8222-222222222222"),
  district: null,
  coordinates: null,
};

describe("approval gaps", () => {
  it("lists the missing verified data first, legal details before the address", () => {
    const gaps = approvalGaps(
      { legalEntity: null, exactAddress: null },
      evidence([]),
      DEFAULT_VERIFICATION_POLICY,
    );
    expect(gaps).toEqual([
      { on: "verified_data", field: "legal_entity" },
      { on: "verified_data", field: "exact_address" },
    ]);
  });

  it("measures no evidence while the legal form is unknown", () => {
    const gaps = approvalGaps(
      { legalEntity: null, exactAddress: ADDRESS },
      evidence([]),
      DEFAULT_VERIFICATION_POLICY,
    );
    expect(gaps).toEqual([{ on: "verified_data", field: "legal_entity" }]);
  });

  it("follows a missing address with the evidence gaps of the known legal form", () => {
    const gaps = approvalGaps(
      { legalEntity: NGO, exactAddress: null },
      evidence([VIDEO_CALL]),
      DEFAULT_VERIFICATION_POLICY,
    );
    expect(gaps).toEqual([
      { on: "verified_data", field: "exact_address" },
      { on: "evidence", ...REGISTRY_ENTRY_GAP },
    ]);
  });

  it("is empty once the data is on file and the evidence suffices, even without a point", () => {
    const gaps = approvalGaps(
      { legalEntity: INITIATIVE, exactAddress: ADDRESS },
      evidence([VIDEO_CALL, reference("Ветклініка")]),
      DEFAULT_VERIFICATION_POLICY,
    );
    expect(gaps).toEqual([]);
  });
  /**
   * The 0024 rule holds for the new basis too: open sources prove the registry entry, but
   * «перевірений» still needs the legal entity and the exact address on the shelter itself.
   */
  it("never approves on open sources while the legal entity is missing", () => {
    const gaps = approvalGaps(
      { legalEntity: null, exactAddress: ADDRESS },
      evidence([OPEN_SOURCES_REGISTRY, EDRPOU_ITEM, VIDEO_CALL]),
      DEFAULT_VERIFICATION_POLICY,
    );
    expect(gaps).toEqual([{ on: "verified_data", field: "legal_entity" }]);
  });

  it("never approves on open sources while the exact address is missing", () => {
    for (const entity of [NGO, FOP]) {
      const gaps = approvalGaps(
        { legalEntity: entity, exactAddress: null },
        evidence([OPEN_SOURCES_REGISTRY]),
        DEFAULT_VERIFICATION_POLICY,
      );
      expect(gaps).toEqual([{ on: "verified_data", field: "exact_address" }]);
    }
  });

  it("is empty for a registered form with its data on file and open sources checked", () => {
    for (const entity of [NGO, FOP]) {
      const gaps = approvalGaps(
        { legalEntity: entity, exactAddress: ADDRESS },
        evidence([OPEN_SOURCES_REGISTRY]),
        DEFAULT_VERIFICATION_POLICY,
      );
      expect(gaps).toEqual([]);
    }
  });
});
