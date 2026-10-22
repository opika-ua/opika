import type { KabinetAnimalView } from "@opika/contracts";
import { type ListingKind, VERIFICATION_STATUSES } from "@opika/domain";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { describe, expect, it } from "vitest";
import type { kabinetAnimalListBrowserClient } from "../../../api/kabinet-browser-client";
import {
  type AnimalRow,
  actionFailureOf,
  captionOf,
  dayOf,
  metaLineOf,
  rowActionsOf,
  rowAfterMove,
  staleLineOf,
  statusLineOf,
  visibilityNoticeOf,
  withdrawalReasonOf,
} from "./list-model";

/**
 * K2's pure rules. Every Ukrainian string is transcribed from his K2 file
 * (`k2-copy-uk.md`, 2026-10-18) or his K3/K4/R-UI files, never read from
 * `uk.ts`, so a drift in the catalogue fails here too.
 */

const NOW = new Date("2026-10-18T09:00:00.000Z");
const DAY = 86_400_000;
const ID = "a1000000-0000-4000-8000-000000000001" as AnimalRow["id"];

const counts = (draft: number, published = 0, reserved = 0, adopted = 0, withdrawn = 0) => ({
  draft,
  published,
  reserved,
  adopted,
  withdrawn,
});

const row = (overrides: Partial<AnimalRow> = {}): AnimalRow =>
  ({
    id: ID,
    name: "Рекс",
    species: "dog",
    sex: "male",
    size: "medium",
    age: { kind: "declared_bucket", bucket: "young", declaredAt: new Date("2026-09-01T00:00:00Z") },
    listing: { kind: "published", publishedAt: NOW, confirmedAt: NOW, undoable: null },
    lastUpdatedAt: NOW,
    coverPhoto: null,
    freshness: { kind: "fresh", confirmedAt: NOW, ageDays: 0 },
    publishGaps: [{ kind: "photo" }],
    ...overrides,
  }) as AnimalRow;

describe("the header caption counts cards in three forms (his answer 6)", () => {
  it.each([
    [1, "Притулок «Домівка» · 1 картка"],
    [2, "Притулок «Домівка» · 2 картки"],
    [5, "Притулок «Домівка» · 5 карток"],
    [11, "Притулок «Домівка» · 11 карток"],
    [21, "Притулок «Домівка» · 21 картка"],
    [22, "Притулок «Домівка» · 22 картки"],
    [0, "Притулок «Домівка» · 0 карток"],
  ])("%i", (total, caption) => {
    expect(captionOf("Притулок «Домівка»", counts(total))).toBe(caption);
  });

  it("counts every state, adopted and withdrawn included", () => {
    expect(captionOf("Х", counts(1, 2, 3, 4, 5))).toBe("Х · 15 карток");
  });
});

describe("the stale strip's sentence", () => {
  it.each([
    [1, "1 картку ви не підтверджували понад 30 днів."],
    [3, "3 картки ви не підтверджували понад 30 днів."],
    [5, "5 карток ви не підтверджували понад 30 днів."],
    [21, "21 картку ви не підтверджували понад 30 днів."],
  ])("%i", (count, line) => {
    expect(staleLineOf(count)).toBe(line);
  });
});

describe("the meta line: species · sex · size · age (his answer 6)", () => {
  it("K3's segment labels and the card's age word", () => {
    expect(metaLineOf(row(), NOW)).toBe("Собака · Хлопчик · Середній · молодий");
    expect(metaLineOf(row({ species: "cat", sex: "female", size: "small" }), NOW)).toBe(
      "Кіт · Дівчинка · Малий · молода",
    );
  });

  it("an unknown sex reads «Не записано»; a draft's missing size and age are left out, not answered", () => {
    expect(
      metaLineOf(
        row({
          sex: "unknown",
          size: null,
          age: null,
          listing: { kind: "draft" },
        } as Partial<AnimalRow>),
        NOW,
      ),
    ).toBe("Собака · Не записано");
  });

  it("the age word is the bucket the age is in today, not when it was entered", () => {
    const declared = {
      kind: "declared_bucket",
      bucket: "baby",
      declaredAt: new Date("2025-01-01"),
    };
    expect(metaLineOf(row({ age: declared } as Partial<AnimalRow>), NOW)).toBe(
      "Собака · Хлопчик · Середній · молодий",
    );
  });
});

describe("dates on Kyiv's calendar", () => {
  it("this year's day without the year, another year's with it", () => {
    expect(dayOf(new Date("2026-09-12T10:00:00Z"), NOW)).toBe("12 вересня");
    expect(dayOf(new Date("2025-09-12T10:00:00Z"), NOW)).toBe("12 вересня 2025 р.");
  });

  it("Kyiv's day, not UTC's: 23:30 UTC on 1 October is 2 October in Kyiv", () => {
    expect(dayOf(new Date("2026-10-01T23:30:00Z"), NOW)).toBe("2 жовтня");
  });
});

