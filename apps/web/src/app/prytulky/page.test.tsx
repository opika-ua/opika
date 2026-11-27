import { animalRepo, cityRepo, shelterRepo } from "@opika/db/repos";
import { makeAnimal, makeCity, makeShelter } from "@opika/db/test";
import {
  type CityId,
  CitySlugSchema,
  type ModeratorId,
  type ShelterVerification,
} from "@opika/domain";
import { ORPCError } from "@orpc/server";
import { render, screen, within } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { anonymousRouterClient } from "../../api/server-client";
import { createTestHarness, type TestHarness } from "../../api/test-harness";
import {
  loadSheltersIndex,
  type SheltersIndexClient,
} from "../../features/shelters/shelters-index-load";
import { renderSheltersIndex } from "./page";

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

const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);
const EVIDENCE = { items: [], submittedAt: daysAgo(30) };
const MOD = "m0000000-0000-4000-8000-000000000001" as ModeratorId;
const PENDING: ShelterVerification = {
  status: "pending",
  submittedAt: daysAgo(3),
  evidence: EVIDENCE,
};
const PAUSED: ShelterVerification = {
  status: "paused",
  verifiedAt: daysAgo(30),
  verifiedBy: MOD,
  pausedAt: daysAgo(2),
  pausedBy: { kind: "moderator", moderatorId: MOD },
  reason: { code: "relocation", note: null },
  evidence: EVIDENCE,
};
/** The fixture shelter's exact address and phone (`makeShelter`): never on this page. */
const STREET = "вул. Тестова 1";
const POSTCODE = "01001";
const PHONE = "+380501234567";

/** Next's `notFound()` throws this digest; the not-found page renders. */
const isNotFound = (error: unknown) =>
  error instanceof Error &&
  "digest" in error &&
  String((error as { digest: unknown }).digest).includes("404");

async function seedCity(slug: string, uk: string) {
  const city = makeCity({
    slug: CitySlugSchema.parse(slug),
    name: { uk, en: { text: slug, provenance: "human" } },
  });
  await cityRepo(h.db).insert(city);
  return city.id;
}

async function seedShelter(
  cityId: CityId,
  displayName: string,
  extra: Parameters<typeof makeShelter>[0] = {},
) {
  const shelter = makeShelter({
    displayName,
    publicLocation: { precision: "city", cityId, district: null },
    ...extra,
  });
  await shelterRepo(h.db).insert(shelter);
  return shelter.id;
}

const load = () => loadSheltersIndex(anonymousRouterClient(h.db));

describe("/prytulky: the shelters the sitemap names, grouped by city", () => {
  it("lists exactly the verified shelters with a listed animal; early-listed, paused and empty ones are absent", async () => {
    const brovary = await seedCity("brovary", "Бровари");
    const irpin = await seedCity("irpin", "Ірпінь");
    const kyiv = await seedCity("kyiv", "Київ");
    const paws = await seedShelter(brovary, "Вигадані лапи");
    const tails = await seedShelter(irpin, "Ініціатива «Хвости»", {
      legalEntity: { kind: "unregistered_initiative", contactPersonName: "Вигадана Особа" },
    });
    const early = await seedShelter(brovary, "Ранній притулок", {
      verification: PENDING,
      earlyListingSince: daysAgo(2),
    });
    const paused = await seedShelter(brovary, "Притулок на паузі", { verification: PAUSED });
    await seedShelter(brovary, "Порожній притулок");
    await animalRepo(h.db).insertMany([
      { animal: makeAnimal({ shelterId: paws }), cityId: brovary },
      { animal: makeAnimal({ shelterId: paws, species: "cat" }), cityId: brovary },
      // Fostered in Kyiv: Irpin, its shelter's city, gets no city page from it.
      { animal: makeAnimal({ shelterId: tails }), cityId: kyiv },
      { animal: makeAnimal({ shelterId: early }), cityId: brovary },
      { animal: makeAnimal({ shelterId: paused }), cityId: brovary },
    ]);

    const result = await load();
    if (result.kind !== "index") throw new Error(`expected the list, got ${result.kind}`);
    render(<div>{renderSheltersIndex(result, false)}</div>);

    expect(screen.getByRole("heading", { level: 1, name: "Притулки й ініціативи" })).toBeTruthy();
    const rows = screen.getAllByTestId("shelter-index-row");
    expect(rows.map((row) => row.getAttribute("href"))).toEqual([
      `/prytulky/${paws}`,
      `/prytulky/${tails}`,
    ]);
    for (const absent of ["Ранній притулок", "Притулок на паузі", "Порожній притулок"]) {
      expect(screen.queryByText(absent)).toBeNull();
    }

    // Each city's heading; only a city with a landing page links to it.
    const brovaryHeading = screen.getByRole("heading", { level: 2, name: "Бровари" });
    expect(within(brovaryHeading).getByRole("link").getAttribute("href")).toBe(
      "/tvaryny/misto/brovary",
    );
    const irpinHeading = screen.getByRole("heading", { level: 2, name: "Ірпінь" });
    expect(within(irpinHeading).queryByRole("link")).toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: "Київ" })).toBeNull();

    // Name, trust line and listed count per row.
    const [pawsRow, tailsRow] = rows;
    const year = new Date().getFullYear();
    expect(within(pawsRow as HTMLElement).getByText("Вигадані лапи")).toBeTruthy();
    expect(
      within(pawsRow as HTMLElement).getByText(`Перевірений вручну · на Opika з ${year} р.`),
    ).toBeTruthy();
    expect(within(pawsRow as HTMLElement).getByText("Шукають дім: 2")).toBeTruthy();
    expect(
      within(tailsRow as HTMLElement).getByText(`Перевірена вручну · на Opika з ${year} р.`),
    ).toBeTruthy();
    expect(within(tailsRow as HTMLElement).getByText("Шукають дім: 1")).toBeTruthy();
  });

  it("renders no address or phone, though the fixture shelter has both", async () => {
    const brovary = await seedCity("brovary", "Бровари");
    const shelter = await seedShelter(brovary, "Вигадані лапи");
    await animalRepo(h.db).insert(makeAnimal({ shelterId: shelter }), brovary);

    const result = await load();
    if (result.kind !== "index") throw new Error(`expected the list, got ${result.kind}`);
    const { container } = render(<div>{renderSheltersIndex(result, false)}</div>);
    const html = container.innerHTML;
    expect(html).toContain("Вигадані лапи");
    for (const leaked of [STREET, POSTCODE, PHONE, "0501234567"]) {
      expect(html, leaked).not.toContain(leaked);
    }
  });

  it("is Next's 404 when no shelter is listed (only an early-listed one has animals)", async () => {
    const brovary = await seedCity("brovary", "Бровари");
    const early = await seedShelter(brovary, "Ранній притулок", {
      verification: PENDING,
      earlyListingSince: daysAgo(2),
    });
    await animalRepo(h.db).insert(makeAnimal({ shelterId: early }), brovary);

    const result = await load();
    expect(result).toEqual({ kind: "not_found" });
    let thrown: unknown = null;
    try {
      renderSheltersIndex(result, false);
    } catch (error) {
      thrown = error;
    }
    expect(isNotFound(thrown)).toBe(true);
  });
});

