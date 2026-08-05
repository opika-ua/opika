import { describe, expect, it } from "vitest";
import { contract } from "./contract.js";
import { FeedListInputSchema } from "./procedures/feed.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./procedures/pagination.js";

const procedurePaths = (node: object, prefix = ""): readonly string[] =>
  Object.entries(node).flatMap(([key, value]) => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    // A contract procedure is a builder instance, not a plain namespace object.
    return value !== null && Object.getPrototypeOf(value) === Object.prototype
      ? procedurePaths(value as object, path)
      : [path];
  });

describe("the contract surface", () => {
  it("exposes exactly the eight agreed procedures", () => {
    expect([...procedurePaths(contract)].sort()).toEqual([
      "animals.byId",
      "animals.reveal",
      "cities.list",
      "feed.list",
      "reveals.listMine",
      "session.bootstrap",
      "shelters.byId",
      "swipes.record",
    ]);
  });

  it("keeps reveal separate from swipe recording", () => {
    // Fusing them would make a best-effort analytics write transactional and a
    // ledger write droppable.
    expect(contract.animals.reveal).not.toBe(contract.swipes.record);
  });
});

describe("feed pagination input", () => {
  it("defaults the page size so a client need not choose one", () => {
    const parsed = FeedListInputSchema.parse({
      filters: {
        cities: { kind: "any" },
        species: { kind: "any" },
        sizes: { kind: "any" },
        ages: { kind: "any" },
      },
      cursor: null,
    });

    expect(parsed.limit).toBe(DEFAULT_PAGE_SIZE);
  });

  it("refuses a page size above the cap", () => {
    const result = FeedListInputSchema.safeParse({
      filters: {
        cities: { kind: "any" },
        species: { kind: "any" },
        sizes: { kind: "any" },
        ages: { kind: "any" },
      },
      cursor: null,
      limit: MAX_PAGE_SIZE + 1,
    });

    expect(result.success).toBe(false);
  });

  it("refuses an empty cursor, which is a bug rather than a first page", () => {
    const result = FeedListInputSchema.safeParse({
      filters: {
        cities: { kind: "any" },
        species: { kind: "any" },
        sizes: { kind: "any" },
        ages: { kind: "any" },
      },
      cursor: "",
    });

    expect(result.success).toBe(false);
  });
});
