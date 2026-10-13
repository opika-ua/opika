import type { RegistryShelterView } from "@opika/contracts";
import { animalRepo, cityRepo, kabinetShelterRepo, shelterRepo } from "@opika/db/repos";
import {
  animals,
  authInvitation,
  authMember,
  authSession,
  authUser,
  supportSessions,
} from "@opika/db/schema";
import { makeAnimal, makeCity, makeShelter, setupTestDatabase, truncateAll } from "@opika/db/test";
import {
  donationProviderOf,
  type ModeratorId,
  publicLocationOf,
  type Shelter,
  type ShelterAdminId,
  type ShelterVerification,
  testOnlyLocationPolicy,
} from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { fromRpcBody, toRpcBody } from "../api/test-harness";
import type { KabinetPrincipal } from "./actor";
import { donationDecisionPlan } from "./handlers/registry-writes";
import { handleKabinetRpc } from "./rpc-route";

/**
 * The operator's registry (`registry.*`, `session.exitSupport`) through the
 * served router: what each procedure does, what it records, and what it
 * refuses. The access matrix over every registry procedure is in
 * src/api/kabinet-cross-tenant.test.ts's registry block.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const NOW = new Date("2026-10-13T10:00:00.000Z");
/** A UUID, as Better Auth generates (`ModeratorId` is a UUID). */
const OPERATOR = "0ec0ec0e-0000-4000-8000-000000000001";
const asOperator: KabinetPrincipal = { kind: "super_admin", moderatorId: OPERATOR as ModeratorId };
const policy = testOnlyLocationPolicy("registry-test");
let cityId: string;
let otherCityId: string;

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  const other = makeCity();
  await cityRepo(db).insert(city);
  await cityRepo(db).insert(other);
  cityId = city.id;
  otherCityId = other.id;
  await db.insert(authUser).values({
    id: OPERATOR,
    name: "Оператор",
    email: "op@example.org",
    emailVerified: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
});

const limiters = {
  perUser: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
  perIp: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
};

type Result<T> = { status: number; body: T; setCookies: string[] };

async function call<T = Record<string, unknown>>(
  path: string,
  input: unknown,
  opts: {
    principal?: KabinetPrincipal;
    now?: Date;
    cookie?: string;
    locationPolicy?: typeof policy | null;
  } = {},
): Promise<Result<T>> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.cookie !== undefined) headers.cookie = opts.cookie;
  const request = new Request(`http://localhost/api/kabinet/${path.replaceAll(".", "/")}`, {
    method: "POST",
    headers,
    body: JSON.stringify(toRpcBody(input)),
  });
  const response = await handleKabinetRpc(request, {
    availability: {
      kind: "available",
      sender: { send: async () => {} },
      secret: "x",
      baseURL: "http://localhost",
    },
    resolve: async () => ({
      principal: opts.principal ?? asOperator,
      userId: OPERATOR,
      db,
      cursorSecret: "test-cursor-secret",
    }),
    limiters,
    ip: "203.0.113.1",
    now: opts.now ?? NOW,
    newId: () => crypto.randomUUID(),
    operatorDisplayName: "Олексій",
    locationPolicy: opts.locationPolicy === undefined ? policy : opts.locationPolicy,
    production: false,
  });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = fromRpcBody(JSON.parse(text));
    } catch {
      body = text;
    }
  }
  return { status: response.status, body: body as T, setCookies: response.headers.getSetCookie() };
}

const evidence = { items: [], submittedAt: NOW };
const STATES = {
  pending: { status: "pending", submittedAt: NOW, evidence },
  under_review: {
    status: "under_review",
    startedAt: NOW,
    reviewerId: OPERATOR as ModeratorId,
    evidence,
  },
  verified: { status: "verified", verifiedAt: NOW, verifiedBy: OPERATOR as ModeratorId, evidence },
} as const satisfies Record<string, ShelterVerification>;

async function shelter(overrides: Partial<Shelter> = {}): Promise<Shelter> {
  const s = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId } as never,
    ...overrides,
  });
  await shelterRepo(db).insert(s);
  return s;
}

const history = (shelterId: string) => kabinetShelterRepo(db).historyOf(shelterId as never);
const reload = async (id: string) => {
  const s = await shelterRepo(db).findById(id as never);
  if (s === null) throw new Error("missing");
  return s;
};

