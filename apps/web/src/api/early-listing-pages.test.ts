import { animalRepo, cityRepo, revealRepo, shelterRepo } from "@opika/db/repos";
import { type AnimalFixtureOverrides, makeAnimal, makeCity, makeShelter } from "@opika/db/test";
import { EARLY_LISTING_DAYS, type ShelterVerification } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestHarness, type TestHarness } from "./test-harness";

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

/**
 * Listing before verification: every public surface answers for a running permission with the
 * label, and as for no permission once it has run out. `NOW` is the harness's default clock.
 */
const NOW = new Date("2026-08-01T12:00:00Z");
const DAY = 86_400_000;
const AT = new Date("2026-07-01T00:00:00Z");
const MOD = "00000000-0000-4000-8000-000000000000" as never;
const EVIDENCE = { items: [], submittedAt: AT };

const STATES = {
  pending: { status: "pending", submittedAt: AT, evidence: EVIDENCE },
  under_review: { status: "under_review", startedAt: AT, reviewerId: MOD, evidence: EVIDENCE },
  verified: { status: "verified", verifiedAt: AT, verifiedBy: MOD, evidence: EVIDENCE },
  rejected: {
    status: "rejected",
    rejectedAt: AT,
    rejectedBy: MOD,
    reason: { code: "spam", note: null },
    evidence: EVIDENCE,
  },
} as const satisfies Record<string, ShelterVerification>;

type ShelterFixtureDonation = { url: string; provider: "monobank_jar" } | null;
const LIVE_LINK = { url: "https://send.monobank.ua/jar/live", provider: "monobank_jar" } as const;

/** Inside the period, one millisecond short of expiry, and exactly at it. */
const RUNNING = new Date(NOW.getTime() - 10 * DAY);
const LAST_MS = new Date(NOW.getTime() - EARLY_LISTING_DAYS * DAY + 1);
const AT_EXPIRY = new Date(NOW.getTime() - EARLY_LISTING_DAYS * DAY);

async function seed(
  state: keyof typeof STATES,
  since: Date | null,
  animalOverrides?: AnimalFixtureOverrides,
  donation: ShelterFixtureDonation = null,
) {
  const city = makeCity();
  await cityRepo(h.db).insert(city);
  const shelter = makeShelter({
    verification: STATES[state],
    earlyListingSince: since,
    donation,
    exactAddress: {
      line1: "вул. Тестова 1",
      line2: null,
      postalCode: "01001",
      cityId: city.id,
      district: null,
      coordinates: { lat: 50.45, lng: 30.52 },
    },
  });
  await shelterRepo(h.db).insert(shelter);
  const animal = makeAnimal({ shelterId: shelter.id, ...animalOverrides });
  await animalRepo(h.db).insert(animal, city.id);
  return { shelter, animal };
}

async function bootstrap(): Promise<{ cookie: string; adopterId: never }> {
  const res = await h.call("session.bootstrap", {});
  const cookie = h.extractSessionCookie(res.headers);
  if (!cookie) throw new Error("no session cookie");
  const again = await h.call("session.bootstrap", {}, { cookie });
  const adopter = (again.body as Record<string, unknown>).adopter as Record<string, unknown>;
  return { cookie, adopterId: adopter.id as never };
}

const code = (res: { body: unknown }) => (res.body as Record<string, unknown>).code;
const field = (res: { body: unknown }, name: string) => (res.body as Record<string, unknown>)[name];

