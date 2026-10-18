import { describe, expect, it } from "vitest";
import { NO_FILTERS } from "../adopters/feed-filters";
import { DEFAULT_FRESHNESS_POLICY, freshnessOf } from "../discovery/freshness";
import { DEFAULT_SCORING_POLICY, scoreAnimal } from "../discovery/scoring";
import { AnimalIdSchema, ShelterIdSchema } from "../primitives/ids";
import {
  AnimalSchema,
  type DraftAnimal,
  DraftAnimalSchema,
  isDiscoverableAnimal,
  isDraftAnimal,
  isListedAnimal,
  type ListedAnimal,
  ListedAnimalSchema,
} from "./animal";
import type { AnimalListingState, NonDraftListing } from "./listing";
import {
  listingAfterPhotoChange,
  PUBLISH_GAP_KINDS,
  publishGaps,
  publishReadinessOf,
  transitionListing,
  UNDO_WINDOW_MS,
} from "./listing-transition";

const AT = new Date("2026-10-17T09:00:00.000Z");
const EARLIER = new Date("2026-09-01T09:00:00.000Z");
const PHOTO = { storageKey: "animals/a/1", width: 1600, height: 2000, alt: null };

const unknownFact = { source: "shelter_declared", state: "unknown", declaredAt: AT } as const;

