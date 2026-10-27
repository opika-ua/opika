import {
  ANIMAL_EDITED_FIELDS,
  HistoryActorViewSchema,
  LISTING_EVENT_TYPES,
  LISTING_KINDS,
  WithdrawalCodeSchema,
} from "@opika/domain";
import { describe, expect, it } from "vitest";
import { contract } from "../contract";
import { apiErrors } from "../errors";
import type { KabinetAccess } from "./access";
import { registryContract, shelterKabinetContract } from "./contract";
import {
  AnimalPatchSchema,
  KABINET_WITHDRAWAL_CODES,
  KabinetListingEventInputSchema,
  registryHistoryContract,
  registryVerificationContract,
  WITHDRAWAL_NOTE_MAX_CHARACTERS,
} from "./procedures";
import {
  BlockedAddressesViewSchema,
  CreatedShelterViewSchema,
  EmailSendOutcomeSchema,
  InvitationReminderSchema,
  InvitedAdminViewSchema,
  KabinetAnimalRowViewSchema,
  KabinetAnimalViewSchema,
  KabinetShelterViewSchema,
  RegistryShelterRowViewSchema,
  RegistryShelterViewSchema,
  ShelterAdminViewSchema,
  ShelterHistoryItemViewSchema,
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

const all = [...procedures(shelterKabinetContract), ...procedures(registryContract)];
const byPath = new Map(all);
const internals = (path: string) => {
  const procedure = byPath.get(path);
  if (procedure === undefined) throw new Error(`no procedure ${path}`);
  return procedure["~orpc"];
};

/**
 * A view's keys. The animal views are a union of two `pick`s (F-B1, T2);
 * both halves must carry exactly the same keys, or a draft and a listed
 * animal would reach the form with different fields, so a union whose halves
 * disagree fails here rather than reporting either half's list.
 */
const keysOf = (schema: { shape: object } | { options: readonly { shape: object }[] }) => {
  if ("shape" in schema) return Object.keys(schema.shape).sort();
  const [first, ...rest] = schema.options.map((option) => Object.keys(option.shape).sort());
  for (const other of rest) expect(other).toEqual(first);
  return first ?? [];
};

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
  "shelter.photos.add": WRITE,
  "shelter.photos.reorder": WRITE,
  "shelter.photos.remove": WRITE,
  "shelter.logo.set": WRITE,
  "shelter.logo.remove": WRITE,
  "shelter.history.list": READ,
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
  "registry.admins.blockedAddresses": REGISTRY,
  "registry.history.list": REGISTRY,
  "registry.support.enter": REGISTRY,
  "session.exitSupport": { surface: "support_exit" },
};

