import { ORPCError } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";
import { loadAnimalPage, SAME_SHELTER_ANIMALS_MAX } from "./animal-page-load";
import {
  ANIMAL_ID,
  CITY_LABEL,
  makeDetailAnimal,
  makeHomeFoundView,
  makeSiblingCard,
  SHELTER_ID,
  stubAnimalPageClient,
} from "./test-fixtures";

/**
 * The one loader behind the animal page and the gallery's overlay
 * (designer round 1, §2). RL-F1 is the reason its refusals are told apart:
 * the page used to catch every `animals.byId` failure as "not found".
 */
describe("loadAnimalPage", () => {
  it("gives the page everything it shows, the city resolved and the way back to that city", async () => {
    const { client } = stubAnimalPageClient();
    const load = await loadAnimalPage(ANIMAL_ID, client);
    if (load.kind !== "animal") throw new Error(`expected the animal, got ${load.kind}`);
    expect(load.view.animal.name).toBe("Мурчик");
    expect(load.view.shelter.displayName).toBe("Тестовий притулок «Домівка»");
    expect(load.view.cityName).toBe("Бровари");
    expect(load.view.backToGalleryHref).toContain("brovary");
  });

  it("the way back is the city's landing page when the city has one (SEO B3), «?misto=» otherwise", async () => {
    const { client } = stubAnimalPageClient();
    const without = await loadAnimalPage(ANIMAL_ID, client);
    if (without.kind !== "animal") throw new Error(`expected the animal, got ${without.kind}`);
    expect(without.view.backToGalleryHref).toBe("/?misto=brovary");
    expect(without.view.cityPagePath).toBeNull();

    vi.mocked(client.cities.withPages).mockResolvedValueOnce([
      { cityId: CITY_LABEL.id, species: ["cat"] },
    ]);
    const withPage = await loadAnimalPage(ANIMAL_ID, client);
    if (withPage.kind !== "animal") throw new Error(`expected the animal, got ${withPage.kind}`);
    expect(withPage.view.backToGalleryHref).toBe("/tvaryny/misto/brovary");
    expect(withPage.view.cityPagePath).toBe("/tvaryny/misto/brovary");
    expect(vi.mocked(client.cities.withPages)).toHaveBeenLastCalledWith({ ids: [CITY_LABEL.id] });
  });

  it("a refusal for rate is its own state, not «not found» (RL-F1)", async () => {
    const { client } = stubAnimalPageClient({ kind: "refuse", code: "RATE_LIMITED" });
    expect(await loadAnimalPage(ANIMAL_ID, client)).toEqual({ kind: "rate_limited" });
  });

  it("NOT_FOUND is still not found", async () => {
    const { client } = stubAnimalPageClient({ kind: "refuse", code: "NOT_FOUND" });
    expect(await loadAnimalPage(ANIMAL_ID, client)).toEqual({ kind: "not_found" });
  });

  it("any other failure is thrown, never turned into «not found»", async () => {
    const { client } = stubAnimalPageClient({ kind: "fail" });
    await expect(loadAnimalPage(ANIMAL_ID, client)).rejects.toThrow("connection terminated");
  });

  it("an oRPC error with another code is thrown too", async () => {
    const { client } = stubAnimalPageClient();
    vi.mocked(client.shelters.byId).mockRejectedValueOnce(new ORPCError("INTERNAL_SERVER_ERROR"));
    await expect(loadAnimalPage(ANIMAL_ID, client)).rejects.toBeInstanceOf(ORPCError);
  });

  it("the shelter refused as NOT_FOUND between the two calls is the card gone", async () => {
    const { client } = stubAnimalPageClient();
    vi.mocked(client.shelters.byId).mockRejectedValueOnce(new ORPCError("NOT_FOUND"));
    expect(await loadAnimalPage(ANIMAL_ID, client)).toEqual({ kind: "not_found" });
  });

  it("a not-found shelter wins even when the city read beside it fails", async () => {
    const { client } = stubAnimalPageClient();
    vi.mocked(client.shelters.byId).mockRejectedValueOnce(new ORPCError("NOT_FOUND"));
    vi.mocked(client.cities.byIds).mockRejectedValueOnce(new Error("connection terminated"));
    expect(await loadAnimalPage(ANIMAL_ID, client)).toEqual({ kind: "not_found" });
  });

  it("a home-found answer is that state, with no shelter or city read", async () => {
    const { client } = stubAnimalPageClient({ kind: "home_found" });
    expect(await loadAnimalPage(ANIMAL_ID, client)).toEqual({
      kind: "home_found",
      view: makeHomeFoundView(),
    });
    expect(client.shelters.byId).not.toHaveBeenCalled();
    expect(client.cities.byIds).not.toHaveBeenCalled();
  });

  it("a malformed id is not found, without asking the server", async () => {
    const { client, animalsById } = stubAnimalPageClient();
    expect(await loadAnimalPage("gortaty", client)).toEqual({ kind: "not_found" });
    expect(animalsById).not.toHaveBeenCalled();
  });

  it("a fostered animal's city is the foster city", async () => {
    const { client } = stubAnimalPageClient({
      kind: "answer",
      animal: makeDetailAnimal({ publicLocation: { cityId: "unknown-city" as never } }),
    });
    const load = await loadAnimalPage(ANIMAL_ID, client);
    if (load.kind !== "animal") throw new Error(`expected the animal, got ${load.kind}`);
    expect(load.view.cityName).toBeNull();
    expect(load.view.backToGalleryHref).toBe("/");
    expect(load.view.cityPagePath).toBeNull();
  });
});

