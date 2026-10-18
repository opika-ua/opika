import { describe, expect, it } from "vitest";
import { apiErrors } from "../errors";
import { AnimalDetailViewSchema, type FeedCardView, FeedCardViewSchema } from "../views/animal";
import { AgeEstimateInputSchema, AnimalPatchSchema, shelterAnimalsContract } from "./procedures";
import { KabinetAnimalRowViewSchema, KabinetAnimalViewSchema } from "./views";

/**
 * K3's contract (F-B1, K-Q5, D3), per docs/k3-draft-shapes.md §5: what a
 * draft is created from, what a save may clear, the age as the form gives it,
 * and the views on each side of the animal union.
 */

type Parser = { safeParse: (value: unknown) => { success: boolean } };
const inputOf = (procedure: unknown): Parser =>
  (procedure as { "~orpc": { inputSchema: Parser } })["~orpc"].inputSchema;

const AT = new Date("2026-10-17T09:00:00.000Z");
const unknownFact = { source: "shelter_declared", state: "unknown", declaredAt: AT } as const;
const draftView = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
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
const published = { kind: "published", publishedAt: AT, confirmedAt: AT, undoable: null };
const facts = {
  size: "small",
  age: { kind: "declared_bucket", bucket: "young", declaredAt: AT },
  description: { uk: "Лагідна.", en: null },
};

describe("shelter.animals.createDraft (K-Q5: name + species)", () => {
  const input = inputOf(shelterAnimalsContract.createDraft);

  it("takes a name and a species", () => {
    expect(input.safeParse({ name: "Ластівка", species: "dog" }).success).toBe(true);
  });

  it("refuses a missing species or a missing name", () => {
    expect(input.safeParse({ name: "Ластівка" }).success).toBe(false);
    expect(input.safeParse({ species: "cat" }).success).toBe(false);
  });

  it("is strict: a sex, size or description sent here is refused, not dropped", () => {
    for (const extra of [
      { sex: "female" },
      { size: "small" },
      { description: facts.description },
    ]) {
      expect(
        input.safeParse({ name: "Ластівка", species: "dog", ...extra }).success,
        JSON.stringify(extra),
      ).toBe(false);
    }
  });
});

describe("the update patch (F-B1, T4)", () => {
  it("may clear the description with null", () => {
    expect(AnimalPatchSchema.safeParse({ description: null }).success).toBe(true);
  });

  it("may not clear the size or the age", () => {
    expect(AnimalPatchSchema.safeParse({ size: null }).success).toBe(false);
    expect(AnimalPatchSchema.safeParse({ age: null }).success).toBe(false);
  });

  it("update declares LISTING_FACT_REQUIRED (422) and AGE_DATE_OUT_OF_RANGE (422)", () => {
    const errors = (shelterAnimalsContract.update as unknown as { "~orpc": { errorMap: object } })[
      "~orpc"
    ].errorMap as Record<string, { status: number } | undefined>;
    expect(errors.LISTING_FACT_REQUIRED?.status).toBe(422);
    expect(errors.AGE_DATE_OUT_OF_RANGE?.status).toBe(422);
    expect(apiErrors.LISTING_FACT_REQUIRED.data.safeParse({ field: "description" }).success).toBe(
      true,
    );
  });
});

describe("AgeEstimateInputSchema (D3: the chosen «Станом на» date is kept)", () => {
  it("takes a birth date or a bucket as of a date, as calendar dates", () => {
    expect(
      AgeEstimateInputSchema.safeParse({ kind: "birth_date", date: "2024-03-01" }).success,
    ).toBe(true);
    expect(
      AgeEstimateInputSchema.safeParse({
        kind: "declared_bucket",
        bucket: "adult",
        asOf: "2026-10-01",
      }).success,
    ).toBe(true);
  });

  it("refuses an instant, an impossible date, a missing «as of» and a client-sent declaredAt", () => {
    for (const value of [
      { kind: "birth_date", date: "2024-03-01T10:00:00Z" },
      { kind: "birth_date", date: "2024-13-01" },
      { kind: "declared_bucket", bucket: "adult" },
      { kind: "declared_bucket", bucket: "adult", asOf: "2026-10-01", declaredAt: AT },
      { kind: "birth_date", date: "2024-03-01", precision: "month" },
    ]) {
      expect(AgeEstimateInputSchema.safeParse(value).success, JSON.stringify(value)).toBe(false);
    }
  });
});

describe("the kabinet animal views are the union (T2)", () => {
  it("accept a draft with null facts", () => {
    expect(KabinetAnimalViewSchema.safeParse(draftView).success).toBe(true);
    const row = {
      ...draftView,
      coverPhoto: null,
      freshness: null,
      publishGaps: [{ kind: "size" }, { kind: "age" }, { kind: "description" }, { kind: "photo" }],
    };
    expect(KabinetAnimalRowViewSchema.safeParse(row).success).toBe(true);
  });

  it("refuse a published animal missing any fact", () => {
    for (const fact of ["size", "age", "description"] as const) {
      const view = { ...draftView, ...facts, listing: published, [fact]: null };
      expect(KabinetAnimalViewSchema.safeParse(view).success, fact).toBe(false);
    }
    expect(
      KabinetAnimalViewSchema.safeParse({ ...draftView, ...facts, listing: published }).success,
    ).toBe(true);
  });
});

/** F-B1 §3, layers 2 and 3: the public views require every fact, so a draft fails closed. */
describe("the public views pick from ListedAnimalSchema", () => {
  const shelter = {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    displayName: "Притулок",
    publicLocation: null,
  };
  const freshness = { kind: "fresh", ageDays: 0 };
  const card = {
    id: draftView.id,
    name: "Ластівка",
    species: "dog",
    sex: "female",
    size: "small",
    publicLocation: null,
    ageBucket: "young",
    freshness,
    primaryPhoto: null,
    shelter,
    listingKind: "published",
  };

  it("a feed card refuses a null size or age bucket", () => {
    expect(FeedCardViewSchema.safeParse({ ...card, size: null }).success).toBe(false);
    expect(FeedCardViewSchema.safeParse({ ...card, ageBucket: null }).success).toBe(false);
  });

  it("the detail view refuses a null size, age bucket or description", () => {
    const shape = AnimalDetailViewSchema.shape;
    expect(shape.size.safeParse(null).success).toBe(false);
    expect(shape.ageBucket.safeParse(null).success).toBe(false);
    expect(shape.description.safeParse(null).success).toBe(false);
  });

  it("a draft's nullable size can't be typed into a card", () => {
    const draftSize = draftView.size as "small" | "medium" | "large" | null;
    // @ts-expect-error -- FeedCardView.size is required: a draft can't become a card
    const sizeOnly: Pick<FeedCardView, "size"> = { size: draftSize };
    expect(sizeOnly.size).toBeNull();
  });
});
