import { ORPCError } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";
import { loadAnimalPage } from "./animal-page-load";
import { ANIMAL_ID, makeDetailAnimal, stubAnimalPageClient } from "./test-fixtures";

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
    expect(load.view.backToGalleryHref).toBe("/tvaryny");
  });
});
