import { describe, expect, it } from "vitest";
import { contract } from "../contract";
import { apiErrors } from "../errors";
import type { KabinetAccess } from "./access";
import { kabinetContract } from "./contract";
import {
  AnimalPatchSchema,
  KabinetListingEventInputSchema,
  registryVerificationContract,
} from "./procedures";
import {
  KabinetAnimalRowViewSchema,
  KabinetAnimalViewSchema,
  KabinetShelterViewSchema,
  RegistryShelterRowViewSchema,
  RegistryShelterViewSchema,
  ShelterAdminViewSchema,
} from "./views";

type ProcedureInternals = {
  readonly "~orpc": {
    readonly meta: { readonly access: KabinetAccess | null };
    readonly outputSchema: unknown;
    readonly errorMap: Record<string, { readonly status?: number } | undefined>;
    readonly inputSchema?: {
      readonly safeParse: (v: unknown) => { success: boolean; data?: unknown };
    };
  };
};

const procedures = (node: object, prefix = ""): readonly [string, ProcedureInternals][] =>
  Object.entries(node).flatMap(([key, value]) => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    return value !== null && Object.getPrototypeOf(value) === Object.prototype
      ? procedures(value as object, path)
      : [[path, value as ProcedureInternals] as const];
  });

const all = procedures(kabinetContract);
const byPath = new Map(all);
const internals = (path: string) => {
  const procedure = byPath.get(path);
  if (procedure === undefined) throw new Error(`no procedure ${path}`);
  return procedure["~orpc"];
};

const keysOf = (schema: { shape: object }) => Object.keys(schema.shape).sort();

const READ = { surface: "shelter", mode: "read" } as const;
const WRITE = { surface: "shelter", mode: "write" } as const;
const REGISTRY = { surface: "registry" } as const;

/**
 * The whole access matrix, transcribed by hand from the addendum §1/§4 rather
 * than read back from the procedures. Adding a procedure, or changing who may
 * call one, has to be an edit here made while looking at it.
 */
const EXPECTED_ACCESS: Record<string, KabinetAccess> = {
  "shelter.profile.get": READ,
  "shelter.profile.updateContact": WRITE,
  "shelter.profile.updateFreshnessSentence": WRITE,
  "shelter.profile.proposeDonation": WRITE,
  "shelter.profile.cancelDonationProposal": WRITE,
  "shelter.profile.pause": WRITE,
  "shelter.profile.resume": WRITE,
  "shelter.verification.requestReview": WRITE,
  "shelter.animals.list": READ,
  "shelter.animals.byId": READ,
  "shelter.animals.createDraft": WRITE,
  "shelter.animals.update": WRITE,
  "shelter.animals.transition": WRITE,
  "shelter.animals.confirm": WRITE,
  "shelter.animals.undoConfirm": WRITE,
  "shelter.animals.deleteDraft": WRITE,
  "registry.shelters.list": REGISTRY,
  "registry.shelters.byId": REGISTRY,
  "registry.shelters.create": REGISTRY,
  "registry.shelters.updateVerifiedData": REGISTRY,
  "registry.shelters.updateProfile": REGISTRY,
  "registry.verification.startReview": REGISTRY,
  "registry.verification.approve": REGISTRY,
  "registry.verification.reinstate": REGISTRY,
  "registry.verification.reject": REGISTRY,
  "registry.verification.suspend": REGISTRY,
  "registry.verification.resubmit": REGISTRY,
  "registry.donation.approve": REGISTRY,
  "registry.donation.reject": REGISTRY,
  "registry.admins.invite": REGISTRY,
  "registry.admins.resendInvite": REGISTRY,
  "registry.admins.remove": REGISTRY,
  "registry.history.list": REGISTRY,
  "registry.support.enter": REGISTRY,
  "session.exitSupport": { surface: "support_exit" },
};

describe("the kabinet surface", () => {
  it("is exactly the addendum's procedures", () => {
    expect(all.map(([path]) => path).sort()).toEqual(Object.keys(EXPECTED_ACCESS).sort());
  });

  it("is not merged into the adopter contract until its handlers exist", () => {
    expect(Object.keys(contract)).not.toContain("shelter");
    expect(Object.keys(contract)).not.toContain("registry");
    expect(Object.keys(contract.session)).toEqual(["bootstrap"]);
  });
});

describe("access is declared on every procedure (deny-by-default)", () => {
  it.each(all.map(([path]) => path))("%s declares the access the matrix gives it", (path) => {
    const { access } = internals(path).meta;
    expect(access, `${path} still carries the builder's null default`).not.toBeNull();
    expect(access).toEqual(EXPECTED_ACCESS[path]);
  });
});

