import type { RegistryShelterView } from "@opika/contracts";
import {
  adopterRepo,
  animalRepo,
  cityRepo,
  kabinetInviteTokenRepo,
  kabinetShelterRepo,
  shelterRepo,
} from "@opika/db/repos";
import {
  animals,
  authInvitation,
  authMember,
  authSession,
  authUser,
  authVerification,
  superAdmins,
  supportSessions,
} from "@opika/db/schema";
import {
  makeAdopter,
  makeAnimal,
  makeCity,
  makeShelter,
  markInvitationAccepted,
  setupTestDatabase,
  truncateAll,
} from "@opika/db/test";
import {
  type AdopterId,
  donationProviderOf,
  ERASED_ADMIN_EMAIL,
  type ModeratorId,
  publicLocationOf,
  type Shelter,
  type ShelterAdminId,
  type ShelterHistoryEntry,
  type ShelterVerification,
  testOnlyLocationPolicy,
} from "@opika/domain";
import { RPCHandler } from "@orpc/server/fetch";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { router as publicRouter } from "../api/router";
import { fromRpcBody, toRpcBody } from "../api/test-harness";
import { refusedForNameLength } from "../features/kabinet/operator/display-name";
import { historyLineOf, historyLineText } from "../features/kabinet/operator/history-lines";
import { SHELTER_WRITE_POLICY } from "./access";
import type { KabinetPrincipal } from "./actor";
import {
  BLOCKED_MAX_PAGES,
  BLOCKED_PAGE_SIZE,
  type BlockListReader,
  type BlockListSnapshot,
  cachedBlockList,
} from "./email-provider";
import {
  capturingInvitationSender,
  type InvitationMessage,
  type InvitationSender,
} from "./email-senders";
import { capturingPasswordMail } from "./password-mail";
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
/** What the invitation emails do in this test; reset to "sent" before each. */
let invites: InvitationSender & { readonly sent: InvitationMessage[] };