const createInput = () => {
  const base = makeShelter();
  return {
    displayName: "Лапа допомоги",
    description: base.description,
    legalEntity: base.legalEntity,
    exactAddress: { ...base.exactAddress, cityId },
    contact: base.contact,
    freshnessSentence: null,
    evidence: [
      { kind: "edrpou_registration", edrpou: "12345678", registeredName: "ГО Лапа" },
      { kind: "bank_account_holder", holderName: "ГО Лапа" },
      {
        kind: "reference_contact",
        name: "Ветклініка",
        channel: { kind: "phone", e164: "+380501112233" },
        relationship: "veterinary_clinic",
      },
      { kind: "site_visit", visitedOn: "2026-10-12", notes: "Був на місці" },
    ],
    firstAdmin: { name: "Олена", email: "Olena@Example.org" },
  };
};

// ─── 503 without the location key (RG-Q10) ─────────────────────────────────

describe("without LOCATION_HMAC_SECRET", () => {
  it("answers 503 to every registry call, and leaves the shelter surface alone", async () => {
    const s = await shelter();
    // Every one of the eighteen, by path: the route refuses before the input is read.
    const paths = [
      "registry.shelters.list",
      "registry.shelters.byId",
      "registry.shelters.create",
      "registry.shelters.updateVerifiedData",
      "registry.shelters.updateProfile",
      "registry.verification.startReview",
      "registry.verification.approve",
      "registry.verification.reinstate",
      "registry.verification.reject",
      "registry.verification.suspend",
      "registry.verification.resubmit",
      "registry.donation.approve",
      "registry.donation.reject",
      "registry.admins.invite",
      "registry.admins.resendInvite",
      "registry.admins.remove",
      "registry.history.list",
      "registry.support.enter",
    ];
    const statuses: Record<string, number> = {};
    for (const path of paths) {
      statuses[path] = (await call(path, { shelterId: s.id }, { locationPolicy: null })).status;
    }
    expect(statuses).toEqual(Object.fromEntries(paths.map((path) => [path, 503])));
    expect(await history(s.id)).toEqual([]);
    const asAdmin: KabinetPrincipal = {
      kind: "shelter_admin",
      shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
      shelterId: s.id,
    };
    expect(
      (await call("shelter.profile.get", {}, { locationPolicy: null, principal: asAdmin })).status,
    ).toBe(200);
  });
});

// ─── reads ──────────────────────────────────────────────────────────────────

describe("registry.shelters.list / byId / history.list", () => {
  it("lists awaiting shelters first, pages with a signed cursor, and counts statuses", async () => {
    await shelter({ displayName: "Б", verification: STATES.verified });
    await shelter({ displayName: "В", verification: STATES.pending });
    await shelter({ displayName: "А", verification: STATES.verified });
    const first = await call<{
      items: { displayName: string }[];
      nextCursor: string;
      counts: Record<string, number>;
    }>("registry.shelters.list", { search: null, status: null, cursor: null, limit: 2 });
    expect(first.status).toBe(200);
    expect(first.body.items.map((row) => row.displayName)).toEqual(["В", "А"]);
    expect(first.body.counts).toMatchObject({ pending: 1, verified: 2 });
    const second = await call<{ items: { displayName: string }[]; nextCursor: string | null }>(
      "registry.shelters.list",
      { search: null, status: null, cursor: first.body.nextCursor, limit: 2 },
    );
    expect(second.body.items.map((row) => row.displayName)).toEqual(["Б"]);
    expect(second.body.nextCursor).toBeNull();
    // A cursor is bound to its filters.
    const replayed = await call("registry.shelters.list", {
      search: null,
      status: "verified",
      cursor: first.body.nextCursor,
      limit: 2,
    });
    expect(replayed.status).toBe(400);
  });

  it("returns the full record with admins, and NOT_FOUND for an unknown id", async () => {
    const s = await shelter();
    const view = await call<RegistryShelterView>("registry.shelters.byId", { shelterId: s.id });
    expect(view.status).toBe(200);
    expect(view.body).toMatchObject({ id: s.id, exactAddress: s.exactAddress, admins: [] });
    const missing = await call("registry.shelters.byId", { shelterId: crypto.randomUUID() });
    expect(missing.status).toBe(404);
  });

  it("returns the operator's full history, newest first, and NOT_FOUND for an unknown shelter", async () => {
    const s = await shelter({ verification: STATES.pending });
    await call(
      "registry.verification.startReview",
      { shelterId: s.id },
      { now: new Date(NOW.getTime() + 1000) },
    );
    const page = await call<{ items: { kind: string; event?: { type: string } }[] }>(
      "registry.history.list",
      { shelterId: s.id, cursor: null, limit: 10 },
    );
    expect(page.body.items).toEqual([
      expect.objectContaining({
        kind: "verification",
        event: expect.objectContaining({ type: "start_review" }),
      }),
    ]);
    expect(
      (
        await call("registry.history.list", {
          shelterId: crypto.randomUUID(),
          cursor: null,
          limit: 10,
        })
      ).status,
    ).toBe(404);
  });
});