/** The block of the same shelter's other animals: one more read, scoped to the shelter, indexable pages only. */
describe("loadAnimalPage: the same shelter's other animals", () => {
  async function sameShelterOf(client: Parameters<typeof loadAnimalPage>[1]) {
    const load = await loadAnimalPage(ANIMAL_ID, client);
    if (load.kind !== "animal") throw new Error(`expected the animal, got ${load.kind}`);
    return load.view.sameShelter;
  }

  it("lists the shelter's other animals, read through the shelter-scoped gallery list", async () => {
    const { client, galleryList } = stubAnimalPageClient({ kind: "answer" }, [
      makeSiblingCard(1),
      makeSiblingCard(2),
    ]);
    const block = await sameShelterOf(client);
    expect(block?.cards.map((card) => card.name)).toEqual(["Сусід 1", "Сусід 2"]);
    expect(block?.cityNames.get(CITY_LABEL.id)).toBe("Бровари");
    expect(galleryList).toHaveBeenCalledTimes(1);
    expect(galleryList).toHaveBeenCalledWith(
      expect.objectContaining({ scope: { kind: "shelter", shelterId: SHELTER_ID } }),
    );
  });

  it("has no block when the shelter has no other animal", async () => {
    const { client } = stubAnimalPageClient();
    expect(await sameShelterOf(client)).toBeNull();
  });

  it("never lists the open animal itself, and keeps the cap when it is in the list", async () => {
    const own = makeSiblingCard(9, { id: ANIMAL_ID as never, name: "Мурчик" });
    const { client } = stubAnimalPageClient({ kind: "answer" }, [
      makeSiblingCard(1),
      own,
      makeSiblingCard(2),
      makeSiblingCard(3),
      makeSiblingCard(4),
    ]);
    const block = await sameShelterOf(client);
    expect(block?.cards.map((card) => card.id)).not.toContain(ANIMAL_ID);
    expect(block?.cards).toHaveLength(SAME_SHELTER_ANIMALS_MAX);
  });

  it("shows at most four, and asks for just enough to fill them", async () => {
    const many = [1, 2, 3, 4, 5, 6].map((index) => makeSiblingCard(index));
    const { client, galleryList } = stubAnimalPageClient({ kind: "answer" }, many);
    const block = await sameShelterOf(client);
    expect(block?.cards).toHaveLength(4);
    expect(galleryList).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 5 }));
  });

  it("reads nothing for a page that is not indexable (an early-listed shelter, a paused animal)", async () => {
    const early = makeDetailAnimal();
    const earlyShelter = { ...early.shelter, verification: "listed_before_verification" as const };
    const cases = [
      makeDetailAnimal({ shelter: earlyShelter }),
      makeDetailAnimal({ availability: { kind: "paused" } }),
    ];
    for (const animal of cases) {
      const { client, galleryList } = stubAnimalPageClient({ kind: "answer", animal }, [
        makeSiblingCard(1),
      ]);
      expect(await sameShelterOf(client)).toBeNull();
      expect(galleryList).not.toHaveBeenCalled();
    }
  });

  it("a failed list read hides the block and leaves the page whole", async () => {
    const { client, galleryList } = stubAnimalPageClient({ kind: "answer" }, [makeSiblingCard(1)]);
    galleryList.mockRejectedValueOnce(new Error("connection terminated"));
    expect(await sameShelterOf(client)).toBeNull();
  });

  it("a not-found shelter still wins over the list read beside it", async () => {
    const { client, galleryList } = stubAnimalPageClient({ kind: "answer" }, [makeSiblingCard(1)]);
    vi.mocked(client.shelters.byId).mockRejectedValueOnce(new ORPCError("NOT_FOUND"));
    galleryList.mockRejectedValueOnce(new Error("connection terminated"));
    expect(await loadAnimalPage(ANIMAL_ID, client)).toEqual({ kind: "not_found" });
  });
});
