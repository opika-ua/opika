import { randomUUID } from "node:crypto";
import { animalRepo, cityRepo, shelterRepo } from "@opika/db/repos";
import { makeAnimal, makeCity, makeShelter } from "@opika/db/test";
import type { ShelterVerification } from "@opika/domain";
import { render, screen } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anonymousRouterClient } from "../../../api/server-client";
import { createTestHarness, type TestHarness } from "../../../api/test-harness";
import { loadShelterPage } from "../../../features/shelters/shelter-page-load";
import { SHELTER_ID, stubShelterPageClient } from "../../../features/shelters/test-fixtures";
import { renderShelterPage } from "./page";

/**
 * `/prytulky/{id}` (designer round 1, S6): its three outcomes through the
 * route's own `renderShelterPage`, and its data through the real router
 * against a test database, so the 404 and the shelter-only list are what the
 * handlers and the repository actually answer, not what a stub says.
 */
const HIS_SENTENCE = "Забагато запитів. Спробуйте ще раз пізніше.";
const FIRST_PAGE = { sort: "freshest", page: 1 } as const;

/** Next's `notFound()` throws this digest; the route's `not-found.tsx` renders. */
const isNotFound = (error: unknown) =>
  error instanceof Error &&
  "digest" in error &&
  String((error as { digest: unknown }).digest).includes("404");

describe("the route's outcomes, with shelters.byId stubbed", () => {
  it("RATE_LIMITED shows his sentence, never the not-found page (RL-F1)", async () => {
    const { client } = stubShelterPageClient({ kind: "refuse", code: "RATE_LIMITED" });
    const load = await loadShelterPage(SHELTER_ID, FIRST_PAGE, client);
    expect(load.kind).toBe("rate_limited");
    render(<div>{renderShelterPage(load, false)}</div>);
    expect(screen.getByRole("heading", { level: 1, name: HIS_SENTENCE })).toBeTruthy();
    expect(screen.queryByText(/НЕ ЗНАЙДЕНО/)).toBeNull();
  });

  it("NOT_FOUND is Next's 404, and no list is read for it", async () => {
    const { client, galleryList } = stubShelterPageClient({ kind: "refuse", code: "NOT_FOUND" });
    const load = await loadShelterPage(SHELTER_ID, FIRST_PAGE, client);
    expect(load).toEqual({ kind: "not_found" });
    expect(galleryList).not.toHaveBeenCalled();
    let thrown: unknown = null;
    try {
      renderShelterPage(load, false);
    } catch (error) {
      thrown = error;
    }
    expect(isNotFound(thrown)).toBe(true);
  });

  it("a malformed id is the same 404, asked of nobody", async () => {
    const { client, sheltersById } = stubShelterPageClient();
    expect(await loadShelterPage("42", FIRST_PAGE, client)).toEqual({ kind: "not_found" });
    expect(sheltersById).not.toHaveBeenCalled();
  });

  it("a database failure is thrown to the error boundary, never called «not found»", async () => {
    const { client } = stubShelterPageClient({ kind: "fail" });
    await expect(loadShelterPage(SHELTER_ID, FIRST_PAGE, client)).rejects.toThrow(
      "connection terminated",
    );
  });

  it("reads its list through gallery.list scoped to this shelter, in the requested sort and page", async () => {
    const { client, galleryList } = stubShelterPageClient();
    await loadShelterPage(SHELTER_ID, { sort: "longest_waiting", page: 2 }, client);
    expect(galleryList).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { kind: "shelter", shelterId: SHELTER_ID },
        sort: "longest_waiting",
        page: 2,
      }),
    );
  });
});