describe("the kabinet surface", () => {
  it("is exactly the addendum's procedures", () => {
    expect(all.map(([path]) => path).sort()).toEqual(Object.keys(EXPECTED_ACCESS).sort());
  });

  it("splits the shelter surface from the operator's (HS-Q1)", () => {
    expect(Object.keys(shelterKabinetContract)).toEqual(["shelter"]);
    expect(Object.keys(registryContract).sort()).toEqual(["registry", "session"]);
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

/**
 * RG-Q12 (Oleksii): the operator's donation decision carries the version it
 * read, and a stale one is CONFLICT. Pinned at the contract, so neither the
 * field nor the error can quietly drop off one of the two.
 */
describe("registry.donation.* compare-and-set on the version (RG-Q12)", () => {
  it.each(["registry.donation.approve", "registry.donation.reject"])(
    "%s requires expectedVersion and declares CONFLICT 409",
    (path) => {
      const shelterId = "51000000-0000-4000-8000-000000000001";
      const input = internals(path).inputSchema;
      expect(input?.safeParse({ shelterId, expectedVersion: 3 }).success).toBe(true);
      expect(input?.safeParse({ shelterId }).success).toBe(false);
      expect(internals(path).errorMap.CONFLICT?.status).toBe(409);
    },
  );
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

/**
 * KH-Q1's "not yet" refusal is gone with PR 6 of the K milestone, which
 * opened shelter writes for every shelter (P6-Q8, Oleksii, verbatim: "Q8 /
 * 0.3b: delete `refused_until_edit_screens`, `SHELTER_WRITES_NOT_YET_AVAILABLE`
 * and `profileEdit.errors.notAvailable`."). No procedure may declare it
 * again: a write answering "not yet" would be a claim nothing makes true.
 */
describe("no procedure declares the retired SHELTER_WRITES_NOT_YET_AVAILABLE (P6-Q8)", () => {
  const RETIRED = ["SHELTER", "WRITES", "NOT", "YET", "AVAILABLE"].join("_");

  it("sanity: the matrix still names the eighteen shelter writes", () => {
    expect(
      Object.values(EXPECTED_ACCESS).filter(
        (access) => access.surface === "shelter" && access.mode === "write",
      ),
    ).toHaveLength(18);
  });

  it("is no API error any more", () => {
    expect(Object.keys(apiErrors)).not.toContain(RETIRED);
  });

  it.each(all.map(([path]) => path))("%s does not declare it", (path) => {
    expect(Object.keys(internals(path).errorMap)).not.toContain(RETIRED);
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
      REGISTRY_CONFIRMED: apiErrors.REGISTRY_CONFIRMED.status,
      ADDRESS_HAS_A_ROLE: apiErrors.ADDRESS_HAS_A_ROLE.status,
      PHOTO_UPLOADS_UNAVAILABLE: apiErrors.PHOTO_UPLOADS_UNAVAILABLE.status,
      PHOTO_REJECTED: apiErrors.PHOTO_REJECTED.status,
      PHOTO_LIMIT_REACHED: apiErrors.PHOTO_LIMIT_REACHED.status,
      PHOTOS_REQUIRED_WHILE_VISIBLE: apiErrors.PHOTOS_REQUIRED_WHILE_VISIBLE.status,
      LISTING_FACT_REQUIRED: apiErrors.LISTING_FACT_REQUIRED.status,
      AGE_DATE_OUT_OF_RANGE: apiErrors.AGE_DATE_OUT_OF_RANGE.status,
    }).toEqual({
      FORBIDDEN: 403,
      CONFLICT: 409,
      ILLEGAL_TRANSITION: 409,
      EVIDENCE_INSUFFICIENT: 422,
      PUBLISH_REQUIREMENTS_UNMET: 422,
      UNDO_EXPIRED: 409,
      INVALID_EVIDENCE: 422,
      REGISTRY_CONFIRMED: 409,
      ADDRESS_HAS_A_ROLE: 409,
      PHOTO_UPLOADS_UNAVAILABLE: 503,
      PHOTO_REJECTED: 422,
      PHOTO_LIMIT_REACHED: 409,
      PHOTOS_REQUIRED_WHILE_VISIBLE: 409,
      LISTING_FACT_REQUIRED: 422,
      AGE_DATE_OUT_OF_RANGE: 422,
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
        "age",
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
        "coatLength",
        "age",
        "description",
        "photos",
        "temperament",
        "colour",
        "medicalNotes",
        "vaccination",
        "spayNeuter",
        "documentReadiness",
        "listing",
        "publicLocation",
        "createdAt",
        "lastUpdatedAt",
        "version",
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
        "logo",
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
      [
        "id",
        "displayName",
        "createdAt",
        "status",
        "cityId",
        "animalCount",
        "admins",
        "donationPending",
      ].sort(),
    );
    // R-UI answer 2: two counts, signed in and invited; inventory, not engagement.
    expect(keys(RegistryShelterRowViewSchema.shape.admins)).toEqual(["invited", "joined"]);
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

  it("InvitedAdminView: the admin plus this call's email outcome and reminder, nothing else (IN-E7, IN-E13)", () => {
    expect(keys(InvitedAdminViewSchema)).toEqual(
      ["id", "name", "email", "invite", "invitationEmail", "invitationReminder"].sort(),
    );
  });

  it("CreatedShelterView: the record plus the first admin's email outcome and reminder (IN-E7, IN-E13)", () => {
    expect(keys(CreatedShelterViewSchema)).toEqual(
      [
        ...keys(RegistryShelterViewSchema),
        "firstAdminInvitationEmail",
        "firstAdminInvitationReminder",
      ].sort(),
    );
  });

  it("InvitationReminder: tell_personally with its text, or null; nothing empty (IN-E13)", () => {
    expect(InvitationReminderSchema.safeParse(null).success).toBe(true);
    expect(InvitationReminderSchema.safeParse({ kind: "tell_personally", text: "x" }).success).toBe(
      true,
    );
    expect(InvitationReminderSchema.safeParse({ kind: "tell_personally", text: "" }).success).toBe(
      false,
    );
    expect(InvitationReminderSchema.safeParse({ kind: "tell_personally" }).success).toBe(false);
  });

  /**
   * Oleksii's answer 4 (2026-10-14): a failed read is `unknown`, never an
   * empty list; a capped read is `incomplete`, never a partial "none
   * blocked". So only `checked` may carry a plain `blocked` list, and
   * `unknown` carries no list at all.
   */
  it("BlockedAddressesView: checked, incomplete or unknown; only `checked` says who is blocked", () => {
    const variants = Object.fromEntries(
      BlockedAddressesViewSchema.options.map((option) => [option.shape.kind.value, keys(option)]),
    );
    expect(variants).toEqual({
      checked: ["asOf", "blocked", "kind"],
      incomplete: ["asOf", "blockedSoFar", "kind"],
      unknown: ["kind", "why"],
    });
    const asOf = new Date("2026-10-14T10:00:00Z");
    expect(BlockedAddressesViewSchema.safeParse({ kind: "unknown", blocked: [] }).success).toBe(
      false,
    );
    expect(
      BlockedAddressesViewSchema.safeParse({ kind: "incomplete", asOf, blocked: [] }).success,
    ).toBe(false);
    expect(
      BlockedAddressesViewSchema.safeParse({
        kind: "checked",
        asOf,
        blocked: [{ email: "a@example.org", reason: "unsubscribed" }],
      }).success,
    ).toBe(true);
    // Why a list is unknown: `provider_suppresses` (EM-B10, the invite route on
    // Resend) says the provider filters on a list that isn't read, which is not
    // the same claim as a provider with no list (`unsupported_provider`).
    for (const why of [
      "provider_error",
      "timed_out",
      "unsupported_provider",
      "provider_suppresses",
    ]) {
      expect(BlockedAddressesViewSchema.safeParse({ kind: "unknown", why }).success, why).toBe(
        true,
      );
    }
    // The per-send reasons that aren't the list's stay out of it.
    for (const why of ["list_too_long", "clear", ""]) {
      expect(BlockedAddressesViewSchema.safeParse({ kind: "unknown", why }).success, why).toBe(
        false,
      );
    }
  });

  it("EmailSendOutcome: sent with its block check, blocked with a reason, or failed with a reason; no address, no provider detail", () => {
    const variants = EmailSendOutcomeSchema.options.map((option) => keys(option));
    expect(variants).toEqual([
      ["blockCheck", "kind"],
      ["kind", "reason"],
      ["kind", "reason"],
    ]);
    for (const blockCheck of ["clear", "unknown"]) {
      expect(
        EmailSendOutcomeSchema.safeParse({ kind: "sent", blockCheck }).success,
        blockCheck,
      ).toBe(true);
    }
    // A `sent` that doesn't say whether the block list was read is not a valid outcome (review of 5f9e7c4, finding 1).
    expect(EmailSendOutcomeSchema.safeParse({ kind: "sent" }).success).toBe(false);
    expect(EmailSendOutcomeSchema.safeParse({ kind: "sent", blockCheck: "skipped" }).success).toBe(
      false,
    );
    expect(
      EmailSendOutcomeSchema.safeParse({ kind: "blocked", reason: "unsubscribed" }).success,
    ).toBe(true);
    expect(EmailSendOutcomeSchema.safeParse({ kind: "blocked" }).success).toBe(false);
    expect(EmailSendOutcomeSchema.safeParse({ kind: "delivered" }).success).toBe(false);
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
    "shelter.photos.add": ANIMAL_VIEW_KEYS,
    "shelter.photos.reorder": ANIMAL_VIEW_KEYS,
    "shelter.photos.remove": ANIMAL_VIEW_KEYS,
    "shelter.logo.set": SHELTER_VIEW_KEYS,
    "shelter.logo.remove": SHELTER_VIEW_KEYS,
    "shelter.history.list": ["items", "nextCursor"],
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
    const output = internals(path).outputSchema as unknown as Parameters<typeof keysOf>[0];
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

describe("every shelter-facing history variant carries exactly its listed keys (RG-Q8)", () => {
  /**
   * The shelter sees its history with no evidence and no moderator ids. Each
   * variant's key set is pinned by hand, so a field can't reach the shelter
   * without an edit here.
   */
  const EXPECTED: Record<string, string[]> = {
    verification: ["kind", "at", "actor", "from", "to", "event", "reason"],
    contact_changed: ["kind", "at", "actor", "previous", "next"],
    freshness_sentence_changed: ["kind", "at", "actor", "previous", "next"],
    description_changed: ["kind", "at", "actor", "previous", "next"],
    logo_changed: ["kind", "at", "actor", "previous", "next"],
    donation_proposed: ["kind", "at", "actor", "link"],
    donation_proposal_cancelled: ["kind", "at", "actor"],
    donation_decided: ["kind", "at", "actor", "decision", "link", "previousLive"],
    verified_data_changed: ["kind", "at", "actor", "change"],
    display_name_changed: ["kind", "at", "actor", "from", "to"],
    shelter_created: ["kind", "at", "actor"],
    admin_invited: ["kind", "at", "actor", "email"],
    admin_invitation_resent: ["kind", "at", "actor", "email"],
    admin_joined: ["kind", "at", "actor", "email"],
    admin_removed: ["kind", "at", "actor", "email", "wasPending"],
    animals_imported: ["kind", "at", "actor", "count"],
    animal_created: ["kind", "at", "actor", "animalName"],
    animal_edited: ["kind", "at", "actor", "animalName", "fields"],
    animal_listing_changed: ["kind", "at", "actor", "animalName", "event", "reason", "from", "to"],
    animal_deleted: ["kind", "at", "actor", "animalName"],
  };
  const variants = ShelterHistoryItemViewSchema.options.map(
    (option) => [option.shape.kind.value, Object.keys(option.shape).sort()] as const,
  );

  it("has an expected key list for every variant, and no other", () => {
    expect(variants.map(([kind]) => kind).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(variants)("%s", (kind, keys) => {
    expect(keys).toEqual([...(EXPECTED[kind] ?? [])].sort());
  });

  /**
   * Shapes §2's deep walk: every field name at any depth of the shelter-facing
   * history, nested reasons, legal entities, addresses and links included. A
   * field added to any of those schemas that names a moderator, evidence, a
   * reviewer, a "…By" author or engagement data turns this red.
   */
  it("carries no moderator, evidence, reviewer, author or engagement field at any depth", () => {
    type Def = {
      type?: string;
      shape?: Record<string, unknown>;
      options?: unknown[];
      [k: string]: unknown;
    };
    const names = new Set<string>();
    const seen = new Set<unknown>();
    const walk = (schema: unknown) => {
      if (schema === null || typeof schema !== "object" || seen.has(schema)) return;
      seen.add(schema);
      const def = (schema as { _zod?: { def?: Def } })._zod?.def;
      if (!def) return;
      if (def.type === "object" && def.shape) {
        for (const [key, child] of Object.entries(def.shape)) {
          names.add(key);
          walk(child);
        }
      }
      for (const key of ["options", "items"]) {
        const list = def[key];
        if (Array.isArray(list)) for (const child of list) walk(child);
      }
      for (const key of ["innerType", "element", "in", "out", "valueType", "left", "right"]) {
        if (def[key]) walk(def[key]);
      }
    };
    walk(ShelterHistoryItemViewSchema);
    // Sanity: the walk reaches nested schemas (a legal entity's field, a link's field).
    expect(names).toContain("contactPersonName");
    expect(names).toContain("provider");
    const words = (name: string) => name.split(/(?=[A-Z])/).map((w) => w.toLowerCase());
    const STEMS = [
      "moderator",
      "evidence",
      "reviewer",
      "adopter",
      "reveal",
      "swip",
      "view",
      "seen",
    ];
    const leaking = [...names].filter((name) => {
      const ws = words(name);
      return ws.some((w) => STEMS.some((stem) => w.startsWith(stem))) || ws.at(-1) === "by";
    });
    expect(leaking).toEqual([]);
  });

  it("the actor is an operator display name or the shelter, never an id", () => {
    expect(
      HistoryActorViewSchema.options.map((option) => Object.keys(option.shape).sort()),
    ).toEqual([["displayName", "kind"], ["kind"]]);
  });
});

/**
 * IN-Q14: the operator reads the full entry (`HistoryEntryViewSchema` is the
 * domain union itself), so an `admin_joined` line keeps which invitation was
 * accepted and by whom; the shelter-facing variant above has only the email.
 * Parsed through the procedure's own output schema, which is what oRPC strips
 * against, so a narrowed operator view turns this red.
 */
describe("the operator's history keeps admin_joined's ids", () => {
  it("registry.history.list returns the invitation id and the admin id", () => {
    const entry = {
      kind: "admin_joined",
      at: new Date("2026-10-14T00:00:00.000Z"),
      shelterAdminId: "33333333-3333-4333-8333-333333333333",
      invitationId: "44444444-4444-4444-8444-444444444444",
      email: "olena@example.org",
    };
    const output = (
      registryHistoryContract.list as unknown as {
        "~orpc": { outputSchema: { parse: (v: unknown) => { items: unknown[] } } };
      }
    )["~orpc"].outputSchema.parse({ items: [entry], nextCursor: null });
    expect(output.items).toEqual([entry]);
  });
});

/** K-Q7: the operator reads a shelter's animal writes with the animal's id; only the shelter's own view drops it. */
describe("the operator's history keeps an animal write's id", () => {
  it("registry.history.list returns animal_listing_changed whole", () => {
    const entry = {
      kind: "animal_listing_changed",
      at: new Date("2026-10-16T00:00:00.000Z"),
      actor: { kind: "shelter_admin", shelterAdminId: "33333333-3333-4333-8333-333333333333" },
      animalId: "55555555-5555-4555-8555-555555555555",
      animalName: "Барсик",
      event: { type: "withdraw", reason: { code: "transferred" } },
      from: "published",
      to: "withdrawn",
    };
    const output = (
      registryHistoryContract.list as unknown as {
        "~orpc": { outputSchema: { parse: (v: unknown) => { items: unknown[] } } };
      }
    )["~orpc"].outputSchema.parse({ items: [entry], nextCursor: null });
    expect(output.items).toEqual([entry]);
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
    // Strict (HS-T5): a client-sent instant is refused, not quietly dropped.
    expect(
      KabinetListingEventInputSchema.safeParse({ type: "publish", at: new Date(0) }).success,
    ).toBe(false);
  });

  /**
   * Every listing event the domain defines is reachable through exactly one
   * kabinet path: the six moves of `transition`, plus `confirm` and
   * `undoConfirm`, which have procedures of their own. A domain event added
   * without a path, or a path for an event the domain lacks, fails here.
   */
  it("transition's events plus confirm and undo are exactly the domain's listing events", () => {
    const moves = KabinetListingEventInputSchema.options.map((option) => option.shape.type.value);
    expect([...moves, "confirm", "undo_confirm"].sort()).toEqual([...LISTING_EVENT_TYPES].sort());
  });
});

/** K2 copy sheet P6 and question 10 (the recommendations, taken while Oleksii is away). */
describe("a withdrawal's reason as the kabinet takes it", () => {
  const withdraw = (reason: unknown) =>
    KabinetListingEventInputSchema.safeParse({ type: "withdraw", reason });

  it("trims the note, and a blank or null note means none", () => {
    expect(withdraw({ code: "transferred", note: "  До притулку в Бучі  " }).data).toEqual({
      type: "withdraw",
      reason: { code: "transferred", note: "До притулку в Бучі" },
    });
    for (const note of ["   \n ", "", null]) {
      expect(withdraw({ code: "other", note }).data, JSON.stringify(note)).toEqual({
        type: "withdraw",
        reason: { code: "other", note: null },
      });
    }
  });

  it("takes 2,000 characters and refuses 2,001, emoji counted as one each", () => {
    expect(WITHDRAWAL_NOTE_MAX_CHARACTERS).toBe(2000);
    expect(withdraw({ code: "other", note: "🐾".repeat(2000) }).success).toBe(true);
    expect(withdraw({ code: "other", note: "а".repeat(2001) }).success).toBe(false);
  });

  /** A homed animal is marked «Уже вдома» (adopt), so it counts as adopted, not withdrawn. */
  it("offers four of the domain's five codes: never adopted_elsewhere", () => {
    expect([...KABINET_WITHDRAWAL_CODES].sort()).toEqual(
      WithdrawalCodeSchema.options.filter((code) => code !== "adopted_elsewhere").sort(),
    );
    for (const code of KABINET_WITHDRAWAL_CODES) {
      expect(withdraw({ code, note: null }).success, code).toBe(true);
    }
    expect(withdraw({ code: "adopted_elsewhere", note: null }).success).toBe(false);
  });

  it("is strict: an unknown key in the reason is refused", () => {
    expect(withdraw({ code: "other", note: null, public: true }).success).toBe(false);
  });
});

/** K2's chips and N5's «Показати ці N»: one filter at a time (K2 copy sheet P7). */
describe("the K2 list's filter", () => {
  const parse = (filter: unknown) =>
    internals("shelter.animals.list").inputSchema?.safeParse({ filter, cursor: null, limit: 10 });

  it("is all, one listing kind, or stale", () => {
    expect(parse({ kind: "all" })?.success).toBe(true);
    for (const listing of LISTING_KINDS) {
      expect(parse({ kind: "listing", listing })?.success, listing).toBe(true);
    }
    expect(parse({ kind: "stale" })?.success).toBe(true);
  });

  it("refuses a kind with no listing, stale combined with a kind, and the old nullable field", () => {
    expect(parse({ kind: "listing" })?.success).toBe(false);
    expect(parse({ kind: "stale", listing: "draft" })?.success).toBe(false);
    expect(parse(null)?.success).toBe(false);
    expect(
      internals("shelter.animals.list").inputSchema?.safeParse({
        listing: null,
        cursor: null,
        limit: 10,
      })?.success,
    ).toBe(false);
  });

  /**
   * K-Q7: an `animal_edited` entry names the patch's keys, plus `photos`,
   * which the photo procedures record (P-Q3) and which is no patch key. A
   * patch key with no history literal would make an edit unrecordable; a
   * literal with neither a patch key nor its own procedure names a field
   * nothing edits.
   */
  it("the fields an edit entry can name are the patch's keys plus photos", () => {
    expect([...Object.keys(AnimalPatchSchema.shape), "photos"].sort()).toEqual(
      [...ANIMAL_EDITED_FIELDS].sort(),
    );
  });

  it("an animal patch refuses nothing-at-all, and refuses documents, photos or listing", () => {
    expect(AnimalPatchSchema.safeParse({}).success).toBe(false);
    expect(AnimalPatchSchema.safeParse({ name: "Барсик" }).success).toBe(true);
    for (const extra of [
      { documentReadiness: { kind: "unknown" } },
      { photos: [] },
      { listing: { kind: "draft" } },
    ]) {
      expect(
        AnimalPatchSchema.safeParse({ name: "Барсик", ...extra }).success,
        JSON.stringify(extra),
      ).toBe(false);
    }
  });

  /**
   * HS-T5 (Oleksii): kabinet inputs are strict, so a smuggled key is
   * BAD_REQUEST. Checked on every procedure by the issue Zod reports for the
   * key itself, so this can't pass merely because required fields were
   * missing too.
   */
  it.each(all.map(([path]) => path))("%s: an unknown input key is refused", (path) => {
    const schema = byPath.get(path)?.["~orpc"].inputSchema as unknown as {
      safeParse: (v: unknown) => {
        success: boolean;
        error?: { issues: { code: string; keys?: string[] }[] };
      };
    };
    const unrecognized = (input: object) =>
      schema.safeParse(input).error?.issues.find((issue) => issue.code === "unrecognized_keys")
        ?.keys;
    expect(unrecognized({ smuggled: true })).toEqual(["smuggled"]);
    // A shelter.* input has no shelterId of its own, so one is a smuggled key too.
    if (path.startsWith("shelter."))
      expect(unrecognized({ shelterId: "x" })).toEqual(["shelterId"]);
  });

  it("a shelter.* input has no shelterId field to point at another shelter", () => {
    for (const [path, procedure] of all) {
      if (!path.startsWith("shelter.")) continue;
      const shape = (procedure["~orpc"].inputSchema as unknown as { shape?: object }).shape ?? {};
      expect(Object.keys(shape), path).not.toContain("shelterId");
    }
  });
});