describe("FORBIDDEN is declared wherever an actor can be the wrong one", () => {
  /**
   * S3-Q2: shelter A's member acting on shelter B's animal or shelter is
   * FORBIDDEN, confirm and undoConfirm included. The cross-tenant tests that
   * prove a handler *raises* it belong to the handlers slice; this proves the
   * contract lets it, since an undeclared error can't be thrown typed.
   */
  it.each(all.map(([path]) => path))("%s declares FORBIDDEN with status 403", (path) => {
    expect(internals(path).errorMap.FORBIDDEN?.status).toBe(403);
  });

  it("covers confirm and undoConfirm by name, not only by iteration", () => {
    expect(internals("shelter.animals.confirm").errorMap.FORBIDDEN).toBeDefined();
    expect(internals("shelter.animals.undoConfirm").errorMap.FORBIDDEN).toBeDefined();
    expect(internals("shelter.animals.undoConfirm").errorMap.UNDO_EXPIRED?.status).toBe(409);
  });
});

describe("kabinet error statuses", () => {
  it("pins each new code's HTTP status literally", () => {
    expect({
      FORBIDDEN: apiErrors.FORBIDDEN.status,
      CONFLICT: apiErrors.CONFLICT.status,
      ILLEGAL_TRANSITION: apiErrors.ILLEGAL_TRANSITION.status,
      EVIDENCE_INSUFFICIENT: apiErrors.EVIDENCE_INSUFFICIENT.status,
      PUBLISH_REQUIREMENTS_UNMET: apiErrors.PUBLISH_REQUIREMENTS_UNMET.status,
      UNDO_EXPIRED: apiErrors.UNDO_EXPIRED.status,
      INVALID_EVIDENCE: apiErrors.INVALID_EVIDENCE.status,
    }).toEqual({
      FORBIDDEN: 403,
      CONFLICT: 409,
      ILLEGAL_TRANSITION: 409,
      EVIDENCE_INSUFFICIENT: 422,
      PUBLISH_REQUIREMENTS_UNMET: 422,
      UNDO_EXPIRED: 409,
      INVALID_EVIDENCE: 422,
    });
  });
});

describe("kabinet views carry exactly their listed keys", () => {
  /**
   * Commitment #2: a shelter is never told someone looked at a card. Pinning
   * each view's whole key set (not just the absence of a few names) means no
   * reveal, swipe or view count can be added without an edit here.
   */
  const keys = keysOf;

  it("KabinetAnimalRowView", () => {
    expect(keys(KabinetAnimalRowViewSchema)).toEqual(
      [
        "id",
        "name",
        "species",
        "sex",
        "size",
        "listing",
        "lastUpdatedAt",
        "coverPhoto",
        "freshness",
        "publishGaps",
      ].sort(),
    );
  });

  it("KabinetAnimalView", () => {
    expect(keys(KabinetAnimalViewSchema)).toEqual(
      [
        "id",
        "name",
        "species",
        "sex",
        "size",
        "age",
        "description",
        "photos",
        "vaccination",
        "spayNeuter",
        "documentReadiness",
        "listing",
        "publicLocation",
        "createdAt",
        "lastUpdatedAt",
      ].sort(),
    );
  });

  it("KabinetShelterView, with the shelter-facing verification, not the operator's", () => {
    expect(keys(KabinetShelterViewSchema)).toEqual(
      [
        "id",
        "displayName",
        "description",
        "legalEntity",
        "exactAddress",
        "contact",
        "donation",
        "pendingDonation",
        "freshnessSentence",
        "version",
        "verification",
      ].sort(),
    );
    // The operator's record carries evidence and moderator ids; this one must not parse it.
    const verification = KabinetShelterViewSchema.shape.verification;
    expect(
      verification.safeParse({
        status: "verified",
        verifiedAt: new Date(),
        verifiedBy: "11111111-1111-4111-8111-111111111111",
        evidence: { items: [], submittedAt: new Date() },
      }).success,
    ).toBe(false);
  });

  it("RegistryShelterRowView", () => {
    expect(keys(RegistryShelterRowViewSchema)).toEqual(
      ["id", "displayName", "createdAt", "status", "cityId", "animalCount"].sort(),
    );
  });

  it("RegistryShelterView", () => {
    expect(keys(RegistryShelterViewSchema)).toEqual(
      [
        "id",
        "displayName",
        "description",
        "legalEntity",
        "publicLocation",
        "exactAddress",
        "contact",
        "donation",
        "pendingDonation",
        "freshnessSentence",
        "verification",
        "createdAt",
        "lastUpdatedAt",
        "version",
        "admins",
      ].sort(),
    );
  });

  it("ShelterAdminView", () => {
    expect(keys(ShelterAdminViewSchema)).toEqual(["id", "name", "email", "invite"].sort());
  });
});