describe("shelters.byId", () => {
  it.each(["pending", "under_review"] as const)(
    "answers for a running permission in %s: open, labelled, no dates",
    async (state) => {
      const { shelter } = await seed(state, RUNNING);
      const res = await h.call("shelters.byId", { shelterId: shelter.id });
      expect(res.status).toBe(200);
      expect(field(res, "verification")).toBe("listed_before_verification");
      expect(field(res, "availability")).toEqual({ kind: "open" });
      expect(res.raw).not.toContain(RUNNING.toISOString());
      expect(res.raw).not.toContain("earlyListingSince");
    },
  );

  it("answers up to the last millisecond and is a plain NOT_FOUND from the expiry instant", async () => {
    const last = await seed("pending", LAST_MS);
    expect((await h.call("shelters.byId", { shelterId: last.shelter.id })).status).toBe(200);
    const gone = await seed("pending", AT_EXPIRY);
    const res = await h.call("shelters.byId", { shelterId: gone.shelter.id });
    expect([res.status, code(res)]).toEqual([404, "NOT_FOUND"]);
    // Read-time: the very same row answers again on an earlier clock, nothing was written.
    const earlier = await h.call(
      "shelters.byId",
      { shelterId: gone.shelter.id },
      { now: new Date(NOW.getTime() - 1) },
    );
    expect(earlier.status).toBe(200);
  });

  it("ignores a stored permission outside pending and under_review", async () => {
    const verified = await seed("verified", RUNNING);
    const ok = await h.call("shelters.byId", { shelterId: verified.shelter.id });
    expect(field(ok, "verification")).toBe("verified");
    const rejected = await seed("rejected", RUNNING);
    const refused = await h.call("shelters.byId", { shelterId: rejected.shelter.id });
    expect([refused.status, code(refused)]).toEqual([404, "NOT_FOUND"]);
  });

  /** An approved link is the shelter's own; the page of an unverified shelter must not send money anywhere. */
  it.each(["pending", "under_review"] as const)(
    "shows no donation link for a shelter listed early in %s, though one is stored",
    async (state) => {
      const { shelter } = await seed(state, RUNNING, undefined, LIVE_LINK);
      const res = await h.call("shelters.byId", { shelterId: shelter.id });
      expect(res.status).toBe(200);
      expect(field(res, "donation")).toBeNull();
      expect(res.raw).not.toContain("monobank");
    },
  );

  it("shows the stored link once the shelter is verified", async () => {
    const { shelter } = await seed("verified", null, undefined, LIVE_LINK);
    const res = await h.call("shelters.byId", { shelterId: shelter.id });
    expect(field(res, "donation")).toEqual(LIVE_LINK);
  });

  it("a pending shelter with no permission is still NOT_FOUND", async () => {
    const { shelter } = await seed("pending", null);
    expect((await h.call("shelters.byId", { shelterId: shelter.id })).status).toBe(404);
  });
});

describe("animals.byId, animals.cardsByIds and the gallery", () => {
  it("the animal page carries the label; the card list has it too", async () => {
    const { animal } = await seed("under_review", RUNNING);
    const page = await h.call("animals.byId", { animalId: animal.id });
    expect(page.status).toBe(200);
    expect((field(page, "shelter") as { verification: string }).verification).toBe(
      "listed_before_verification",
    );
    expect(page.raw).not.toContain(RUNNING.toISOString());

    const list = await h.call("gallery.list", {
      filters: {
        regions: { kind: "any" },
        cities: { kind: "any" },
        species: { kind: "any" },
        sexes: { kind: "any" },
        sizes: { kind: "any" },
        ages: { kind: "any" },
      },
      sort: "freshest",
      page: 1,
      pageSize: 24,
      scope: { kind: "everyone" },
    });
    const items = (list.body as { items: { id: string; shelter: { verification: string } }[] })
      .items;
    expect(items.map((i) => i.id)).toEqual([animal.id]);
    expect(items[0]?.shelter.verification).toBe("listed_before_verification");

    const cards = await h.call("animals.cardsByIds", { animalIds: [animal.id] });
    const first = (cards.body as { items: { kind: string; card?: { shelter: unknown } }[] })
      .items[0];
    expect(first?.kind).toBe("available");
  });

  it("after expiry the page is NOT_FOUND, the gallery is empty and the saved card is name-only", async () => {
    const { animal } = await seed("pending", AT_EXPIRY);
    const page = await h.call("animals.byId", { animalId: animal.id });
    expect([page.status, code(page)]).toEqual([404, "NOT_FOUND"]);
    const list = await h.call("gallery.list", {
      filters: {
        regions: { kind: "any" },
        cities: { kind: "any" },
        species: { kind: "any" },
        sexes: { kind: "any" },
        sizes: { kind: "any" },
        ages: { kind: "any" },
      },
      sort: "freshest",
      page: 1,
      pageSize: 24,
      scope: { kind: "everyone" },
    });
    expect((list.body as { items: unknown[] }).items).toEqual([]);
    const cards = await h.call("animals.cardsByIds", { animalIds: [animal.id] });
    expect((cards.body as { items: unknown[] }).items).toEqual([
      { kind: "unavailable", animalId: animal.id, name: animal.name },
    ]);
  });
});