// ─── create ─────────────────────────────────────────────────────────────────

describe("registry.shelters.create (S2)", () => {
  it("creates a pending shelter with its evidence, the keyed pin, an invited admin, and two history lines", async () => {
    const input = createInput();
    const created = await call<RegistryShelterView>("registry.shelters.create", input);
    expect(created.status).toBe(200);
    const s = await reload(created.body.id);
    expect(s.verification.status).toBe("pending");
    expect(s.publicLocation).toEqual(publicLocationOf(s.id, input.exactAddress as never, policy));
    // The site visit is the operator's, never typed (KABINET S2).
    expect(s.verification.evidence.items).toContainEqual(
      expect.objectContaining({ kind: "site_visit", visitedBy: OPERATOR }),
    );
    expect(created.body.admins).toEqual([
      expect.objectContaining({
        email: "olena@example.org",
        invite: expect.objectContaining({ status: "pending" }),
      }),
    ]);
    expect((await history(s.id)).map((entry) => entry.kind).sort()).toEqual([
      "admin_invited",
      "shelter_created",
    ]);
  });

  it("refuses any document key (RG-Q5) and a future site visit, creating nothing", async () => {
    const withDocument = createInput();
    withDocument.evidence[0] = {
      ...withDocument.evidence[0],
      documentKey: "evidence/x.pdf",
    } as never;
    const refused = await call<{ data: unknown }>("registry.shelters.create", withDocument);
    expect(refused.status).toBe(422);
    expect(refused.body.data).toEqual({ reason: "document_not_supported_yet" });
    const future = createInput();
    future.evidence[3] = { kind: "site_visit", visitedOn: "2026-10-14", notes: "Ще ні" } as never;
    expect((await call<{ data: unknown }>("registry.shelters.create", future)).body.data).toEqual({
      reason: "site_visit_in_future",
    });
    expect(
      (
        await call<{ items: unknown[] }>("registry.shelters.list", {
          search: null,
          status: null,
          cursor: null,
          limit: 10,
        })
      ).body.items,
    ).toEqual([]);
  });

  it("refuses a first admin who already administers a shelter, before creating anything", async () => {
    const first = await call<RegistryShelterView>("registry.shelters.create", createInput());
    const [invitation] = await db.select().from(authInvitation);
    const [user] = await db
      .select()
      .from(authUser)
      .then((rows) => rows.filter((row) => row.email === "olena@example.org"));
    await db.insert(authMember).values({
      id: "m1",
      organizationId: invitation?.organizationId ?? "",
      userId: user?.id ?? "",
      role: "admin",
      createdAt: NOW,
    });
    const second = await call("registry.shelters.create", createInput());
    expect(second.status).toBe(409);
    const all = await call<{ items: { id: string }[] }>("registry.shelters.list", {
      search: null,
      status: null,
      cursor: null,
      limit: 10,
    });
    expect(all.body.items.map((row) => row.id)).toEqual([first.body.id]);
  });

  it("answers an unknown city as a bad request, not a crash", async () => {
    const input = createInput();
    input.exactAddress = { ...input.exactAddress, cityId: crypto.randomUUID() };
    expect((await call("registry.shelters.create", input)).status).toBe(400);
  });
});

// ─── verified data and profile ──────────────────────────────────────────────