describe("shelters.listed, the procedure behind the page", () => {
  it("leaves out a verified shelter with no listed animal; the endpoint and the page still answer", async () => {
    const brovary = await seedCity("brovary", "Бровари");
    const listed = await seedShelter(brovary, "Вигадані лапи");
    const empty = await seedShelter(brovary, "Порожній притулок");
    await animalRepo(h.db).insertMany([
      { animal: makeAnimal({ shelterId: listed }), cityId: brovary },
      // Not listed: a draft and an adopted animal give a shelter no place on the list.
      { animal: makeAnimal({ shelterId: empty, listing: { kind: "draft" } }), cityId: brovary },
      {
        animal: makeAnimal({
          shelterId: empty,
          listing: { kind: "adopted", adoptedAt: new Date() },
        }),
        cityId: brovary,
      },
    ]);

    const served = await h.call("shelters.listed", {}, { now: new Date() });
    expect(served.status).toBe(200);
    const body = served.body as { items: { id: string; listedAnimalCount: number }[] };
    expect(body.items.map((item) => [item.id, item.listedAnimalCount])).toEqual([[listed, 1]]);

    const result = await load();
    if (result.kind !== "index") throw new Error(`expected the list, got ${result.kind}`);
    render(<div>{renderSheltersIndex(result, false)}</div>);
    expect(screen.getAllByTestId("shelter-index-row")).toHaveLength(1);
    expect(screen.queryByText("Порожній притулок")).toBeNull();
  });

  it("with only an animal-less verified shelter, the page is a 404, not an error", async () => {
    const brovary = await seedCity("brovary", "Бровари");
    await seedShelter(brovary, "Порожній притулок");
    const served = await h.call("shelters.listed", {}, { now: new Date() });
    expect(served.status).toBe(200);
    expect(served.body).toMatchObject({ items: [], cityLabels: [] });
    expect(await load()).toEqual({ kind: "not_found" });
  });

  it("each item carries exactly the picked fields, and its location is the city only", async () => {
    const brovary = await seedCity("brovary", "Бровари");
    // The default fixture location: an exact address, fuzzed, with a district.
    const shelter = makeShelter({
      displayName: "Вигадані лапи",
      premises: {
        kind: "address",
        address: {
          line1: STREET,
          line2: null,
          postalCode: POSTCODE,
          cityId: brovary,
          district: { uk: "Вигаданий район", en: null },
          coordinates: { lat: 50.45, lng: 30.52 },
        },
      },
    });
    await shelterRepo(h.db).insert(shelter);
    await animalRepo(h.db).insert(makeAnimal({ shelterId: shelter.id }), brovary);

    const served = await h.call("shelters.listed", {}, { now: new Date() });
    const [item] = (served.body as { items: Record<string, unknown>[] }).items;
    expect(Object.keys(item ?? {}).sort()).toEqual([
      "createdAt",
      "displayName",
      "id",
      "listedAnimalCount",
      "logo",
      "organisationWord",
      "publicLocation",
    ]);
    expect(item?.["publicLocation"]).toEqual({ cityId: brovary });
    expect(served.raw).not.toContain("Вигаданий район");
    expect(served.raw).not.toContain(STREET);
  });
});

describe("loadSheltersIndex's refusals", () => {
  const failing = (error: unknown): SheltersIndexClient => ({
    shelters: { listed: vi.fn(async () => Promise.reject(error)) },
    cities: { withPages: vi.fn(async () => []) },
  });

  it("a refusal for rate is its own state, never «not found»", async () => {
    expect(await loadSheltersIndex(failing(new ORPCError("RATE_LIMITED")))).toEqual({
      kind: "rate_limited",
    });
  });

  it("any other failure is thrown to the error boundary", async () => {
    await expect(loadSheltersIndex(failing(new Error("connection terminated")))).rejects.toThrow(
      "connection terminated",
    );
  });
});