describe("animals.reveal and reveals.listMine", () => {
  it("reveals the contact of a listed shelter and says so; the repeat and the list agree", async () => {
    const { cookie, adopterId } = await bootstrap();
    const { animal } = await seed("under_review", RUNNING);
    const res = await h.call("animals.reveal", { animalId: animal.id }, { cookie });
    expect(res.status).toBe(200);
    expect(field(res, "shelterListing")).toBe("listed_before_verification");
    expect((field(res, "shelterContact") as { source: string }).source).toBe("current");
    expect(res.raw).not.toContain(RUNNING.toISOString());
    // The stored record keeps the truthful raw status; the adopter never receives it.
    const stored = await revealRepo(h.db).findByAdopterAndAnimal(adopterId, animal.id);
    expect(stored?.shelterSnapshot.verificationStatusAtReveal).toBe("under_review");
    const atFirstReveal = field(res, "shelterAtFirstReveal") as Record<string, unknown>;
    expect(atFirstReveal.verificationStatusAtReveal).toBe("listed_before_verification");
    expect(res.raw).not.toContain("under_review");
    expect(res.raw).not.toContain('"pending"');

    const list = await h.call("reveals.listMine", { cursor: null, limit: 20 }, { cookie });
    const item = (list.body as { items: Record<string, unknown>[] }).items[0];
    expect(item?.shelterListing).toBe("listed_before_verification");
    expect(
      (item?.shelterAtFirstReveal as Record<string, unknown> | undefined)
        ?.verificationStatusAtReveal,
    ).toBe("listed_before_verification");
    expect(JSON.stringify(list.body)).not.toContain("under_review");
  });

  it("is SHELTER_NOT_VISIBLE once the period is over, and the list falls back to the first reveal", async () => {
    const { cookie } = await bootstrap();
    const { animal } = await seed("pending", new Date(NOW.getTime() - 59 * DAY));
    expect((await h.call("animals.reveal", { animalId: animal.id }, { cookie })).status).toBe(200);

    const later = new Date(NOW.getTime() + 2 * DAY);
    const again = await h.call("animals.reveal", { animalId: animal.id }, { cookie, now: later });
    expect([again.status, code(again)]).toEqual([404, "SHELTER_NOT_VISIBLE"]);

    const list = await h.call(
      "reveals.listMine",
      { cursor: null, limit: 20 },
      { cookie, now: later },
    );
    const item = (list.body as { items: Record<string, unknown>[] }).items[0];
    expect(item?.shelterContact).toMatchObject({ source: "first_reveal" });
    expect(item?.shelterListing).toBeNull();
  });

  it("a shelter with no permission still refuses", async () => {
    const { cookie } = await bootstrap();
    const { animal } = await seed("under_review", null);
    const res = await h.call("animals.reveal", { animalId: animal.id }, { cookie });
    expect([res.status, code(res)]).toEqual([404, "SHELTER_NOT_VISIBLE"]);
  });

  it("a verified shelter reveals with the verified label, no notice", async () => {
    const { cookie } = await bootstrap();
    const { animal } = await seed("verified", null);
    const res = await h.call("animals.reveal", { animalId: animal.id }, { cookie });
    expect(field(res, "shelterListing")).toBe("verified");
  });
});

describe("toView: the first-reveal status is a public label for every stored status", () => {
  it("never passes a raw status through", async () => {
    const { toView } = await import("./handlers/reveal");
    const { VERIFICATION_STATUSES } = await import("@opika/domain");
    const { makeReveal } = await import("@opika/db/test");
    for (const status of VERIFICATION_STATUSES) {
      const base = makeReveal();
      const reveal = {
        ...base,
        shelterSnapshot: { ...base.shelterSnapshot, verificationStatusAtReveal: status },
      };
      const view = toView(
        reveal,
        { source: "first_reveal", displayName: "x", contact: reveal.shelterSnapshot.contact },
        null,
      );
      expect(["verified", "listed_before_verification"], status).toContain(
        view.shelterAtFirstReveal.verificationStatusAtReveal,
      );
    }
  });
});
