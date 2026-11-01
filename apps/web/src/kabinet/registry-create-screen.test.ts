import type { CreatedShelterView } from "@opika/contracts";
import { REGIONS } from "@opika/db";
import { cityRepo } from "@opika/db/repos";
import { authUser, cities, superAdmins } from "@opika/db/schema";
import { makeCity, setupTestDatabase, truncateAll } from "@opika/db/test";
import { type ModeratorId, testOnlyLocationPolicy } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { fromRpcBody, toRpcBody } from "../api/test-harness";
import {
  type CreateShelterForm,
  createInputOf,
  emptyCreateForm,
} from "../features/kabinet/operator/create/create-input";
import { createRefusalOf } from "../features/kabinet/operator/create/create-outcome";
import type { RegistryCreateInput } from "../features/kabinet/operator/create/registry-create-client";
import { SHELTER_WRITE_POLICY } from "./access";
import type { KabinetPrincipal } from "./actor";
import { capturingInvitationSender } from "./email-senders";
import { capturingPasswordMail } from "./password-mail";
import { handleKabinetRpc } from "./rpc-route";
import { TEST_SESSION_COOKIE } from "./test-session-cookie";

/**
 * S2's two halves against each other, through the served router: what the
 * screen's mapping (`createInputOf`) sends is what `registry.shelters.create`
 * accepts, and what the server refuses with is what the screen's mapping
 * (`createRefusalOf`) recognises. The component tests fake the client; this
 * is the one place the real answers meet the screen's code.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const OPERATOR = "0ec0ec0e-0000-4000-8000-000000000001";
const asOperator: KabinetPrincipal = { kind: "super_admin", moderatorId: OPERATOR as ModeratorId };
/** 10:00 in Kyiv. */
const NOW = new Date("2026-10-13T07:00:00.000Z");
let cityId: string;

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  cityId = city.id;
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

async function create(input: RegistryCreateInput, now: Date = NOW) {
  const request = new Request("http://localhost/api/kabinet/registry/shelters/create", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
      cookie: TEST_SESSION_COOKIE,
    },
    body: JSON.stringify(toRpcBody(input)),
  });
  const response = await handleKabinetRpc(request, {
    availability: {
      kind: "available",
      passwordMail: capturingPasswordMail(),
      sender: { send: async () => {} },
      invites: capturingInvitationSender(),
      secret: "x",
      baseURL: "http://localhost",
    },
    resolve: async () => ({
      principal: asOperator,
      userId: OPERATOR,
      db,
      cursorSecret: "test-cursor-secret",
    }),
    limiters,
    ip: "203.0.113.1",
    now,
    newId: () => crypto.randomUUID(),
    operatorDisplayName: "Олексій",
    locationPolicy: testOnlyLocationPolicy("registry-create-screen-test"),
    production: false,
    shelterWrites: SHELTER_WRITE_POLICY,
  });
  return { status: response.status, body: fromRpcBody(await response.json()) };
}

/** RU-B5's rehearsal shelter, as the operator types it. */
const initiative = (patch: Partial<CreateShelterForm> = {}): CreateShelterForm => ({
  ...emptyCreateForm(),
  displayName: "Лапа Вишгорода",
  description: "Волонтери з Вишгорода.",
  cityId,
  line1: "вул. Мечникова, 4",
  coordinates: "50.5843, 30.4890",
  legal: {
    ...emptyCreateForm().legal,
    kind: "unregistered_initiative",
    contactPersonName: "Ірина",
  },
  contacts: { phone: "+380 50 111-22-33", telegram: "", others: [] },
  evidence: [
    { id: "v", kind: "site_visit", visitedOn: "2026-10-12", notes: "Оглянув вольєри." },
    ...["+380 50 555 21 08", "+380 67 000 11 22"].map((phone, n) => ({
      id: `r${n}`,
      kind: "reference_contact" as const,
      name: `Рекомендація ${n + 1}`,
      channelKind: "phone" as const,
      channelValue: phone,
      relationship: "veterinary_clinic" as const,
    })),
  ],
  adminName: "Ірина",
  adminEmail: "iryna@example.org",
  ...patch,
});

const inputOf = (form: CreateShelterForm, now: Date = NOW): RegistryCreateInput => {
  const checked = createInputOf(form, now);
  if (checked.kind !== "ok") throw new Error(JSON.stringify(checked.errors));
  return checked.input;
};