describe("registry.shelters.updateVerifiedData / updateProfile (S4)", () => {
  it("moves the address with a recomputed pin and the shelter's animals, recording it", async () => {
    const s = await shelter();
    const animal = makeAnimal({ shelterId: s.id });
    await animalRepo(db).insert(animal, cityId as never);
    const next = {
      ...s.exactAddress,
      cityId: otherCityId,
      coordinates: { lat: 49.84, lng: 24.03 },
    };
    const result = await call<RegistryShelterView>("registry.shelters.updateVerifiedData", {
      shelterId: s.id,
      expectedVersion: 0,
      change: { field: "exact_address", next },
    });
    expect(result.status).toBe(200);
    expect(result.body.publicLocation).toEqual(publicLocationOf(s.id, next as never, policy));
    expect(result.body.version).toBe(1);
    // The animal at the shelter is now discoverable in the new city.
    const cards = await db.select().from(animals);
    expect(cards.find((row) => row.id === animal.id)?.cityId).toBe(otherCityId);
    expect(await history(s.id)).toEqual([
      expect.objectContaining({
        kind: "verified_data_changed",
        moderatorId: OPERATOR,
        change: expect.objectContaining({ field: "exact_address", next }),
      }),
    ]);
  });

  it("answers an address in an unknown city as a bad request, changing nothing", async () => {
    const s = await shelter();
    const result = await call("registry.shelters.updateVerifiedData", {
      shelterId: s.id,
      expectedVersion: 0,
      change: { field: "exact_address", next: { ...s.exactAddress, cityId: crypto.randomUUID() } },
    });
    expect(result.status).toBe(400);
    expect((await reload(s.id)).exactAddress).toEqual(s.exactAddress);
  });

  it("refuses a stale version with CONFLICT and changes nothing", async () => {
    const s = await shelter();
    const result = await call("registry.shelters.updateVerifiedData", {
      shelterId: s.id,
      expectedVersion: 5,
      change: { field: "legal_entity", next: { ...s.legalEntity, legalName: "Інша" } },
    });
    expect(result.status).toBe(409);
    expect((await reload(s.id)).legalEntity).toEqual(s.legalEntity);
    expect(await history(s.id)).toEqual([]);
  });

  it("records one line per changed profile field with the operator as actor, and nothing for an unchanged one", async () => {
    const s = await shelter();
    const contact = { primary: { kind: "telegram", handle: "lapa_help" }, additional: [] };
    const result = await call<RegistryShelterView>("registry.shelters.updateProfile", {
      shelterId: s.id,
      expectedVersion: 0,
      contact,
      description: s.description,
      freshnessSentence: { uk: "Оновлюємо щотижня", en: null },
    });
    expect(result.status).toBe(200);
    const kinds = (await history(s.id)).map((entry) => entry.kind).sort();
    expect(kinds).toEqual(["contact_changed", "freshness_sentence_changed"]);
    for (const entry of await history(s.id)) {
      expect(entry).toMatchObject({ actor: { kind: "moderator", moderatorId: OPERATOR } });
    }
  });

  /** RG-Q8: the operator's writes reach the shelter's own history, actor shown by display name. */
  it("shows the operator's edit in the shelter's own history under the operator's name", async () => {
    const s = await shelter();
    await call("registry.shelters.updateProfile", {
      shelterId: s.id,
      expectedVersion: 0,
      description: { uk: "Новий опис", en: null },
    });
    const asAdmin: KabinetPrincipal = {
      kind: "shelter_admin",
      shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
      shelterId: s.id,
    };
    const seen = await call<{ items: { actor: unknown; kind: string }[] }>(
      "shelter.history.list",
      { cursor: null, limit: 10 },
      { principal: asAdmin },
    );
    expect(seen.body.items).toEqual([
      expect.objectContaining({
        kind: "description_changed",
        actor: { kind: "operator", displayName: "Олексій" },
      }),
    ]);
  });
});

// ─── verification ───────────────────────────────────────────────────────────