beforeEach(async () => {
  await truncateAll(db);
  invites = capturingInvitationSender();
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
  headers.origin ??= "http://localhost";
  const request = new Request(`http://localhost/api/kabinet/${path.replaceAll(".", "/")}`, {
    method: "POST",
    headers,
    body: JSON.stringify(toRpcBody(input)),
  });
  const response = await handleKabinetRpc(request, {
    availability: {
      kind: "available",
      passwordMail: capturingPasswordMail(),
      sender: { send: async () => {} },
      invites,
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
    shelterWrites: SHELTER_WRITE_POLICY,
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
    // Every one of the nineteen, by path: the route refuses before the input is read.
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
      "registry.admins.blockedAddresses",
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

  /**
   * R-UI answer 2 through the served router: the row's admin counts and
   * donation flag survive the output parse (a field the contract didn't
   * declare would be stripped here, silently), and count as S4 lists them.
   */
  it("carries each row's admin counts and whether a donation link is waiting", async () => {
    const waiting = await shelter({
      displayName: "А",
      verification: STATES.verified,
      pendingDonation: {
        link: { url: "https://send.monobank.ua/jar/x", provider: "monobank_jar" },
        proposedAt: NOW,
        proposedBy: crypto.randomUUID() as ShelterAdminId,
      },
    });
    const plain = await shelter({ displayName: "Б", verification: STATES.verified });
    const invited = await call<{ invite: { status: string } }>("registry.admins.invite", {
      shelterId: waiting.id,
      name: "Олена",
      email: "olena@example.org",
    });
    expect(invited.status).toBe(200);
    const listed = await call<{
      items: {
        id: string;
        admins: { joined: number; invited: number };
        donationPending: boolean;
      }[];
    }>("registry.shelters.list", { search: null, status: null, cursor: null, limit: 10 });
    expect(
      listed.body.items.map(({ id, admins, donationPending }) => ({ id, admins, donationPending })),
    ).toEqual([
      { id: waiting.id, admins: { joined: 0, invited: 1 }, donationPending: true },
      { id: plain.id, admins: { joined: 0, invited: 0 }, donationPending: false },
    ]);
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

  /** K-Q7: a shelter's own animal write reaches the operator whole, animal id and admin id included. */
  it("shows the operator a shelter's animal line with its ids", async () => {
    const s = await shelter();
    const admin = crypto.randomUUID();
    const created = await call<{ id: string }>(
      "shelter.animals.createDraft",
      { name: "Мурчик", species: "cat" },
      {
        principal: { kind: "shelter_admin", shelterAdminId: admin as never, shelterId: s.id },
      },
    );
    expect(created.status).toBe(200);
    const page = await call<{ items: unknown[] }>("registry.history.list", {
      shelterId: s.id,
      cursor: null,
      limit: 10,
    });
    expect(page.body.items).toEqual([
      {
        kind: "animal_created",
        at: NOW,
        actor: { kind: "shelter_admin", shelterAdminId: admin },
        animalId: created.body.id,
        animalName: "Мурчик",
      },
    ]);
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
    const second = await call<{ data: unknown }>("registry.shelters.create", createInput());
    expect(second.status).toBe(409);
    expect(second.body.data).toEqual({ reason: "shelter_admin" });
    const all = await call<{ items: { id: string }[] }>("registry.shelters.list", {
      search: null,
      status: null,
      cursor: null,
      limit: 10,
    });
    expect(all.body.items.map((row) => row.id)).toEqual([first.body.id]);
  });

  /** RG-T10 (Oleksii: "It must land before admin:bootstrap."): an operator is never a shelter's admin. */
  it("refuses an operator's address as the first admin, creating nothing", async () => {
    await db
      .insert(superAdmins)
      .values({ id: crypto.randomUUID(), userId: OPERATOR, grantedAt: NOW });
    const input = { ...createInput(), firstAdmin: { name: "Оператор", email: "op@example.org" } };
    const refused = await call<{ data: unknown }>("registry.shelters.create", input);
    expect(refused.status).toBe(409);
    expect(refused.body.data).toEqual({ reason: "operator" });
    const all = await call<{ items: unknown[] }>("registry.shelters.list", {
      search: null,
      status: null,
      cursor: null,
      limit: 10,
    });
    expect(all.body.items).toEqual([]);
  });

  /** IN-Q8: an address with a live invitation to one shelter is refused as another's first admin. */
  it("refuses a first admin who holds a live invitation to another shelter", async () => {
    const first = await call<RegistryShelterView>("registry.shelters.create", createInput());
    expect(first.status).toBe(200);
    const second = await call<{ data: unknown }>("registry.shelters.create", createInput());
    expect(second.status).toBe(409);
    expect(second.body.data).toEqual({ reason: "invited_elsewhere" });
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

// ─── the rename (R-UI 4) ────────────────────────────────────────────────────

/**
 * A public procedure through the adopter API's own router, as a browser
 * reaches it; `adopterId` stands for a session an adopter already holds.
 */
async function publicCall<T>(
  path: string,
  input: unknown,
  opts: { adopterId?: AdopterId } = {},
): Promise<{ status: number; body: T }> {
  const result = await new RPCHandler(publicRouter).handle(
    new Request(`http://localhost/api/rpc/${path.replaceAll(".", "/")}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toRpcBody(input)),
    }),
    {
      prefix: "/api/rpc",
      context: { db, adopterId: opts.adopterId ?? null, tokenHash: null, now: NOW, setCookies: [] },
    },
  );
  if (!result.matched) throw new Error(`No public procedure at ${path}`);
  return {
    status: result.response.status,
    body: fromRpcBody(JSON.parse(await result.response.text())) as T,
  };
}

describe("registry.shelters.updateProfile: the rename (R-UI 4)", () => {
  const rename = (shelterId: string, displayName: unknown, expectedVersion = 0) =>
    call<RegistryShelterView>("registry.shelters.updateProfile", {
      shelterId,
      expectedVersion,
      displayName,
    });

  it("renames, records one line with both names and the operator, and answers the renamed record", async () => {
    const s = await shelter({ displayName: "Лапа" });
    const result = await rename(s.id, "Притулок «Лапа допомоги»");
    expect(result.status).toBe(200);
    expect(result.body.displayName).toBe("Притулок «Лапа допомоги»");
    expect(result.body.version).toBe(1);
    expect((await reload(s.id)).displayName).toBe("Притулок «Лапа допомоги»");
    expect(await history(s.id)).toEqual([
      {
        kind: "display_name_changed",
        at: NOW,
        moderatorId: OPERATOR,
        from: "Лапа",
        to: "Притулок «Лапа допомоги»",
      },
    ]);
  });

  it("stores and records the name trimmed", async () => {
    const s = await shelter({ displayName: "Лапа" });
    expect((await rename(s.id, "  Лапа допомоги \n")).status).toBe(200);
    expect((await reload(s.id)).displayName).toBe("Лапа допомоги");
    expect(await history(s.id)).toEqual([
      expect.objectContaining({ kind: "display_name_changed", from: "Лапа", to: "Лапа допомоги" }),
    ]);
  });

  it("a rename to the same name, with spaces around it or not, writes nothing and records nothing", async () => {
    const s = await shelter({ displayName: "Лапа допомоги" });
    for (const same of ["Лапа допомоги", "  Лапа допомоги  "]) {
      const result = await rename(s.id, same);
      expect(result.status, same).toBe(200);
      expect(result.body.version, same).toBe(0);
    }
    const after = await reload(s.id);
    expect(after.version).toBe(0);
    expect(after.lastUpdatedAt).toEqual(s.lastUpdatedAt);
    expect(await history(s.id)).toEqual([]);
  });

  it("refuses a blank, empty or non-text name by create's own rule, changing nothing", async () => {
    const s = await shelter({ displayName: "Лапа" });
    for (const bad of ["", "   ", "\t\n", 42, null]) {
      expect((await rename(s.id, bad)).status, JSON.stringify(bad)).toBe(400);
      // S2 refuses the same name: one rule for both.
      expect(
        (await call("registry.shelters.create", { ...createInput(), displayName: bad })).status,
        `create ${JSON.stringify(bad)}`,
      ).toBe(400);
    }
    expect((await reload(s.id)).displayName).toBe("Лапа");
    expect(await history(s.id)).toEqual([]);
  });

  it("refuses a stale version with CONFLICT, renaming nothing", async () => {
    const s = await shelter({ displayName: "Лапа" });
    expect((await rename(s.id, "Перша", 0)).status).toBe(200);
    // A second S4 tab, read before the first rename landed.
    expect((await rename(s.id, "Друга", 0)).status).toBe(409);
    expect((await reload(s.id)).displayName).toBe("Перша");
    expect((await history(s.id)).map((entry) => entry.kind)).toEqual(["display_name_changed"]);
  });

  it("an unknown shelter is NOT_FOUND", async () => {
    expect((await rename(crypto.randomUUID(), "Лапа")).status).toBe(404);
  });

  it("renames alongside another field as two lines, one version bump", async () => {
    const s = await shelter({ displayName: "Лапа" });
    const result = await call<RegistryShelterView>("registry.shelters.updateProfile", {
      shelterId: s.id,
      expectedVersion: 0,
      displayName: "Лапа допомоги",
      description: { uk: "Новий опис", en: null },
    });
    expect(result.body.version).toBe(1);
    expect((await history(s.id)).map((entry) => entry.kind).sort()).toEqual([
      "description_changed",
      "display_name_changed",
    ]);
  });

  it("the new name reaches the public views: the shelter's page and an animal's card", async () => {
    const s = await shelter({ displayName: "Лапа" });
    const animal = makeAnimal({ shelterId: s.id });
    await animalRepo(db).insert(animal, cityId as never);
    expect((await rename(s.id, "Лапа допомоги")).status).toBe(200);

    const page = await publicCall<{ displayName: string }>("shelters.byId", { shelterId: s.id });
    expect(page.status).toBe(200);
    expect(page.body.displayName).toBe("Лапа допомоги");
    const card = await publicCall<{ shelter: { displayName: string } }>("animals.byId", {
      animalId: animal.id,
    });
    expect(card.status).toBe(200);
    expect(card.body.shelter.displayName).toBe("Лапа допомоги");
  });

  /**
   * RUI4-F1, through the operator's own rename: a repeat reveal names the
   * shelter as it is now, beside its current contacts (K4-B4), where it used
   * to show the first reveal's name. And the twin of commitment #2: nothing
   * the shelter reads moves with an adopter's reveals, before the rename or
   * after it (the reveal path reads the shelter, it never writes to it).
   */
  it("a repeat reveal names the shelter by its new name, and nothing the shelter reads varies with reveals", async () => {
    vi.stubEnv("CURSOR_HMAC_SECRET", "registry-test-cursor-secret");
    try {
      const s = await shelter({ displayName: "Лапа" });
      const animal = makeAnimal({ shelterId: s.id });
      await animalRepo(db).insert(animal, cityId as never);
      const adopter = makeAdopter();
      await adopterRepo(db).insert(adopter);
      const asAdopter = { adopterId: adopter.id };
      const asAdmin: KabinetPrincipal = {
        kind: "shelter_admin",
        shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
        shelterId: s.id,
      };
      const shelterReads = async () =>
        Promise.all(
          (
            [
              ["shelter.profile.get", {}],
              ["shelter.history.list", { cursor: null, limit: 50 }],
              ["shelter.animals.list", { filter: { kind: "all" }, cursor: null, limit: 50 }],
              ["shelter.animals.byId", { animalId: animal.id }],
            ] as const
          ).map(async ([path, input]) => {
            const read = await call(path, input, { principal: asAdmin });
            expect(read.status, path).toBe(200);
            return [path, read.body] as const;
          }),
        );

      const beforeAnyReveal = await shelterReads();
      const first = await publicCall<{ shelterContact: unknown }>(
        "animals.reveal",
        { animalId: animal.id },
        asAdopter,
      );
      expect(first.status).toBe(200);
      expect(first.body.shelterContact).toEqual({
        source: "current",
        displayName: "Лапа",
        contact: s.contact,
      });
      expect(await shelterReads()).toEqual(beforeAnyReveal);

      expect((await rename(s.id, "Лапа допомоги")).status).toBe(200);
      const afterRename = await shelterReads();

      const again = await publicCall<{ shelterContact: unknown }>(
        "animals.reveal",
        { animalId: animal.id },
        asAdopter,
      );
      expect(again.status).toBe(200);
      expect(again.body.shelterContact).toEqual({
        source: "current",
        displayName: "Лапа допомоги",
        contact: s.contact,
      });
      const mine = await publicCall<{ items: { shelterContact: unknown }[] }>(
        "reveals.listMine",
        { cursor: null, limit: 20 },
        asAdopter,
      );
      expect(mine.status).toBe(200);
      expect(mine.body.items.map((item) => item.shelterContact)).toEqual([
        { source: "current", displayName: "Лапа допомоги", contact: s.contact },
      ]);
      expect(await shelterReads()).toEqual(afterRename);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  /** RG-Q8: the shelter reads the rename in its own history, the operator by display name. */
  it("shows the rename in the shelter's own history under the operator's name, with no id", async () => {
    const s = await shelter({ displayName: "Лапа" });
    await rename(s.id, "Лапа допомоги");
    const asAdmin: KabinetPrincipal = {
      kind: "shelter_admin",
      shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
      shelterId: s.id,
    };
    const seen = await call<{ items: unknown[] }>(
      "shelter.history.list",
      { cursor: null, limit: 10 },
      { principal: asAdmin },
    );
    expect(seen.body.items).toEqual([
      {
        kind: "display_name_changed",
        at: NOW,
        actor: { kind: "operator", displayName: "Олексій" },
        from: "Лапа",
        to: "Лапа допомоги",
      },
    ]);
  });

  /** What S4 reads back (`registry.history.list`) renders as his composed line, the operator as «ви». */
  it("the line S4 reads back renders «Назва притулку: «{from}» → «{to}»»", async () => {
    const s = await shelter({ displayName: "Лапа" });
    await rename(s.id, "Лапа допомоги");
    const read = await call<{ items: ShelterHistoryEntry[] }>("registry.history.list", {
      shelterId: s.id,
      cursor: null,
      limit: 10,
    });
    expect(read.status).toBe(200);
    expect(
      read.body.items.map((entry) =>
        historyLineText(historyLineOf(entry, { me: OPERATOR as ModeratorId, admins: [] })),
      ),
    ).toEqual(["Назва притулку: «Лапа» → «Лапа допомоги» · ви"]);
  });

  it("a shelter admin can't rename their own shelter (registry only)", async () => {
    const s = await shelter({ displayName: "Лапа" });
    const asAdmin: KabinetPrincipal = {
      kind: "shelter_admin",
      shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
      shelterId: s.id,
    };
    const refused = await call(
      "registry.shelters.updateProfile",
      { shelterId: s.id, expectedVersion: 0, displayName: "Інша назва" },
      { principal: asAdmin },
    );
    expect(refused.status).toBe(403);
    expect((await reload(s.id)).displayName).toBe("Лапа");
    expect(await history(s.id)).toEqual([]);
  });
});

// ─── the display name's cap (RUI4-F2) ───────────────────────────────────────

/**
 * His answer, verbatim: "RUI4-F2: 100-char cap approved. Input-side only (create + rename forms
 * and their procedures); reads must never fail on an existing longer name."
 */
describe("the display name's 100-character cap: input only (RUI4-F2)", () => {
  it("create and rename refuse 101 characters with the refusal the forms recognise, writing nothing", async () => {
    const s = await shelter({ displayName: "Лапа" });
    const over = "а".repeat(101);
    const renamed = await call("registry.shelters.updateProfile", {
      shelterId: s.id,
      expectedVersion: 0,
      displayName: over,
    });
    expect(renamed.status).toBe(400);
    expect(refusedForNameLength(renamed.body)).toBe(true);
    const created = await call("registry.shelters.create", { ...createInput(), displayName: over });
    expect(created.status).toBe(400);
    expect(refusedForNameLength(created.body)).toBe(true);
    expect((await reload(s.id)).displayName).toBe("Лапа");
    expect(await history(s.id)).toEqual([]);
  });

  it("100 characters, with spaces around them, are taken at create and at rename", async () => {
    const s = await shelter({ displayName: "Лапа" });
    const name = "а".repeat(100);
    const renamed = await call<RegistryShelterView>("registry.shelters.updateProfile", {
      shelterId: s.id,
      expectedVersion: 0,
      displayName: ` ${name}  `,
    });
    expect(renamed.status).toBe(200);
    expect((await reload(s.id)).displayName).toBe(name);
    const created = await call<{ displayName: string }>("registry.shelters.create", {
      ...createInput(),
      displayName: `  ${name} `,
    });
    expect(created.status).toBe(200);
    expect(created.body.displayName).toBe(name);
  });

  it("another refused input is not read as the name's length", async () => {
    const s = await shelter({ displayName: "Лапа" });
    const blank = await call("registry.shelters.updateProfile", {
      shelterId: s.id,
      expectedVersion: 0,
      displayName: "   ",
    });
    expect(blank.status).toBe(400);
    expect(refusedForNameLength(blank.body)).toBe(false);
  });

  it("a name saved longer before the cap is still served everywhere, and the rest of the profile still saves", async () => {
    const longer = "а".repeat(150);
    const s = await shelter({ displayName: longer });
    const animal = makeAnimal({ shelterId: s.id });
    await animalRepo(db).insert(animal, cityId as never);

    const record = await call<RegistryShelterView>("registry.shelters.byId", { shelterId: s.id });
    expect(record.status).toBe(200);
    expect(record.body.displayName).toBe(longer);
    const list = await call<{ items: { displayName: string }[] }>("registry.shelters.list", {
      search: null,
      status: null,
      cursor: null,
      limit: 50,
    });
    expect(list.status).toBe(200);
    expect(list.body.items.map((row) => row.displayName)).toContain(longer);
    const page = await publicCall<{ displayName: string }>("shelters.byId", { shelterId: s.id });
    expect(page.status).toBe(200);
    expect(page.body.displayName).toBe(longer);
    const card = await publicCall<{ shelter: { displayName: string } }>("animals.byId", {
      animalId: animal.id,
    });
    expect(card.status).toBe(200);
    expect(card.body.shelter.displayName).toBe(longer);

    const described = await call<RegistryShelterView>("registry.shelters.updateProfile", {
      shelterId: s.id,
      expectedVersion: 0,
      description: { uk: "Новий опис", en: null },
    });
    expect(described.status).toBe(200);
    expect(described.body.displayName).toBe(longer);
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

/**
 * Resubmit replaces the evidence list whole, and its input can't carry a
 * document (RG-Q5) or who made a visit. Both come back from the record on
 * file (his round-2b answer 1, verbatim: "The server carries existing
 * supporting-document items over on resubmit. No data loss, no new copy. Add
 * a test."; AW-R3-11 for the visit). The rule itself is unit-tested in
 * `handlers/evidence-on-file.test.ts`.
 */
describe("registry.verification.resubmit keeps what its input can't carry", () => {
  /** Who made the visit: another operator, never OPERATOR, who resubmits. */
  const RECORDER = "0ec0ec0e-0000-4000-8000-000000000099" as ModeratorId;
  const REFERENCE = {
    kind: "reference_contact",
    name: "Ветклініка «Айболить»",
    channel: { kind: "phone", e164: "+380505552108" },
    relationship: "veterinary_clinic",
  } as const;
  const VISIT = {
    kind: "site_visit",
    visitedAt: new Date("2026-10-05T00:00:00.000Z"),
    visitedBy: RECORDER,
    notes: "Був на місці",
  } as const;
  const DOCUMENT = {
    kind: "supporting_document",
    label: { uk: "Статут", en: null },
    documentKey: "evidence/abc-statut.pdf",
  } as const;

  /**
   * Rejected, as a script-onboarded shelter would be: the record holds the
   * document, and no history entry does (inserted with none, as
   * `shelter_created` holds no evidence).
   */
  const rejectedWithDocument = () =>
    shelter({
      verification: {
        status: "rejected",
        rejectedAt: NOW,
        rejectedBy: OPERATOR as ModeratorId,
        reason: { code: "spam", note: "Немає документів" },
        evidence: { items: [REFERENCE, DOCUMENT, VISIT], submittedAt: new Date("2026-10-04") },
      },
    });

  /** What S4's resubmit sends with no edits: every card the prefill made, the document has none. */
  const UNEDITED = [
    {
      kind: "reference_contact",
      name: "Ветклініка «Айболить»",
      channel: { kind: "phone", e164: "+380505552108" },
      relationship: "veterinary_clinic",
    },
    { kind: "site_visit", visitedOn: "2026-10-05", notes: "Був на місці" },
  ];

  it("with no edits, keeps the document with its key, and the visit with who made it", async () => {
    const s = await rejectedWithDocument();
    const resubmitted = await call<RegistryShelterView>("registry.verification.resubmit", {
      shelterId: s.id,
      evidence: UNEDITED,
    });
    expect(resubmitted.status).toBe(200);
    const kept = [
      REFERENCE,
      { ...VISIT, visitedBy: "0ec0ec0e-0000-4000-8000-000000000099" },
      {
        kind: "supporting_document",
        label: { uk: "Статут", en: null },
        documentKey: "evidence/abc-statut.pdf",
      },
    ];
    expect(resubmitted.body.verification).toEqual({
      status: "pending",
      submittedAt: NOW,
      evidence: { items: kept, submittedAt: NOW },
    });
    expect((await reload(s.id)).verification.evidence.items).toEqual(kept);
  });

  it("with edits, applies them, and keeps the document; a changed visit is the resubmitter's", async () => {
    const s = await rejectedWithDocument();
    const resubmitted = await call<RegistryShelterView>("registry.verification.resubmit", {
      shelterId: s.id,
      evidence: [
        { ...UNEDITED[0], name: "Ветклініка «Айболить», д-р Шевчук" },
        { kind: "site_visit", visitedOn: "2026-10-05", notes: "Був на місці, 18 собак" },
      ],
    });
    expect(resubmitted.status).toBe(200);
    expect((await reload(s.id)).verification.evidence.items).toEqual([
      { ...REFERENCE, name: "Ветклініка «Айболить», д-р Шевчук" },
      { ...VISIT, visitedBy: OPERATOR, notes: "Був на місці, 18 собак" },
      DOCUMENT,
    ]);
  });

  it("records the whole resulting list in the history entry, carried items included", async () => {
    const s = await rejectedWithDocument();
    await call("registry.verification.resubmit", { shelterId: s.id, evidence: UNEDITED });
    expect(await history(s.id)).toEqual([
      {
        kind: "verification",
        event: {
          type: "resubmit",
          at: NOW,
          actor: { kind: "moderator", moderatorId: OPERATOR },
          evidence: { items: [REFERENCE, VISIT, DOCUMENT], submittedAt: NOW },
        },
        from: "rejected",
        to: "pending",
      },
    ]);
  });
});

// ─── donation ───────────────────────────────────────────────────────────────

describe("registry.donation.approve / reject (N20)", () => {
  const url = "https://send.monobank.ua/jar/abc";
  const pending = () => ({
    link: { url, provider: donationProviderOf(url) },
    proposedAt: NOW,
    proposedBy: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
  });

  it("approves the proposal into the live link and records it", async () => {
    const s = await shelter({ pendingDonation: pending() });
    const approved = await call<RegistryShelterView>("registry.donation.approve", {
      shelterId: s.id,
      expectedVersion: 0,
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
      expectedVersion: 0,
    });
    expect(rejected.body.donation).toBeNull();
    expect(rejected.body.pendingDonation).toBeNull();
    expect(await history(s.id)).toEqual([expect.objectContaining({ decision: "rejected" })]);
  });

  /**
   * RG-Q12 (Oleksii): the operator reads link A at version v; the shelter
   * re-proposes (version moves); the operator's decision, carrying v, is
   * CONFLICT and decides nothing, for approve and reject alike: a stale
   * reject would discard a link the operator never saw.
   */
  it.each(["approve", "reject"] as const)(
    "refuses a stale %s with CONFLICT, deciding nothing",
    async (decision) => {
      const s = await shelter({ pendingDonation: pending() });
      const asAdmin: KabinetPrincipal = {
        kind: "shelter_admin",
        shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
        shelterId: s.id,
      };
      const read = await call<RegistryShelterView>("registry.shelters.byId", { shelterId: s.id });
      const other = "https://send.monobank.ua/jar/zzz";
      expect(
        // A K2-era proposal, so writes are opened for it (KH-Q1).
        (await call("shelter.profile.proposeDonation", { url: other }, { principal: asAdmin }))
          .status,
      ).toBe(200);
      const stale = await call(`registry.donation.${decision}`, {
        shelterId: s.id,
        expectedVersion: read.body.version,
      });
      expect(stale.status).toBe(409);
      const after = await reload(s.id);
      expect(after.donation).toBeNull();
      expect(after.pendingDonation?.link.url).toBe(other);
      expect((await history(s.id)).map((entry) => entry.kind)).toEqual(["donation_proposed"]);
      // Reading again and deciding on what is now there works.
      const fresh = await call<RegistryShelterView>(`registry.donation.${decision}`, {
        shelterId: s.id,
        expectedVersion: after.version,
      });
      expect(fresh.status).toBe(200);
      expect(fresh.body.pendingDonation).toBeNull();
    },
  );

  it("decides nothing when nothing is pending", async () => {
    const s = await shelter();
    expect(
      (await call("registry.donation.approve", { shelterId: s.id, expectedVersion: 0 })).status,
    ).toBe(200);
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
    // The real accept flow flips the invitation to `accepted` in the same
    // statement as the membership — a real accepted admin's own invitation
    // is never still `pending`. Without this, `erasableIf`'s
    // `noLiveInvitationElsewhere` check would (rightly) treat the fixture's
    // own invitation as a live invitation elsewhere.
    await markInvitationAccepted(db, invitation?.id ?? "");
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
    const asMember = await call<{ data: unknown }>("registry.admins.invite", {
      shelterId: other.id,
      name: "М",
      email: "member@example.org",
    });
    expect(asMember.status).toBe(409);
    expect(asMember.body.data).toEqual({ reason: "shelter_admin" });
    // Olena's invitation to the first shelter is live, so a second shelter can't invite her (IN-Q8).
    const elsewhere = await call<{ data: unknown }>("registry.admins.invite", {
      shelterId: other.id,
      name: "Олена",
      email: "olena@example.org",
    });
    expect(elsewhere.status).toBe(409);
    expect(elsewhere.body.data).toEqual({ reason: "invited_elsewhere" });
    // An operator is never invited (RG-T10).
    await db
      .insert(superAdmins)
      .values({ id: crypto.randomUUID(), userId: OPERATOR, grantedAt: NOW });
    const operator = await call<{ data: unknown }>("registry.admins.invite", {
      shelterId: other.id,
      name: "Оператор",
      email: "op@example.org",
    });
    expect(operator.status).toBe(409);
    expect(operator.body.data).toEqual({ reason: "operator" });
  });

  /**
   * Review of ee847a2, finding 1: invited to A, A's invitation expires, she is
   * invited to B (allowed: A's is dead), then the operator resends A's. A
   * resend revives it, so it is refused, and she keeps exactly one live
   * invitation, B's.
   */
  it("refuses to resend an invitation whose address has since been invited elsewhere", async () => {
    const a = await shelter();
    const b = await shelter();
    const invited = await call<{ id: string }>("registry.admins.invite", {
      shelterId: a.id,
      name: "Олена",
      email: "olena@example.org",
    });
    expect(invited.status).toBe(200);
    const later = new Date(NOW.getTime() + 73 * 60 * 60 * 1000);
    const elsewhere = await call(
      "registry.admins.invite",
      { shelterId: b.id, name: "Олена", email: "olena@example.org" },
      { now: later },
    );
    expect(elsewhere.status).toBe(200);
    const resent = await call<{ data: unknown }>(
      "registry.admins.resendInvite",
      { shelterId: a.id, adminId: invited.body.id },
      { now: later },
    );
    expect(resent.status).toBe(409);
    expect(resent.body.data).toEqual({ reason: "invited_elsewhere" });
    const live = (await db.select().from(authInvitation)).filter(
      (row) => row.status === "pending" && row.expiresAt > later,
    );
    expect(live).toHaveLength(1);
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

  /**
   * RG-Q6: sessions end at once; the last admin may go; it is recorded.
   *
   * GDPR erasure, option A (`docs/gdpr-analysis.md` §5 item 4; Oleksii,
   * 2026-10-24): this is also the realistic, reachable shape of that
   * decision — a real, accepted admin removed from their only shelter
   * (one person administers at most one shelter, `auth_member_user_id_unique`),
   * who is never a `super_admins` grant either (RG-T10: an operator is
   * never invited as a shelter admin). So the account is erased and this
   * same `admin_removed` entry's own email — the one `removeMember` just
   * wrote — is scrubbed to the placeholder *before this call returns*: "at
   * the moment of removal" means this request, not a later sweep.
   */
  it("removes the last admin, ending every session of theirs, erasing the account, and scrubbing their email from history", async () => {
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
    // The account itself is gone — not just its memberships and sessions.
    expect(
      await db
        .select()
        .from(authUser)
        .then((rows) => rows.filter((row) => row.id === member)),
    ).toEqual([]);
    expect(await history(s.id)).toContainEqual(
      expect.objectContaining({
        kind: "admin_removed",
        email: ERASED_ADMIN_EMAIL,
        wasPending: false,
      }),
    );
    // The earlier admin_invited entry for the same address is scrubbed too, not just admin_removed.
    expect(await history(s.id)).toContainEqual(
      expect.objectContaining({ kind: "admin_invited", email: ERASED_ADMIN_EMAIL }),
    );
    expect(await history(s.id)).not.toContainEqual(
      expect.objectContaining({ email: "member@example.org" }),
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

// ─── invitation emails (IN-Q3, IN-E7) ───────────────────────────────────────

describe("invitation emails: every write that makes an invitation live sends one, and the operator sees the outcome (IN-E7)", () => {
  /** PW-2: the link carries a 43-character random token, never the invitation id. */
  const INVITE_URL = /^http:\/\/localhost\/kabinet\/vkhid\?zaproshennia=([A-Za-z0-9_-]{43})$/;

  /** The invitation each emailed link's token names, through its stored hash only. */
  const invitationOfLink = async (url: string | undefined) => {
    const token = INVITE_URL.exec(url ?? "")?.[1];
    if (token === undefined) return undefined;
    return (await kabinetInviteTokenRepo(db).landingOf(token))?.invitationId;
  };

  const pendingInvitationIds = async () =>
    (await db.select().from(authInvitation))
      .filter((row) => row.status === "pending")
      .map((row) => row.id);

  it("invite: emails a link to the invite landing for exactly that invitation, and returns `sent`", async () => {
    const s = await shelter();
    const invited = await call<{ invitationEmail: unknown }>("registry.admins.invite", {
      shelterId: s.id,
      name: "Олена",
      email: "olena@example.org",
    });
    expect(invited.status).toBe(200);
    expect(invited.body.invitationEmail).toEqual({ kind: "sent", blockCheck: "clear" });
    expect(invites.sent).toEqual([
      {
        email: "olena@example.org",
        shelterName: s.displayName,
        operatorName: "Олексій",
        // The fixture shelter is verified (Q-C).
        shelterVerification: "verified",
        url: expect.stringMatching(INVITE_URL),
        validForHours: 72,
      },
    ]);
    const id = await invitationOfLink(invites.sent[0]?.url);
    expect(await pendingInvitationIds()).toEqual([id]);
    // Stored hashed: no verification row holds the token, or the invitation id as its identifier.
    const token = INVITE_URL.exec(invites.sent[0]?.url ?? "")?.[1] ?? "";
    const rows = await db.select().from(authVerification);
    expect(rows.some((row) => row.identifier.includes(token) || row.value.includes(token))).toBe(
      false,
    );
    expect(rows.map((row) => row.value)).toEqual([`invitation:${id}`]);
  });

  /**
   * Q-C (Oleksii, 2026-10-19): the invite's second sentence follows the shelter's verification
   * status when it is sent; PC-T10 (his decision): verified and paused get the verified sentence,
   * every other status the before-verification one.
   */
  const PAUSED: ShelterVerification = {
    status: "paused",
    verifiedAt: NOW,
    verifiedBy: OPERATOR as ModeratorId,
    pausedAt: NOW,
    pausedBy: { kind: "moderator", moderatorId: OPERATOR as ModeratorId },
    reason: { code: "seasonal_closure", note: null },
    evidence,
  };
  const SUSPENDED: ShelterVerification = {
    status: "suspended",
    suspendedAt: NOW,
    suspendedBy: OPERATOR as ModeratorId,
    reason: { code: "complaint_upheld", note: null },
    priorState: { status: "verified", verifiedAt: NOW, verifiedBy: OPERATOR as ModeratorId },
    evidence,
  };
  const REJECTED: ShelterVerification = {
    status: "rejected",
    rejectedAt: NOW,
    rejectedBy: OPERATOR as ModeratorId,
    reason: { code: "spam", note: null },
    evidence,
  };
  /** His decision (PC-T10), written out per status, never derived from the code under test. */
  const BY_STATUS = [
    ["verified", STATES.verified, "verified"],
    ["paused", PAUSED, "verified"],
    ["pending", STATES.pending, "not_yet_verified"],
    ["under review", STATES.under_review, "not_yet_verified"],
    ["suspended", SUSPENDED, "not_yet_verified"],
    ["rejected", REJECTED, "not_yet_verified"],
  ] as const;

  it.each(BY_STATUS)(
    "invite: a %s shelter's invite carries the sentence it should",
    async (_label, verification, expected) => {
      const s = await shelter({ verification });
      const invited = await call("registry.admins.invite", {
        shelterId: s.id,
        name: "Олена",
        email: "olena@example.org",
      });
      expect(invited.status).toBe(200);
      expect(invites.sent.map((message) => message.shelterVerification)).toEqual([expected]);
    },
  );

  it.each(BY_STATUS)(
    "resend: a %s shelter's resent invite carries the sentence it should",
    async (_label, verification, expected) => {
      const s = await shelter({ verification });
      const invited = await call<{ id: string }>("registry.admins.invite", {
        shelterId: s.id,
        name: "Олена",
        email: "olena@example.org",
      });
      expect(invited.status).toBe(200);
      const resent = await call("registry.admins.resendInvite", {
        shelterId: s.id,
        adminId: invited.body.id,
      });
      expect(resent.status).toBe(200);
      expect(invites.sent.map((message) => message.shelterVerification)).toEqual([
        expected,
        expected,
      ]);
    },
  );

  it("create: the first invite, sent at create, is always the before-verification one", async () => {
    const created = await call("registry.shelters.create", createInput());
    expect(created.status).toBe(200);
    expect(invites.sent.map((message) => message.shelterVerification)).toEqual([
      "not_yet_verified",
    ]);
  });

  it("invite: a blocked address is reported as blocked, with the reason, and the invitation still stands", async () => {
    invites = capturingInvitationSender({ kind: "blocked", reason: "unsubscribed" });
    const s = await shelter();
    const invited = await call<{ invitationEmail: unknown; invite: unknown }>(
      "registry.admins.invite",
      { shelterId: s.id, name: "Олена", email: "olena@example.org" },
    );
    expect(invited.status).toBe(200);
    expect(invited.body.invitationEmail).toEqual({ kind: "blocked", reason: "unsubscribed" });
    expect(invited.body.invite).toMatchObject({ status: "pending" });
    expect(await pendingInvitationIds()).toHaveLength(1);
  });

  it("invite: an unchecked send reaches the operator as `sent` with `blockCheck: unknown`, through the contract's output (review of 5f9e7c4, finding 1)", async () => {
    invites = capturingInvitationSender({ kind: "sent", blockCheck: "unknown" });
    const s = await shelter();
    const invited = await call<{ invitationEmail: unknown }>("registry.admins.invite", {
      shelterId: s.id,
      name: "Олена",
      email: "olena@example.org",
    });
    expect(invited.status).toBe(200);
    expect(invited.body.invitationEmail).toEqual({ kind: "sent", blockCheck: "unknown" });
  });

  it("invite: a sender that throws is `failed: provider_error`, never a 500, and the invitation stands", async () => {
    const throwing = capturingInvitationSender();
    invites = Object.assign(throwing, {
      send: async () => {
        throw new Error("provider down");
      },
    });
    const s = await shelter();
    const invited = await call<{ invitationEmail: unknown }>("registry.admins.invite", {
      shelterId: s.id,
      name: "Олена",
      email: "olena@example.org",
    });
    expect(invited.status).toBe(200);
    expect(invited.body.invitationEmail).toEqual({ kind: "failed", reason: "provider_error" });
    expect(await pendingInvitationIds()).toHaveLength(1);
  });

  it("resendInvite: emails the same invitation again and returns the outcome", async () => {
    const s = await shelter();
    const invited = await call<{ id: string }>("registry.admins.invite", {
      shelterId: s.id,
      name: "Олена",
      email: "olena@example.org",
    });
    const firstLink = invites.sent[0]?.url;
    invites = capturingInvitationSender({ kind: "failed", reason: "provider_error" });
    const resent = await call<{ invitationEmail: unknown }>("registry.admins.resendInvite", {
      shelterId: s.id,
      adminId: invited.body.id,
    });
    expect(resent.status).toBe(200);
    expect(resent.body).toEqual({
      invitationEmail: { kind: "failed", reason: "provider_error" },
      invitationReminder: null,
    });
    const [id] = await pendingInvitationIds();
    const [link] = invites.sent.map((m) => m.url);
    expect(invites.sent).toHaveLength(1);
    expect(link).toMatch(INVITE_URL);
    // A new link for the same invitation; the first email's link no longer names anything.
    expect(await invitationOfLink(link)).toBe(id);
    expect(link).not.toBe(firstLink);
    expect(await invitationOfLink(firstLink)).toBeUndefined();
  });

  it("create: emails the first admin and returns the outcome beside the record", async () => {
    invites = capturingInvitationSender({ kind: "blocked", reason: "hard_bounce" });
    const input = createInput();
    const created = await call<{ firstAdminInvitationEmail: unknown; displayName: string }>(
      "registry.shelters.create",
      input,
    );
    expect(created.status).toBe(200);
    expect(created.body.firstAdminInvitationEmail).toEqual({
      kind: "blocked",
      reason: "hard_bounce",
    });
    expect(invites.sent).toEqual([
      expect.objectContaining({
        email: "olena@example.org",
        shelterName: created.body.displayName,
      }),
    ]);
  });

  it("a refused invite sends nothing", async () => {
    const a = await shelter();
    const b = await shelter();
    await call("registry.admins.invite", {
      shelterId: a.id,
      name: "О",
      email: "olena@example.org",
    });
    const refused = await call("registry.admins.invite", {
      shelterId: b.id,
      name: "О",
      email: "olena@example.org",
    });
    expect(refused.status).toBe(409);
    expect(invites.sent).toHaveLength(1);
  });
});
// ─── the reminder after a send (IN-E13) ─────────────────────────────────────

describe("after an invitation email is sent, the operator is reminded to tell the shelter personally (IN-E13)", () => {
  type Reminder = { kind: string; text: string } | null;
  /** Oleksii's final text (2026-10-14, row 77), transcribed, with {sender} filled. */
  const expectReminderFrom = (reminder: Reminder, sender: string) => {
    expect(reminder?.kind).toBe("tell_personally");
    expect(reminder?.text).toBe(
      `Повідомте притулок особисто: запрошення надіслано з ${sender}. Якщо листа не видно — хай перевірить вкладку «Промоакції».`,
    );
  };

  it("invite: a send checked clear carries the reminder, naming the configured From address", async () => {
    invites = capturingInvitationSender(undefined, { fromAddress: "noreply@mail.example.org" });
    const s = await shelter();
    const invited = await call<{ invitationReminder: Reminder }>("registry.admins.invite", {
      shelterId: s.id,
      name: "Олена",
      email: "olena@example.org",
    });
    expect(invited.status).toBe(200);
    expectReminderFrom(invited.body.invitationReminder, "noreply@mail.example.org");
  });

  it("invite: an unchecked send (blockCheck unknown) carries it too (default taken, IN-E13)", async () => {
    invites = capturingInvitationSender({ kind: "sent", blockCheck: "unknown" });
    const s = await shelter();
    const invited = await call<{ invitationReminder: Reminder }>("registry.admins.invite", {
      shelterId: s.id,
      name: "Олена",
      email: "olena@example.org",
    });
    expectReminderFrom(invited.body.invitationReminder, "noreply@mail.example.org");
  });

  it.each([
    { kind: "blocked", reason: "unsubscribed" },
    { kind: "failed", reason: "provider_error" },
    { kind: "failed", reason: "copy_pending" },
  ] as const)("invite: nothing sent ($kind, $reason), no reminder", async (outcome) => {
    invites = capturingInvitationSender(outcome);
    const s = await shelter();
    const invited = await call<{ invitationReminder: Reminder; invitationEmail: unknown }>(
      "registry.admins.invite",
      { shelterId: s.id, name: "Олена", email: "olena@example.org" },
    );
    expect(invited.status).toBe(200);
    expect(invited.body.invitationEmail).toEqual(outcome);
    expect(invited.body.invitationReminder).toBeNull();
  });

  it("resendInvite and create carry it beside their outcome", async () => {
    const s = await shelter();
    const invited = await call<{ id: string }>("registry.admins.invite", {
      shelterId: s.id,
      name: "Олена",
      email: "olena@example.org",
    });
    const resent = await call<{ invitationReminder: Reminder }>("registry.admins.resendInvite", {
      shelterId: s.id,
      adminId: invited.body.id,
    });
    expect(resent.status).toBe(200);
    expectReminderFrom(resent.body.invitationReminder, "noreply@mail.example.org");

    const created = await call<{ firstAdminInvitationReminder: Reminder }>(
      "registry.shelters.create",
      { ...createInput(), firstAdmin: { name: "Ірина", email: "iryna@example.org" } },
    );
    expect(created.status).toBe(200);
    expectReminderFrom(created.body.firstAdminInvitationReminder, "noreply@mail.example.org");
  });
});

// ─── blocked addresses (Oleksii, 2026-10-14, answer 4) ──────────────────────

describe("registry.admins.blockedAddresses: which of a shelter's addresses the provider has blocked (answer 4)", () => {
  /** A reader that answers `snapshot` and counts its reads. */
  const reader = (snapshot: BlockListSnapshot) => {
    let reads = 0;
    const blockList: BlockListReader = {
      read: async () => {
        reads++;
        return snapshot;
      },
    };
    return { blockList, reads: () => reads };
  };
  const READ_AT = new Date("2026-10-13T09:58:00.000Z");

  /** A shelter with two pending invitations. */
  async function shelterWithTwoInvited() {
    const s = await shelter();
    for (const [name, email] of [
      ["Олена", "olena@example.org"],
      ["Ірина", "iryna@example.org"],
    ] as const) {
      const invited = await call("registry.admins.invite", { shelterId: s.id, name, email });
      expect(invited.status).toBe(200);
    }
    return s;
  }

  it("checked: names only this shelter's blocked addresses, with the reason and when the list was read", async () => {
    const s = await shelterWithTwoInvited();
    const r = reader({
      kind: "complete",
      readAt: READ_AT,
      entries: new Map([
        ["olena@example.org", "unsubscribed"],
        ["stranger@example.org", "hard_bounce"],
      ]),
    });
    invites = capturingInvitationSender(undefined, { blockList: r.blockList });
    const result = await call("registry.admins.blockedAddresses", { shelterId: s.id });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      kind: "checked",
      asOf: READ_AT,
      blocked: [{ email: "olena@example.org", reason: "unsubscribed" }],
    });
    expect(r.reads()).toBe(1);
  });

  it("checked and empty only when the whole list was read and nobody here is on it", async () => {
    const s = await shelterWithTwoInvited();
    invites = capturingInvitationSender(undefined, {
      blockList: reader({ kind: "complete", readAt: READ_AT, entries: new Map() }).blockList,
    });
    const result = await call("registry.admins.blockedAddresses", { shelterId: s.id });
    expect(result.body).toEqual({ kind: "checked", asOf: READ_AT, blocked: [] });
  });

  it("incomplete: the page cap was hit; what was seen is `blockedSoFar`, never a plain list", async () => {
    const s = await shelterWithTwoInvited();
    invites = capturingInvitationSender(undefined, {
      blockList: reader({
        kind: "incomplete",
        readAt: READ_AT,
        pagesRead: 5,
        entries: new Map([["iryna@example.org", "spam_complaint"]]),
      }).blockList,
    });
    const result = await call("registry.admins.blockedAddresses", { shelterId: s.id });
    expect(result.body).toEqual({
      kind: "incomplete",
      asOf: READ_AT,
      blockedSoFar: [{ email: "iryna@example.org", reason: "spam_complaint" }],
    });
  });

  it("unknown: the provider couldn't be read, so no list at all", async () => {
    const s = await shelterWithTwoInvited();
    for (const why of [
      "provider_error",
      "timed_out",
      "unsupported_provider",
      "provider_suppresses",
    ] as const) {
      invites = capturingInvitationSender(undefined, {
        blockList: reader({ kind: "unknown", why }).blockList,
      });
      const result = await call("registry.admins.blockedAddresses", { shelterId: s.id });
      expect(result.body, why).toEqual({ kind: "unknown", why });
    }
  });

  /** End to end through the real cached reader, Brevo faked at fetch: the two cases Oleksii named. */
  describe("through the real cached reader (Brevo faked at fetch)", () => {
    const brevoConfig = {
      provider: "brevo",
      apiKey: "k",
      fromAddress: "noreply@mail.example.org",
      fromName: null,
      replyTo: "hello@example.org",
    } as const;

    it("Brevo error → unknown", async () => {
      const s = await shelterWithTwoInvited();
      const fetchImpl = (async () =>
        new Response("{}", { status: 502 })) as unknown as typeof fetch;
      invites = capturingInvitationSender(undefined, {
        blockList: cachedBlockList(brevoConfig, { fetchImpl }),
      });
      const result = await call("registry.admins.blockedAddresses", { shelterId: s.id });
      expect(result.body).toEqual({ kind: "unknown", why: "provider_error" });
    });

    it("cap hit → incomplete", async () => {
      const s = await shelterWithTwoInvited();
      const total = BLOCKED_PAGE_SIZE * (BLOCKED_MAX_PAGES + 1);
      const fetchImpl = (async (url: string) => {
        const offset = Number(new URL(url).searchParams.get("offset"));
        const contacts = Array.from({ length: BLOCKED_PAGE_SIZE }, (_, i) => ({
          email: offset === 0 && i === 0 ? "olena@example.org" : `other${offset + i}@example.org`,
          reason: { code: "unsubscribedViaEmail" },
        }));
        return new Response(JSON.stringify({ count: total, contacts }), { status: 200 });
      }) as unknown as typeof fetch;
      invites = capturingInvitationSender(undefined, {
        blockList: cachedBlockList(brevoConfig, { fetchImpl }),
      });
      const result = await call("registry.admins.blockedAddresses", { shelterId: s.id });
      expect(result.body).toEqual({
        kind: "incomplete",
        asOf: NOW,
        blockedSoFar: [{ email: "olena@example.org", reason: "unsubscribed" }],
      });
    });
  });

  /**
   * The invite route moves to Resend (Oleksii, 2026-10-15, EM-B10, verbatim:
   * "Decision: invites move to Resend; retire Brevo."). Resend's suppression
   * list isn't read (EM-F1), so the view says so in the same words a
   * Resend-routed send's block check uses, never an empty `checked`.
   */
  it("the invite route on Resend: unknown (provider_suppresses), and nobody is called", async () => {
    const s = await shelterWithTwoInvited();
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response(JSON.stringify({ count: 0, contacts: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    invites = capturingInvitationSender(undefined, {
      blockList: cachedBlockList(
        {
          provider: "resend",
          apiKey: "k",
          fromAddress: "noreply@mail.example.org",
          fromName: null,
          replyTo: "hello@example.org",
        },
        { fetchImpl },
      ),
    });
    const result = await call("registry.admins.blockedAddresses", { shelterId: s.id });
    expect(result.body).toEqual({ kind: "unknown", why: "provider_suppresses" });
    expect(calls).toBe(0);
  });

  it("a shelter with no addresses is an honest empty `checked`, without asking the provider", async () => {
    const s = await shelter();
    const r = reader({ kind: "unknown", why: "provider_error" });
    invites = capturingInvitationSender(undefined, { blockList: r.blockList });
    const result = await call("registry.admins.blockedAddresses", { shelterId: s.id });
    expect(result.body).toEqual({ kind: "checked", asOf: NOW, blocked: [] });
    expect(r.reads()).toBe(0);
  });

  it("an unknown shelter is NOT_FOUND", async () => {
    const result = await call("registry.admins.blockedAddresses", {
      shelterId: "51000000-0000-4000-8000-00000000dead",
    });
    expect(result.status).toBe(404);
  });
});