describe("the screen's input, as the server takes it", () => {
  it("creates the unregistered initiative, pending, the visit credited to the operator, no document", async () => {
    const { status, body } = await create(inputOf(initiative()));
    expect(status).toBe(200);
    const view = body as CreatedShelterView;
    expect(view.verification.status).toBe("pending");
    expect(view.admins.map((admin) => admin.email)).toEqual(["iryna@example.org"]);
    expect(view.firstAdminInvitationEmail).toEqual({ kind: "sent", blockCheck: "clear" });
    const evidence = view.verification.status === "pending" ? view.verification.evidence.items : [];
    expect(evidence.map((item) => item.kind)).toEqual([
      "site_visit",
      "reference_contact",
      "reference_contact",
    ]);
    expect(evidence[0]).toMatchObject({ kind: "site_visit", visitedBy: OPERATOR });
    expect(JSON.stringify(evidence)).not.toContain("documentKey");
  });
});

describe("the server's refusals, as the screen reads them", () => {
  it("an unknown city", async () => {
    const { status, body } = await create(inputOf(initiative({ cityId: crypto.randomUUID() })));
    expect(status).toBe(400);
    expect(createRefusalOf(body)).toEqual({ kind: "unknown_city" });
  });

  it.each(["UA01", "UA85"])(
    "accepts a settlement of region %s like any other region",
    async (code) => {
      const region = REGIONS.find((r) => r.code === code);
      const city = makeCity({ regionId: region?.id as never });
      await cityRepo(db).insert(city);
      expect((await create(inputOf(initiative({ cityId: city.id })))).status).toBe(200);
    },
  );

  it("a retired settlement is an unknown city", async () => {
    await db.update(cities).set({ retiredInEdition: "2026-01" }); // the only city there is
    const { status, body } = await create(inputOf(initiative()));
    expect(status).toBe(400);
    expect(createRefusalOf(body)).toEqual({ kind: "unknown_city" });
  });

  it("an input the contract refuses is not mistaken for an unknown city", async () => {
    const input = inputOf(initiative());
    const { status, body } = await create({ ...input, displayName: " " });
    expect(status).toBe(400);
    expect(createRefusalOf(body)).toEqual({ kind: "failed" });
  });

  it("the first admin's address is an operator's", async () => {
    await db
      .insert(superAdmins)
      .values({ id: crypto.randomUUID(), userId: OPERATOR, grantedAt: NOW });
    const { status, body } = await create(inputOf(initiative({ adminEmail: "op@example.org" })));
    expect(status).toBe(409);
    expect(createRefusalOf(body)).toEqual({ kind: "address_has_a_role", reason: "operator" });
  });

  it("the first admin's address holds a live invitation to another shelter", async () => {
    expect((await create(inputOf(initiative()))).status).toBe(200);
    const { status, body } = await create(inputOf(initiative({ displayName: "Інший притулок" })));
    expect(status).toBe(409);
    expect(createRefusalOf(body)).toEqual({
      kind: "address_has_a_role",
      reason: "invited_elsewhere",
    });
  });
});

/**
 * The Kyiv boundary end to end (Oleksii, 2026-10-17: "the site-visit "not
 * in the future" check uses the Kyiv calendar date, not UTC"): at 22:30 UTC
 * on the 7th it is already the 8th in Kyiv (00:30 or 01:30).
 */
describe("a site visit's date on the server, Kyiv's calendar", () => {
  const justAfterKyivMidnight = new Date("2026-10-07T22:30:00.000Z");
  const visitOn = (visitedOn: string): CreateShelterForm =>
    initiative({ evidence: [{ id: "v", kind: "site_visit", visitedOn, notes: "Сьогодні." }] });

  it("accepts Kyiv's today just after local midnight, while UTC's date is still yesterday", async () => {
    const { status } = await create(
      inputOf(visitOn("2026-10-08"), justAfterKyivMidnight),
      justAfterKyivMidnight,
    );
    expect(status).toBe(200);
  });

  it("refuses Kyiv's tomorrow, and the screen reads the refusal as the site-visit message", async () => {
    // Mapped a day later, so the form's own check lets it through and the server decides.
    const input = inputOf(visitOn("2026-10-09"), new Date("2026-10-09T07:00:00.000Z"));
    const { status, body } = await create(input, justAfterKyivMidnight);
    expect(status).toBe(422);
    expect(createRefusalOf(body)).toEqual({ kind: "site_visit_in_future" });
  });
});