describe("the row's status line", () => {
  it("a draft: his F-B2 sentence, true of every draft (his answer 9)", () => {
    expect(statusLineOf(row({ listing: { kind: "draft" } } as Partial<AnimalRow>), NOW)).toBe(
      "Ті, хто шукає тварину, цю чернетку не бачать.",
    );
  });

  it("published and reserved: the public «Оновлено …», counted from the confirmation", () => {
    const confirmedAt = new Date(NOW.getTime() - 40 * DAY);
    const freshness = { kind: "stale", confirmedAt, ageDays: 40 } as const;
    expect(statusLineOf(row({ freshness }), NOW)).toBe("Оновлено 40 днів тому");
    expect(
      statusLineOf(
        row({
          freshness,
          listing: { kind: "reserved", since: NOW, publishedAt: NOW, confirmedAt, undoable: null },
        } as Partial<AnimalRow>),
        NOW,
      ),
    ).toBe("Оновлено 40 днів тому");
  });

  it("adopted: «Удома з …»", () => {
    const listing = { kind: "adopted", adoptedAt: new Date("2026-09-12T10:00:00Z") } as const;
    expect(statusLineOf(row({ listing, freshness: null } as Partial<AnimalRow>), NOW)).toBe(
      "Удома з 12 вересня",
    );
  });

  it("withdrawn: the date, the reason's label, and the shelter's note in «…» when there is one", () => {
    const withdrawnAt = new Date("2026-10-02T10:00:00Z");
    const withdrawn = (note: string | null) =>
      row({
        listing: { kind: "withdrawn", withdrawnAt, reason: { code: "transferred", note } },
        freshness: null,
      } as Partial<AnimalRow>);
    expect(statusLineOf(withdrawn(null), NOW)).toBe(
      "Знято з показу 2 жовтня · переведено до іншого притулку",
    );
    expect(statusLineOf(withdrawn("до Києва"), NOW)).toBe(
      "Знято з показу 2 жовтня · переведено до іншого притулку · «до Києва»",
    );
  });

  it("a row that already carries adopted_elsewhere keeps its label (his answer 10)", () => {
    expect(withdrawalReasonOf({ code: "adopted_elsewhere", note: null })).toBe(
      "дім знайдено іншим шляхом",
    );
  });
});

describe("which actions a row offers (sheet §4, his answers 7 and 8)", () => {
  /** Written out state by state, not derived. */
  const EXPECTED: Record<ListingKind, { forward: string | null; menu: string[] }> = {
    draft: { forward: "publish", menu: ["edit", "deleteDraft"] },
    published: { forward: "reserve", menu: ["edit", "adopt", "withdraw"] },
    reserved: { forward: "adopt", menu: ["edit", "release", "withdraw"] },
    adopted: { forward: null, menu: ["edit"] },
    withdrawn: { forward: "restore", menu: ["edit"] },
  };

  it.each(Object.entries(EXPECTED))("%s", (kind, expected) => {
    expect(rowActionsOf(kind as ListingKind)).toEqual(expected);
  });
});

describe("the row after a move (commitment #7: the date moves only on a confirmation)", () => {
  const confirmedAt = new Date(NOW.getTime() - 40 * DAY);
  const published = row({
    listing: { kind: "published", publishedAt: confirmedAt, confirmedAt, undoable: null },
    freshness: { kind: "stale", confirmedAt, ageDays: 40 },
  });
  const view = (listing: KabinetAnimalView["listing"]) =>
    ({
      id: ID,
      name: "Рекс",
      species: "dog",
      sex: "male",
      size: "medium",
      age: published.age,
      description: { uk: "Опис", en: null },
      photos: [],
      listing,
      lastUpdatedAt: NOW,
    }) as unknown as KabinetAnimalView;

  it("a reserve keeps the confirmation, so the row keeps its old date", () => {
    const after = rowAfterMove(
      published,
      view({ kind: "reserved", since: NOW, publishedAt: confirmedAt, confirmedAt, undoable: null }),
      NOW,
    );
    expect(after.listing.kind).toBe("reserved");
    expect(statusLineOf(after, NOW)).toBe("Оновлено 40 днів тому");
  });

  it("a confirmation moves it to today", () => {
    const after = rowAfterMove(
      published,
      view({
        kind: "published",
        publishedAt: confirmedAt,
        confirmedAt: NOW,
        undoable: { previousConfirmedAt: confirmedAt, confirmedAt: NOW },
      }),
      NOW,
    );
    expect(statusLineOf(after, NOW)).toBe("Оновлено сьогодні");
  });

  it("a closed state carries no date, and the publish gaps don't change", () => {
    const after = rowAfterMove(published, view({ kind: "adopted", adoptedAt: NOW }), NOW);
    expect(after.freshness).toBeNull();
    expect(after.publishGaps).toEqual([{ kind: "photo" }]);
  });
});