describe("registry.verification.*", () => {
  it("runs pending → under_review → verified when the evidence meets the policy", async () => {
    const created = await call<RegistryShelterView>("registry.shelters.create", createInput());
    const id = created.body.id;
    expect((await call("registry.verification.startReview", { shelterId: id })).status).toBe(200);
    const approved = await call<RegistryShelterView>("registry.verification.approve", {
      shelterId: id,
    });
    expect(approved.status).toBe(200);
    expect(approved.body.verification).toMatchObject({ status: "verified", verifiedBy: OPERATOR });
  });

  it("refuses approval with the evidence gaps as data", async () => {
    const s = await shelter({ verification: STATES.under_review });
    const refused = await call<{ data: { gaps: unknown[] } }>("registry.verification.approve", {
      shelterId: s.id,
    });
    expect(refused.status).toBe(422);
    expect(refused.body.data.gaps).toEqual([
      { kind: "edrpou_registration", minimum: 1, provided: 0 },
      { kind: "bank_account_holder", minimum: 1, provided: 0 },
      { kind: "reference_contact", minimum: 1, provided: 0 },
    ]);
    expect((await reload(s.id)).verification.status).toBe("under_review");
  });

  it("answers an illegal move with ILLEGAL_TRANSITION and records nothing", async () => {
    const s = await shelter({ verification: STATES.verified });
    const refused = await call<{ data: unknown }>("registry.verification.startReview", {
      shelterId: s.id,
    });
    expect(refused.status).toBe(409);
    expect(refused.body.data).toEqual({
      machine: "verification",
      from: "verified",
      event: "start_review",
    });
    expect(await history(s.id)).toEqual([]);
  });

  it("suspends with the reason and reinstates to the interrupted state", async () => {
    const s = await shelter({ verification: STATES.verified });
    const suspended = await call<RegistryShelterView>("registry.verification.suspend", {
      shelterId: s.id,
      reason: { code: "complaint_upheld", note: "Перевіряю скаргу" },
    });
    expect(suspended.status).toBe(200);
    expect(suspended.body.verification).toMatchObject({
      status: "suspended",
      priorState: { status: "verified" },
    });
    const reinstated = await call<RegistryShelterView>("registry.verification.reinstate", {
      shelterId: s.id,
    });
    expect(reinstated.body.verification.status).toBe("verified");
  });

  it("rejects with a required note, and resubmits amended evidence back to pending", async () => {
    const s = await shelter({ verification: STATES.under_review });
    expect(
      (
        await call("registry.verification.reject", {
          shelterId: s.id,
          reason: { code: "spam", note: "  " },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("registry.verification.reject", {
          shelterId: s.id,
          reason: { code: "spam", note: "Немає документів" },
        })
      ).status,
    ).toBe(200);
    const resubmitted = await call<RegistryShelterView>("registry.verification.resubmit", {
      shelterId: s.id,
      evidence: createInput().evidence,
    });
    expect(resubmitted.status).toBe(200);
    expect(resubmitted.body.verification.status).toBe("pending");
    const withDocument = await call<{ data: unknown }>("registry.verification.resubmit", {
      shelterId: s.id,
      evidence: [{ kind: "supporting_document", labelUk: "Статут", documentKey: "x.pdf" }],
    });
    expect(withDocument.body.data).toEqual({ reason: "document_not_supported_yet" });
  });
});

// ─── donation ───────────────────────────────────────────────────────────────

describe("registry.donation.approve / reject (N20)", () => {
  const url = "https://send.monobank.ua/jar/abc";
  const pending = () => ({
    link: { url, provider: donationProviderOf(url) },
    proposedAt: NOW,
    proposedBy: "admin-1" as ShelterAdminId,
  });

  it("approves the proposal into the live link and records it", async () => {
    const s = await shelter({ pendingDonation: pending() });
    const approved = await call<RegistryShelterView>("registry.donation.approve", {
      shelterId: s.id,
    });
    expect(approved.body.donation).toEqual(pending().link);
    expect(approved.body.pendingDonation).toBeNull();
    expect(await history(s.id)).toEqual([
      expect.objectContaining({
        kind: "donation_decided",
        decision: "approved",
        previousLive: null,
      }),
    ]);
  });

  it("rejects the proposal, leaving the live link as it was", async () => {
    const s = await shelter({ pendingDonation: pending() });
    const rejected = await call<RegistryShelterView>("registry.donation.reject", {
      shelterId: s.id,
    });
    expect(rejected.body.donation).toBeNull();
    expect(rejected.body.pendingDonation).toBeNull();
    expect(await history(s.id)).toEqual([expect.objectContaining({ decision: "rejected" })]);
  });

  /**
   * Between its own retries the plan never switches links: a proposal that
   * lands after the handler's first read is not decided by a retry. (What
   * the operator saw before tapping is not known to the handler; RG-Q12.)
   */
  it("never switches to a link proposed after the handler's first read", async () => {
    const s = await shelter({ pendingDonation: pending() });
    const other = "https://send.monobank.ua/jar/zzz";
    const plan = donationDecisionPlan(OPERATOR as ModeratorId, "approved", NOW);
    expect(plan(s).entries).toHaveLength(1);
    const reproposed = {
      ...s,
      pendingDonation: { ...pending(), link: { url: other, provider: donationProviderOf(other) } },
    };
    expect(plan(reproposed)).toEqual({ changes: [], entries: [] });
    // The same link on a retry is still the operator's decision.
    expect(plan(s).entries).toHaveLength(1);
  });

  it("decides nothing when nothing is pending", async () => {
    const s = await shelter();
    expect((await call("registry.donation.approve", { shelterId: s.id })).status).toBe(200);
    expect(await history(s.id)).toEqual([]);
  });
});

// ─── admins ─────────────────────────────────────────────────────────────────

describe("registry.admins.*", () => {
  async function acceptedAdmin(shelterId: string, email: string) {
    const invited = await call<{ id: string }>("registry.admins.invite", {
      shelterId,
      name: "Олена",
      email,
    });
    const [invitation] = await db
      .select()
      .from(authInvitation)
      .then((rows) => rows.filter((row) => row.email === email));
    await db.insert(authMember).values({
      id: crypto.randomUUID(),
      organizationId: invitation?.organizationId ?? "",
      userId: invited.body.id,
      role: "admin",
      createdAt: NOW,
    });
    return invited.body.id;
  }

  it("invites a pending admin and refuses an address that administers a shelter", async () => {
    const s = await shelter();
    const invited = await call<{ email: string; invite: { status: string } }>(
      "registry.admins.invite",
      {
        shelterId: s.id,
        name: "Олена",
        email: "olena@example.org",
      },
    );
    expect(invited.status).toBe(200);
    expect(invited.body).toMatchObject({
      email: "olena@example.org",
      invite: { status: "pending" },
    });
    await acceptedAdmin(s.id, "member@example.org");
    const other = await shelter();
    expect(
      (
        await call("registry.admins.invite", {
          shelterId: other.id,
          name: "М",
          email: "member@example.org",
        })
      ).status,
    ).toBe(409);
  });

  it("resends a pending invitation for the full window, and NOT_FOUND for a member", async () => {
    const s = await shelter();
    const invited = await call<{ id: string }>("registry.admins.invite", {
      shelterId: s.id,
      name: "Олена",
      email: "olena@example.org",
    });
    const later = new Date(NOW.getTime() + 60 * 60 * 1000);
    const resent = await call(
      "registry.admins.resendInvite",
      { shelterId: s.id, adminId: invited.body.id },
      { now: later },
    );
    expect(resent.status).toBe(200);
    const [invitation] = await db.select().from(authInvitation);
    expect(invitation?.expiresAt).toEqual(new Date(later.getTime() + 72 * 60 * 60 * 1000));
    expect(await history(s.id)).toContainEqual(
      expect.objectContaining({
        kind: "admin_invitation_resent",
        email: "olena@example.org",
        at: later,
      }),
    );
    const member = await acceptedAdmin(s.id, "member@example.org");
    expect(
      (await call("registry.admins.resendInvite", { shelterId: s.id, adminId: member })).status,
    ).toBe(404);
  });

  /** RG-Q6: sessions end at once; the last admin may go; it is recorded. */
  it("removes the last admin, ending every session of theirs, and records it", async () => {
    const s = await shelter();
    const member = await acceptedAdmin(s.id, "member@example.org");
    const session = (id: string, userId: string) => ({
      id,
      token: `token-${id}`,
      userId,
      expiresAt: new Date(NOW.getTime() + 86_400_000),
      createdAt: NOW,
      updatedAt: NOW,
    });
    // Two sessions of the removed admin, and one of someone else, which must survive.
    await db
      .insert(authSession)
      .values([session("sess-1", member), session("sess-2", member), session("sess-op", OPERATOR)]);
    const removed = await call("registry.admins.remove", { shelterId: s.id, adminId: member });
    expect(removed.status).toBe(200);
    expect((await db.select().from(authSession)).map((row) => row.id)).toEqual(["sess-op"]);
    expect(await db.select().from(authMember)).toEqual([]);
    expect(
      await db
        .select()
        .from(authSession)
        .then((rows) => rows.filter((row) => row.userId === member)),
    ).toEqual([]);
    expect(await history(s.id)).toContainEqual(
      expect.objectContaining({
        kind: "admin_removed",
        email: "member@example.org",
        wasPending: false,
      }),
    );
  });

  it("withdraws a pending admin, and the clean-up deletes the user the invitation created", async () => {
    const s = await shelter();
    const invited = await call<{ id: string }>("registry.admins.invite", {
      shelterId: s.id,
      name: "Олена",
      email: "olena@example.org",
    });
    const removed = await call("registry.admins.remove", {
      shelterId: s.id,
      adminId: invited.body.id,
    });
    expect(removed.status).toBe(200);
    expect(await history(s.id)).toContainEqual(
      expect.objectContaining({ kind: "admin_removed", wasPending: true }),
    );
    expect(
      await db
        .select()
        .from(authUser)
        .then((rows) => rows.filter((row) => row.email === "olena@example.org")),
    ).toEqual([]);
  });

  it("answers NOT_FOUND for an admin of another shelter", async () => {
    const mine = await shelter();
    const theirs = await shelter();
    await call("registry.admins.invite", { shelterId: mine.id, name: "М", email: "m@example.org" });
    const invited = await call<{ id: string }>("registry.admins.invite", {
      shelterId: theirs.id,
      name: "Т",
      email: "t@example.org",
    });
    expect(
      (await call("registry.admins.remove", { shelterId: mine.id, adminId: invited.body.id }))
        .status,
    ).toBe(404);
  });
});

// ─── support mode (RG-Q4, S5) ───────────────────────────────────────────────

describe("registry.support.enter / session.exitSupport", () => {
  it("starts a view with a hashed token and an HttpOnly cookie, replacing any open one", async () => {
    const a = await shelter();
    const b = await shelter();
    const first = await call("registry.support.enter", { shelterId: a.id });
    expect(first.status).toBe(200);
    expect(first.setCookies).toEqual([
      expect.stringMatching(/^kabinet\.support=[0-9a-f]{64}; HttpOnly; SameSite=Lax; Path=\/$/),
    ]);
    const token = first.setCookies[0]?.split(";")[0]?.split("=")[1] ?? "";
    await call("registry.support.enter", { shelterId: b.id });
    const rows = await db.select().from(supportSessions);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.shelterId === a.id)).toMatchObject({ endReason: "replaced" });
    expect(rows.find((row) => row.shelterId === b.id)).toMatchObject({ endedAt: null });
    expect(rows.every((row) => row.tokenHash !== token)).toBe(true);
  });

  it("answers NOT_FOUND for an unknown shelter, starting nothing", async () => {
    expect((await call("registry.support.enter", { shelterId: crypto.randomUUID() })).status).toBe(
      404,
    );
    expect(await db.select().from(supportSessions)).toEqual([]);
  });

  it("ends the view and clears the cookie on exit", async () => {
    const a = await shelter();
    const entered = await call("registry.support.enter", { shelterId: a.id });
    const cookie = entered.setCookies[0]?.split(";")[0] ?? "";
    const asSupport: KabinetPrincipal = {
      kind: "support_view",
      moderatorId: OPERATOR as ModeratorId,
      shelterId: a.id,
    };
    const exited = await call("session.exitSupport", {}, { principal: asSupport, cookie });
    expect(exited.status).toBe(200);
    expect(exited.setCookies).toEqual([
      "kabinet.support=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
    ]);
    expect((await db.select().from(supportSessions))[0]).toMatchObject({ endReason: "exited" });
  });

  it("refuses every write from a support view, and the registry too, until exit", async () => {
    const a = await shelter();
    const asSupport: KabinetPrincipal = {
      kind: "support_view",
      moderatorId: OPERATOR as ModeratorId,
      shelterId: a.id,
    };
    expect((await call("shelter.profile.get", {}, { principal: asSupport })).status).toBe(200);
    expect(
      (
        await call(
          "shelter.profile.updateContact",
          { contact: a.contact, expectedVersion: 0 },
          { principal: asSupport },
        )
      ).status,
    ).toBe(403);
    expect(
      (await call("registry.shelters.byId", { shelterId: a.id }, { principal: asSupport })).status,
    ).toBe(403);
  });
});