/** K-Q5: a name and a species, nothing else answered yet (D2: sex starts «Не записано»). */
const newDraft: DraftAnimal = {
  id: AnimalIdSchema.parse("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
  shelterId: ShelterIdSchema.parse("dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
  name: "Ластівка",
  species: "dog",
  sex: "unknown",
  size: null,
  age: null,
  description: null,
  photos: [],
  vaccination: unknownFact,
  spayNeuter: unknownFact,
  documentReadiness: { kind: "unknown" },
  listing: { kind: "draft" },
  publicLocation: null,
  createdAt: AT,
  lastUpdatedAt: AT,
  version: 0,
};

const facts = {
  size: "medium",
  age: { kind: "declared_bucket", bucket: "young", declaredAt: EARLIER },
  description: { uk: "Спокійна, любить гуляти.", en: null },
} as const;

const completeDraft: DraftAnimal = { ...newDraft, ...facts, photos: [PHOTO] };

const NON_DRAFT_LISTINGS: readonly NonDraftListing[] = [
  { kind: "published", publishedAt: EARLIER, confirmedAt: EARLIER, undoable: null },
  { kind: "reserved", since: AT, publishedAt: EARLIER, confirmedAt: EARLIER, undoable: null },
  { kind: "adopted", adoptedAt: AT },
  { kind: "withdrawn", withdrawnAt: AT, reason: { code: "transferred", note: null } },
];

const listed = (listing: NonDraftListing): ListedAnimal => ({ ...newDraft, ...facts, listing });

describe("the animal union (F-B1)", () => {
  it("a draft parses with only a name and a species answered", () => {
    expect(DraftAnimalSchema.safeParse(newDraft).success).toBe(true);
    expect(AnimalSchema.safeParse(newDraft).success).toBe(true);
  });

  it("a draft still needs a name and a species", () => {
    expect(DraftAnimalSchema.safeParse({ ...newDraft, name: "" }).success).toBe(false);
    expect(DraftAnimalSchema.safeParse({ ...newDraft, species: null }).success).toBe(false);
    expect(DraftAnimalSchema.safeParse({ ...newDraft, sex: null }).success).toBe(false);
  });

  it("a draft restored from a withdrawn listing keeps every fact, and still parses as a draft", () => {
    expect(AnimalSchema.parse(completeDraft)).toEqual(completeDraft);
    expect(isDraftAnimal(AnimalSchema.parse(completeDraft))).toBe(true);
  });

  for (const listing of NON_DRAFT_LISTINGS) {
    for (const fact of ["size", "age", "description"] as const) {
      it(`a ${listing.kind} animal with no ${fact} is refused`, () => {
        const missing = { ...listed(listing), [fact]: null };
        expect(ListedAnimalSchema.safeParse(missing).success).toBe(false);
        // Nor does the union let it through as a draft: its listing isn't one.
        expect(AnimalSchema.safeParse(missing).success).toBe(false);
      });
    }

    it(`a ${listing.kind} animal with every fact parses as listed`, () => {
      expect(ListedAnimalSchema.safeParse(listed(listing)).success).toBe(true);
    });
  }

  it("the guards split on the listing, and only published and reserved are discoverable", () => {
    expect(isDraftAnimal(newDraft)).toBe(true);
    expect(isListedAnimal(newDraft)).toBe(false);
    expect(isDiscoverableAnimal(newDraft)).toBe(false);
    expect(NON_DRAFT_LISTINGS.map((listing) => isListedAnimal(listed(listing)))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(NON_DRAFT_LISTINGS.map((listing) => isDiscoverableAnimal(listed(listing)))).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });
});

describe("publishReadinessOf", () => {
  it("lists every gap in form order when nothing but a name and a species is there", () => {
    expect(publishReadinessOf(newDraft)).toEqual({
      kind: "gaps",
      gaps: [{ kind: "size" }, { kind: "age" }, { kind: "description" }, { kind: "photo" }],
    });
    // Form order, transcribed from the copy sheet's §11 («розмір», «вік», «опис», «фото»).
    expect(PUBLISH_GAP_KINDS).toEqual(["size", "age", "description", "photo"]);
  });

  it.each([
    ["size", { size: null }],
    ["age", { age: null }],
    ["description", { description: null }],
    ["photo", { photos: [] }],
  ] as const)("names a missing %s alone", (kind, without) => {
    expect(publishReadinessOf({ ...completeDraft, ...without })).toEqual({
      kind: "gaps",
      gaps: [{ kind }],
    });
  });

  it("is ready with exactly the draft's facts once everything is there", () => {
    expect(publishReadinessOf(completeDraft)).toEqual({ kind: "ready", facts });
  });

  it("never counts the sex or the medical facts as gaps (D2, «Не записано» is an answer)", () => {
    expect(publishReadinessOf({ ...completeDraft, sex: "unknown" }).kind).toBe("ready");
  });
});

describe("publishGaps", () => {
  it("is a draft's readiness gaps, or none when it is ready", () => {
    expect(publishGaps(newDraft)).toEqual([
      { kind: "size" },
      { kind: "age" },
      { kind: "description" },
      { kind: "photo" },
    ]);
    expect(publishGaps(completeDraft)).toEqual([]);
  });

  it("on a listed animal can only be the photo (a card published without one)", () => {
    const published = listed(NON_DRAFT_LISTINGS[0] as NonDraftListing);
    expect(publishGaps(published)).toEqual([{ kind: "photo" }]);
    expect(publishGaps({ ...published, photos: [PHOTO] })).toEqual([]);
  });
});

/** RH-B7 (D4 option (i)): a photo change on a visible card is a confirmation. */
describe("listingAfterPhotoChange", () => {
  const undoable = { previousConfirmedAt: EARLIER, confirmedAt: EARLIER };

  it("moves a published card's confirmation to the photo change, clearing the undo", () => {
    const published = {
      kind: "published",
      publishedAt: EARLIER,
      confirmedAt: EARLIER,
      undoable,
    } as const;
    expect(listingAfterPhotoChange(published, AT)).toEqual({
      kind: "published",
      publishedAt: EARLIER,
      confirmedAt: AT,
      undoable: null,
    });
  });

  it("moves a reserved card's confirmation, keeping `since` and `publishedAt`", () => {
    const since = new Date("2026-10-01T00:00:00.000Z");
    const reserved = {
      kind: "reserved",
      since,
      publishedAt: EARLIER,
      confirmedAt: EARLIER,
      undoable,
    } as const;
    expect(listingAfterPhotoChange(reserved, AT)).toEqual({
      kind: "reserved",
      since,
      publishedAt: EARLIER,
      confirmedAt: AT,
      undoable: null,
    });
  });

  it.each<AnimalListingState>([
    { kind: "draft" },
    { kind: "adopted", adoptedAt: EARLIER },
    { kind: "withdrawn", withdrawnAt: EARLIER, reason: { code: "other", note: null } },
  ])("leaves a $kind listing exactly as it was: it carries no date", (listing) => {
    expect(listingAfterPhotoChange(listing, AT)).toBe(listing);
  });

  it("never moves the date backwards", () => {
    const published = {
      kind: "published",
      publishedAt: EARLIER,
      confirmedAt: AT,
      undoable: null,
    } as const;
    expect(listingAfterPhotoChange(published, EARLIER)).toEqual(published);
  });

  it("expires a pending «Ще шукає» undo", () => {
    const confirmed = transitionListing(
      { kind: "published", publishedAt: EARLIER, confirmedAt: EARLIER, undoable: null },
      { type: "confirm", at: AT },
    );
    if (confirmed.kind !== "ok") throw new Error("confirm refused");
    const photoAt = new Date(AT.getTime() + 1000);
    const after = listingAfterPhotoChange(confirmed.next, photoAt);
    const undoAt = new Date(AT.getTime() + UNDO_WINDOW_MS - 1000);
    expect(transitionListing(after, { type: "undo_confirm", at: undoAt })).toEqual({
      kind: "undo_expired",
    });
  });
});

describe("what the types refuse (F-B1)", () => {
  it("a draft can't be scored, and a published listing can't be spread onto one without readiness", () => {
    const freshness = freshnessOf(AT, AT, DEFAULT_FRESHNESS_POLICY);
    const scoreDraft = () =>
      // @ts-expect-error -- a draft is not a DiscoverableAnimal: the deck scores only visible cards
      scoreAnimal(newDraft, NO_FILTERS, freshness, AT, DEFAULT_SCORING_POLICY);
    const published = NON_DRAFT_LISTINGS[0] as NonDraftListing;
    // @ts-expect-error -- a draft's facts are nullable; only `publishReadinessOf`'s facts make it listed
    const skipped: ListedAnimal = { ...newDraft, listing: published };
    const readiness = publishReadinessOf(completeDraft);
    const through: ListedAnimal | null =
      readiness.kind === "ready"
        ? { ...completeDraft, ...readiness.facts, listing: published }
        : null;
    expect(typeof scoreDraft).toBe("function");
    expect(skipped.listing.kind).toBe("published");
    expect(through?.size).toBe("medium");
  });
});