describe("why a call didn't go through", () => {
  const coded = (code: string, data?: unknown) => Object.assign(new Error(code), { code, data });

  it.each([
    ["ILLEGAL_TRANSITION", { kind: "illegal_transition" }],
    ["NOT_FOUND", { kind: "not_found" }],
    ["FORBIDDEN", { kind: "not_found" }],
    ["UNDO_EXPIRED", { kind: "undo_expired" }],
    ["WAS_PUBLISHED", { kind: "was_published" }],
    ["TOO_MANY_REQUESTS", { kind: "rate_limited" }],
    ["INTERNAL_SERVER_ERROR", { kind: "failed" }],
  ])("%s", (code, failure) => {
    expect(actionFailureOf(coded(code))).toEqual(failure);
  });

  it("no code at all is no answer, which the screen re-reads before reporting", () => {
    expect(actionFailureOf(new TypeError("Failed to fetch"))).toEqual({ kind: "no_answer" });
  });

  it("the publish gaps are read through the contract's schema; anything else there is a plain failure", () => {
    expect(
      actionFailureOf(coded("PUBLISH_REQUIREMENTS_UNMET", { gaps: [{ kind: "photo" }] })),
    ).toEqual({ kind: "publish_unmet", gaps: [{ kind: "photo" }] });
    expect(actionFailureOf(coded("PUBLISH_REQUIREMENTS_UNMET", { gaps: [] }))).toEqual({
      kind: "failed",
    });
  });

  /** Commitment #2: one answer for both causes; whatever data came with it is not read. */
  it("WAS_PUBLISHED is the same answer whatever data came with it", () => {
    expect(actionFailureOf(coded("WAS_PUBLISHED", { reason: "has_activity" }))).toEqual({
      kind: "was_published",
    });
  });

  /**
   * The route's limiter answers a plain HTTP 429 with a text body, not an
   * oRPC error. Through the real oRPC link that arrives as TOO_MANY_REQUESTS,
   * which is what makes «Забагато дій…» reachable at all.
   */
  it("a plain HTTP 429 through the real oRPC link is rate_limited", async () => {
    const client = createORPCClient<typeof kabinetAnimalListBrowserClient>(
      new RPCLink({
        url: "http://localhost/api/kabinet",
        fetch: async () => new Response("Too Many Requests", { status: 429 }),
      }),
    );
    const thrown = await client.shelter.animals.confirm({ animalId: ID }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(actionFailureOf(thrown)).toEqual({ kind: "rate_limited" });
  });
});

describe("why nobody sees the cards (his answer 5)", () => {
  const SINCE = new Date("2026-10-10T09:00:00Z");
  /** Each status's line, transcribed from his K2, K4 and R-UI files. */
  const EXPECTED = {
    verified: { kind: "none" },
    paused: {
      kind: "paused",
      line: "Прийом на паузі з 10 жовтня 2026 р. · Переїзд",
    },
    pending: {
      kind: "line",
      text: "Опубліковані картки зʼявляться в галереї, щойно притулок пройде перевірку.",
    },
    under_review: {
      kind: "line",
      text: "Опубліковані картки зʼявляться в галереї, щойно притулок пройде перевірку.",
    },
    rejected: {
      kind: "line",
      text: "Тварин притулку не буде в галереї, доки перевірку не пройдено.",
    },
    suspended: { kind: "line", text: "Поки притулок призупинено, його тварин немає в галереї." },
  } as const;

  const verificationIn = (status: (typeof VERIFICATION_STATUSES)[number]) => {
    switch (status) {
      case "paused":
        return { status, since: SINCE, reason: { code: "relocation", note: "ремонт" } } as const;
      case "rejected":
        return {
          status,
          at: SINCE,
          reason: { code: "insufficient_evidence", note: null },
        } as const;
      case "suspended":
        return { status, at: SINCE, reason: { code: "unresponsive", note: null } } as const;
      default:
        return { status, since: SINCE } as const;
    }
  };

  it("names every status", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...VERIFICATION_STATUSES].sort());
  });

  it.each(VERIFICATION_STATUSES)("%s", (status) => {
    expect(visibilityNoticeOf(verificationIn(status) as never)).toEqual(EXPECTED[status]);
  });
});