describe("every shelter-facing output carries exactly its listed keys", () => {
  /**
   * The H2 done-criterion: commitment #2 pinned over the shelter router's own
   * outputs, not only the views they reuse. A `revealCount` beside
   * `staleCount`, or beside `confirm`'s `undoUntil`, would bypass the
   * view-level pins above.
   */
  const SHELTER_VIEW_KEYS = keysOf(KabinetShelterViewSchema);
  const ANIMAL_VIEW_KEYS = keysOf(KabinetAnimalViewSchema);
  const EXPECTED_OUTPUT_KEYS: Record<string, readonly string[]> = {
    "shelter.profile.get": SHELTER_VIEW_KEYS,
    "shelter.profile.updateContact": SHELTER_VIEW_KEYS,
    "shelter.profile.updateFreshnessSentence": SHELTER_VIEW_KEYS,
    "shelter.profile.proposeDonation": SHELTER_VIEW_KEYS,
    "shelter.profile.cancelDonationProposal": SHELTER_VIEW_KEYS,
    "shelter.profile.pause": SHELTER_VIEW_KEYS,
    "shelter.profile.resume": SHELTER_VIEW_KEYS,
    "shelter.verification.requestReview": SHELTER_VIEW_KEYS,
    "shelter.animals.list": ["counts", "items", "nextCursor", "staleCount"],
    "shelter.animals.byId": ANIMAL_VIEW_KEYS,
    "shelter.animals.createDraft": ANIMAL_VIEW_KEYS,
    "shelter.animals.update": ANIMAL_VIEW_KEYS,
    "shelter.animals.transition": ANIMAL_VIEW_KEYS,
    "shelter.animals.confirm": ["animal", "undoUntil"],
    "shelter.animals.undoConfirm": ANIMAL_VIEW_KEYS,
    "shelter.animals.deleteDraft": [],
  };

  it("lists every shelter.* procedure", () => {
    expect(
      all
        .map(([path]) => path)
        .filter((path) => path.startsWith("shelter."))
        .sort(),
    ).toEqual(Object.keys(EXPECTED_OUTPUT_KEYS).sort());
  });

  it.each(Object.keys(EXPECTED_OUTPUT_KEYS))("%s", (path) => {
    const output = internals(path).outputSchema as unknown as { shape: object };
    expect(keysOf(output)).toEqual([...(EXPECTED_OUTPUT_KEYS[path] ?? [])].sort());
  });

  it("the list's items and confirm's animal are the pinned views themselves", () => {
    const list = internals("shelter.animals.list").outputSchema as unknown as {
      shape: { items: { unwrap: () => { element: unknown } } };
    };
    // `items` is `.readonly()`, which wraps the array.
    expect(list.shape.items.unwrap().element).toBe(KabinetAnimalRowViewSchema);
    const confirm = internals("shelter.animals.confirm").outputSchema as unknown as {
      shape: { animal: unknown };
    };
    expect(confirm.shape.animal).toBe(KabinetAnimalViewSchema);
  });
});

describe("the operator's reject/suspend note", () => {
  const SHELTER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const parse = (procedure: "reject" | "suspend", code: string, note: unknown) =>
    (registryVerificationContract[procedure] as unknown as ProcedureInternals)[
      "~orpc"
    ].inputSchema?.safeParse({
      shelterId: SHELTER,
      reason: { code, note },
    });

  it.each([
    ["reject", "other"],
    ["suspend", "other"],
  ] as const)("%s refuses a whitespace-only, empty or missing note", (procedure, code) => {
    for (const note of ["   \n\t ", "", null, undefined]) {
      expect(parse(procedure, code, note)?.success, JSON.stringify(note)).toBe(false);
    }
  });

  it("is trimmed before it is stored, so the shelter reads no stray whitespace", () => {
    const result = parse("reject", "other", "  Я не зміг перевірити адресу.  ");
    expect(result?.success).toBe(true);
    expect(result?.data).toMatchObject({ reason: { note: "Я не зміг перевірити адресу." } });
  });
});

describe("shelter inputs", () => {
  it("a listing move carries no client instant and can't be a confirm", () => {
    expect(KabinetListingEventInputSchema.safeParse({ type: "publish" }).success).toBe(true);
    expect(KabinetListingEventInputSchema.safeParse({ type: "confirm" }).success).toBe(false);
    expect(KabinetListingEventInputSchema.safeParse({ type: "undo_confirm" }).success).toBe(false);
    const withAt = KabinetListingEventInputSchema.parse({ type: "publish", at: new Date(0) });
    expect(withAt).not.toHaveProperty("at");
  });

  it("an animal patch refuses nothing-at-all and never carries documents, photos or listing", () => {
    expect(AnimalPatchSchema.safeParse({}).success).toBe(false);
    const parsed = AnimalPatchSchema.parse({
      name: "Барсик",
      documentReadiness: { kind: "unknown" },
      photos: [],
      listing: { kind: "draft" },
    });
    expect(Object.keys(parsed)).toEqual(["name"]);
  });

  it("a shelter.* input has no shelterId field to point at another shelter", () => {
    for (const [path, procedure] of all) {
      if (!path.startsWith("shelter.")) continue;
      const shape = (procedure["~orpc"].inputSchema as unknown as { shape?: object }).shape ?? {};
      expect(Object.keys(shape), path).not.toContain("shelterId");
    }
  });
});