describe("the shelter page's data, through the real router", () => {
  let h: TestHarness;

  beforeAll(async () => {
    h = await createTestHarness();
  });
  afterAll(async () => {
    await h.cleanup();
  });
  beforeEach(async () => {
    await h.truncate();
  });

  const NOW = new Date();
  const MODERATOR = randomUUID() as never;
  const EVIDENCE = { items: [], submittedAt: NOW };
  const verified = { verifiedAt: NOW, verifiedBy: MODERATOR };
  const notListed: Record<string, ShelterVerification> = {
    pending: { status: "pending", submittedAt: NOW, evidence: EVIDENCE },
    paused: {
      status: "paused",
      ...verified,
      pausedAt: NOW,
      pausedBy: { kind: "moderator", moderatorId: MODERATOR },
      reason: { code: "relocation", note: null },
      evidence: EVIDENCE,
    },
    suspended: {
      status: "suspended",
      suspendedAt: NOW,
      suspendedBy: MODERATOR,
      reason: { code: "unresponsive", note: null },
      priorState: { status: "verified", ...verified },
      evidence: EVIDENCE,
    },
  };

  async function seedShelter(animals: number, verification?: ShelterVerification) {
    const city = makeCity();
    await cityRepo(h.db).insert(city);
    const shelter = makeShelter({
      publicLocation: {
        precision: "fuzzed_address",
        cityId: city.id,
        district: null,
        approximate: { center: { lat: 50.45, lng: 30.52 }, precisionMetres: 1000 } as never,
      },
      ...(verification ? { verification } : {}),
    });
    await shelterRepo(h.db).insert(shelter);
    const ids: string[] = [];
    for (let i = 0; i < animals; i++) {
      // Animal 0 is the most recently confirmed and the most recently
      // published, so the two date sorts give opposite orders.
      const confirmedAt = new Date(NOW.getTime() - (i + 1) * 86_400_000);
      const publishedAt = new Date(NOW.getTime() - (i + 1) * 3 * 86_400_000);
      const animal = makeAnimal({
        shelterId: shelter.id,
        listing: { kind: "published", publishedAt, confirmedAt, undoable: null },
      });
      await animalRepo(h.db).insert(animal, city.id);
      ids.push(animal.id);
    }
    return { shelter, ids };
  }

  const load = (shelterId: string, query: { sort: "freshest" | "longest_waiting"; page: number }) =>
    loadShelterPage(shelterId, query, anonymousRouterClient(h.db));

  it("lists this shelter's animals and no other shelter's", async () => {
    const mine = await seedShelter(3);
    await seedShelter(2);
    const result = await load(mine.shelter.id, FIRST_PAGE);
    if (result.kind !== "shelter") throw new Error(result.kind);
    expect(result.view.shelter.displayName).toBe(mine.shelter.displayName);
    expect(result.view.animals.items.map((a) => a.id).sort()).toEqual([...mine.ids].sort());
    expect(result.view.animals.totalMatching).toBe(3);
  });

  it("both date sorts, each its own order", async () => {
    const mine = await seedShelter(3);
    const freshest = await load(mine.shelter.id, { sort: "freshest", page: 1 });
    const longest = await load(mine.shelter.id, { sort: "longest_waiting", page: 1 });
    if (freshest.kind !== "shelter" || longest.kind !== "shelter") throw new Error("not a page");
    expect(freshest.view.animals.items.map((a) => a.id)).toEqual(mine.ids);
    expect(longest.view.animals.items.map((a) => a.id)).toEqual([...mine.ids].reverse());
  });

  it("a second page holds the rest of this shelter's animals, and only them", async () => {
    const mine = await seedShelter(26);
    await seedShelter(3);
    const page2 = await load(mine.shelter.id, { sort: "freshest", page: 2 });
    if (page2.kind !== "shelter") throw new Error(page2.kind);
    expect(page2.view.animals.page).toBe(2);
    expect(page2.view.animals.totalPages).toBe(2);
    expect(page2.view.animals.items.map((a) => a.id)).toEqual(mine.ids.slice(24));
  });

  it("an empty shelter is a page with no animals, not a 404", async () => {
    const empty = await seedShelter(0);
    const result = await load(empty.shelter.id, FIRST_PAGE);
    if (result.kind !== "shelter") throw new Error(result.kind);
    expect(result.view.animals.totalMatching).toBe(0);
  });

  it.each(Object.keys(notListed))("a %s shelter is a 404, its animals unread", async (status) => {
    const hidden = await seedShelter(2, notListed[status]);
    expect(await load(hidden.shelter.id, FIRST_PAGE)).toEqual({ kind: "not_found" });
  });

  it("an unknown id is a 404", async () => {
    await seedShelter(1);
    expect(await load(randomUUID(), FIRST_PAGE)).toEqual({ kind: "not_found" });
  });
});
