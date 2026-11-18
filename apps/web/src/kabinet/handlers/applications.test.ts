import { randomUUID } from "node:crypto";
import { ApplicationsQueueViewSchema, apiErrors } from "@opika/contracts";
import {
  animalRepo,
  cityRepo,
  funnelRepo,
  kabinetInvitationRepo,
  kabinetShelterRepo,
  shelterRepo,
} from "@opika/db/repos";
import { authMember, authUser, funnelEvents } from "@opika/db/schema";
import {
  makeCity,
  makeDraftAnimal,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "@opika/db/test";
import {
  type CityId,
  type ModeratorId,
  type Shelter,
  type ShelterAdminId,
  type ShelterId,
  testOnlyLocationPolicy,
} from "@opika/domain";
import { createORPCErrorConstructorMap, ORPCError } from "@orpc/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inMemoryRateLimiter } from "../../api/rate-limit";
import { fromRpcBody, toRpcBody } from "../../api/test-harness";
import { SHELTER_WRITE_POLICY } from "../access";
import type { KabinetPrincipal } from "../actor";
import { capturingInvitationSender } from "../email-senders";
import { fakeMail } from "../notify/test-utils/fixtures";
import { capturingPasswordMail } from "../password-mail";
import type { TransactionalMail } from "../registration/registration-mail";
import { handleKabinetRpc } from "../rpc-route";
import { roomyCitySearch } from "../test-city-search";
import { TEST_SESSION_COOKIE } from "../test-session-cookie";
import {
  type ApplicationsDeps,
  applicationsAccept,
  applicationsList,
  applicationsReject,
} from "./applications";
import { sendApplicationDecision } from "./applications-mail";

/** The operator's queue (Agent 2): what each decision writes, mails and refuses. */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const NOW = new Date("2026-11-20T10:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const OPERATOR = "0ec0ec0e-0000-4000-8000-000000000001" as ModeratorId;
const LINK = "https://www.instagram.com/lapa_help/";
const errors = createORPCErrorConstructorMap({
  CONFLICT: apiErrors.CONFLICT,
  NOT_FOUND: apiErrors.NOT_FOUND,
});

let cityId: CityId;
let provider: ReturnType<typeof fakeMail>;
let sends: Promise<unknown>[];

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  cityId = city.id;
  provider = fakeMail();
  sends = [];
});

/** The real send-once path over a fake provider; `settled()` awaits what `after()` would run. */
const transactional = (): TransactionalMail => ({
  mail: {
    deps: { db, mail: provider.mail, now: () => NOW, log: () => {} },
    baseURL: "https://example.org",
    operatorName: "Олексій",
  },
  schedule: (work) => {
    sends.push(work());
  },
});
const settled = () => Promise.all(sends);

const deps = (now = NOW): ApplicationsDeps => ({
  db,
  now,
  newId: () => randomUUID(),
  transactionalMail: transactional(),
});

async function user(email: string, emailVerified: boolean): Promise<string> {
  const id = randomUUID();
  await db
    .insert(authUser)
    .values({ id, name: "Олена", email, emailVerified, createdAt: NOW, updatedAt: NOW });
  return id;
}

const inCity = (overrides: Partial<Shelter> = {}) =>
  makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId } as never,
    ...overrides,
  } as never);

async function application(
  input: {
    email?: string;
    confirmed?: boolean;
    name?: string;
    appliedAt?: Date;
    withLink?: boolean;
  } = {},
): Promise<{ id: ShelterId; version: number; registrant: string }> {
  const appliedAt = input.appliedAt ?? new Date(NOW.getTime() - HOUR);
  const items = input.withLink === false ? [] : [{ kind: "public_link" as const, url: LINK }];
  const shelter = inCity({
    displayName: input.name ?? "Лапа допомоги",
    verification: { status: "application", appliedAt, evidence: { items, submittedAt: appliedAt } },
  });
  await shelterRepo(db).insert(shelter);
  const registrant = await user(input.email ?? "lapa@example.org", input.confirmed ?? true);
  await raw`UPDATE shelters SET registrant_user_id = ${registrant} WHERE id = ${shelter.id}`;
  return { id: shelter.id, version: shelter.version, registrant };
}

/**
 * The two fixture writes no repo makes yet (the registrant is the registration write's, Agent 1),
 * as raw SQL: this package has no query builder operators of its own.
 */
const raw = (strings: TemplateStringsArray, ...values: unknown[]) =>
  (
    db as unknown as { $client: (s: TemplateStringsArray, ...v: unknown[]) => Promise<unknown> }
  ).$client(strings, ...values);

const statusOf = async (id: ShelterId) => (await shelterRepo(db).findById(id))?.verification.status;
const historyOf = (id: ShelterId) => kabinetShelterRepo(db).historyOf(id);
const REASON = { code: "duplicate_submission" as const, note: null };

describe("registry.applications.accept", () => {
  it("is refused while the email is unconfirmed, and writes and mails nothing", async () => {
    const app = await application({ confirmed: false });
    const result = await applicationsAccept(
      deps(),
      OPERATOR,
      { shelterId: app.id, expectedVersion: app.version },
      errors,
    );
    expect(result).toEqual({ kind: "email_unconfirmed" });
    expect(await statusOf(app.id)).toBe("application");
    expect(await historyOf(app.id)).toEqual([]);
    await settled();
    expect(provider.sent).toEqual([]);
  });

  it("moves to pending with the early listing starting now, records approved, mails once", async () => {
    const app = await application();
    const result = await applicationsAccept(
      deps(),
      OPERATOR,
      { shelterId: app.id, expectedVersion: app.version },
      errors,
    );
    expect(result).toEqual({ kind: "decided", status: "pending" });
    const shelter = await shelterRepo(db).findById(app.id);
    expect(shelter?.earlyListingSince).toEqual(NOW);
    const history = await historyOf(app.id);
    expect(history.map((entry) => entry.kind).sort()).toEqual([
      "early_listing_allowed",
      "verification",
    ]);
    const line = history.find((entry) => entry.kind === "verification");
    expect(line?.kind === "verification" && line.event).toMatchObject({
      type: "accept_application",
      moderatorId: OPERATOR,
    });
    expect((await funnelRepo(db).countsSince(NOW)).approved).toBe(1);
    await settled();
    expect(provider.sent.map((email) => email.to)).toEqual(["lapa@example.org"]);
    expect(provider.sent[0]?.subject).toContain("Лапа допомоги");
  });

  it("a second click answers already_decided and mails nobody again", async () => {
    const app = await application();
    const input = { shelterId: app.id, expectedVersion: app.version };
    await applicationsAccept(deps(), OPERATOR, input, errors);
    const second = await applicationsAccept(deps(), OPERATOR, input, errors);
    expect(second).toEqual({ kind: "already_decided", status: "pending" });
    expect(await historyOf(app.id)).toHaveLength(2);
    await settled();
    expect(provider.sent).toHaveLength(1);
  });

  it("a double click at once: one decision, one set of lines, one email", async () => {
    const app = await application();
    const input = { shelterId: app.id, expectedVersion: app.version };
    const results = await Promise.all([
      applicationsAccept(deps(), OPERATOR, input, errors),
      applicationsAccept(deps(), OPERATOR, input, errors),
    ]);
    expect(results.map((result) => result.kind).sort()).toEqual(["already_decided", "decided"]);
    expect(await historyOf(app.id)).toHaveLength(2);
    expect((await funnelRepo(db).countsSince(NOW)).approved).toBe(1);
    await settled();
    expect(provider.sent).toHaveLength(1);
  });

  it("the same decision email is sent once even if handed over twice", async () => {
    const app = await application();
    await applicationsAccept(
      deps(),
      OPERATOR,
      { shelterId: app.id, expectedVersion: app.version },
      errors,
    );
    await sendApplicationDecision(transactional().mail, {
      kind: "approved",
      shelterId: app.id,
      name: "Лапа допомоги",
      to: "lapa@example.org",
      recipientUserId: randomUUID(),
    });
    await settled();
    expect(provider.sent).toHaveLength(1);
  });

  it("an applicant's edit since the card was read is CONFLICT, and nothing is written", async () => {
    const app = await application();
    await expect(
      applicationsAccept(
        deps(),
        OPERATOR,
        { shelterId: app.id, expectedVersion: app.version + 1 },
        errors,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await statusOf(app.id)).toBe("application");
    expect(await historyOf(app.id)).toEqual([]);
  });

  it("an unknown shelter is NOT_FOUND", async () => {
    const error = await applicationsAccept(
      deps(),
      OPERATOR,
      { shelterId: randomUUID() as ShelterId, expectedVersion: 0 },
      errors,
    ).catch((caught: unknown) => caught);
    expect(error instanceof ORPCError && error.code).toBe("NOT_FOUND");
  });

  it("an operator-created shelter is already_decided, never moved", async () => {
    const shelter = inCity({
      verification: {
        status: "pending",
        submittedAt: NOW,
        evidence: { items: [], submittedAt: NOW },
      },
    });
    await shelterRepo(db).insert(shelter);
    const result = await applicationsAccept(
      deps(),
      OPERATOR,
      { shelterId: shelter.id, expectedVersion: shelter.version },
      errors,
    );
    expect(result).toEqual({ kind: "already_decided", status: "pending" });
    expect(await historyOf(shelter.id)).toEqual([]);
  });
});

describe("registry.applications.reject", () => {
  it("rejects at the application stage, sets application_rejected_at, mails the reason once", async () => {
    const app = await application({ confirmed: false });
    const input = { shelterId: app.id, expectedVersion: app.version, reason: REASON };
    expect(await applicationsReject(deps(), OPERATOR, input, errors)).toEqual({
      kind: "decided",
      status: "rejected",
    });
    const row = await db.query.shelters.findFirst({ where: (t, { eq }) => eq(t.id, app.id) });
    expect(row?.applicationRejectedAt).toEqual(NOW);
    expect(row?.verification).toMatchObject({ status: "rejected", stage: "application" });
    expect(await historyOf(app.id)).toHaveLength(1);
    expect(await applicationsReject(deps(), OPERATOR, input, errors)).toEqual({
      kind: "already_decided",
      status: "rejected",
    });
    await settled();
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]?.text).toContain("Такий притулок уже є на Opika");
    // Nothing public came of it, so nothing counts as approved.
    expect((await funnelRepo(db).countsSince(NOW)).approved).toBe(0);
  });
});

describe("registry.applications.list", () => {
  it("cards oldest first, with the link, contact, email status and drafts", async () => {
    const newer = await application({ email: "new@example.org", confirmed: false });
    const older = await application({
      email: "old@example.org",
      name: "Старший притулок",
      appliedAt: new Date(NOW.getTime() - 40 * HOUR),
    });
    const draft = makeDraftAnimal({ shelterId: newer.id });
    await animalRepo(db).insert(draft, cityId);
    await raw`UPDATE animals SET photos = '[{}, {}]'::jsonb WHERE id = ${draft.id}`;
    const view = await applicationsList(deps(), OPERATOR);
    expect(view.applications.map((card) => card.shelterId)).toEqual([older.id, newer.id]);
    const card = view.applications[1];
    expect(card).toMatchObject({
      name: "Лапа допомоги",
      cityId,
      link: LINK,
      email: "new@example.org",
      emailStatus: "unconfirmed",
      contact: { kind: "phone" },
      drafts: { animals: 1, photos: 2 },
    });
    expect(view.applications[0]?.emailStatus).toBe("confirmed");
    expect(() => ApplicationsQueueViewSchema.parse(view)).not.toThrow();
  });

  it("flags duplicates: the same name in the same city, the same email, the same link", async () => {
    const app = await application({ email: "lapa@example.org", name: "ГО «Лапа допомоги»" });
    const sameName = inCity({ displayName: "Притулок Лапа допомоги" });
    const sameLink = inCity({
      displayName: "Інший",
      contact: { primary: { kind: "instagram", handle: "lapa_help" }, additional: [] },
    });
    const sameEmail = inCity({ displayName: "Третій" });
    const unrelated = inCity({ displayName: "Зовсім інший" });
    for (const shelter of [sameName, sameLink, sameEmail, unrelated]) {
      await shelterRepo(db).insert(shelter);
    }
    const organizationId = await kabinetInvitationRepo(db).ensureOrganization(
      sameEmail.id,
      { organizationId: randomUUID() },
      NOW,
    );
    // The applicant's own address already administers another shelter.
    await db.insert(authMember).values({
      id: randomUUID(),
      organizationId,
      userId: app.registrant,
      role: "admin",
      createdAt: NOW,
    });

    const [card] = (await applicationsList(deps(), OPERATOR)).applications;
    expect(card?.shelterId).toBe(app.id);
    expect(
      [...(card?.duplicates ?? [])].map((signal) => `${signal.kind}:${signal.shelterName}`).sort(),
    ).toEqual(["same_email:Третій", "same_link:Інший", "same_name_city:Притулок Лапа допомоги"]);
  });

  it("lists an accepted application while it is early-listed, with its days left", async () => {
    const app = await application();
    await applicationsAccept(
      deps(),
      OPERATOR,
      { shelterId: app.id, expectedVersion: app.version },
      errors,
    );
    const view = await applicationsList(deps(new Date(NOW.getTime() + 24 * HOUR)), OPERATOR);
    expect(view.applications).toEqual([]);
    expect(view.listedUnverified).toEqual([
      expect.objectContaining({ shelterId: app.id, daysLeft: 59, remind: false }),
    ]);
  });

  it("counts the funnel's steps over the last 30 days only", async () => {
    const a = await application({ email: "a@example.org" });
    const b = await application({ email: "b@example.org" });
    const funnel = funnelRepo(db);
    await funnel.record("registered", a.id, NOW);
    await funnel.record("registered", b.id, new Date(NOW.getTime() - 31 * 24 * HOUR));
    await funnel.record("email_confirmed", a.id, NOW);
    await funnel.record("email_confirmed", a.id, NOW);
    const { funnel: counts } = await applicationsList(deps(), OPERATOR);
    expect(counts.windowDays).toBe(30);
    expect(Object.fromEntries(counts.counts.map((row) => [row.kind, row.count]))).toEqual({
      registered: 1,
      email_confirmed: 1,
      first_draft: 0,
      approved: 0,
      first_published: 0,
    });
    expect(await db.select().from(funnelEvents)).toHaveLength(3);
  });
});

describe("a card the queue can't fully read (one bad row never fails the block)", () => {
  let warnings: string[];
  beforeEach(() => {
    warnings = [];
    vi.spyOn(console, "warn").mockImplementation((line: string) => {
      warnings.push(line);
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("an application with no submitted link keeps its own card, saying so, beside the others", async () => {
    const good = await application({ email: "good@example.org" });
    const linkless = await application({ email: "nolink@example.org", withLink: false });
    await funnelRepo(db).record("registered", good.id, NOW);
    const view = await applicationsList(deps(), OPERATOR);
    expect(() => ApplicationsQueueViewSchema.parse(view)).not.toThrow();
    const cards = new Map(view.applications.map((card) => [card.shelterId, card]));
    expect(cards.get(good.id)?.link).toBe(LINK);
    expect(cards.get(linkless.id)).toMatchObject({ link: null, email: "nolink@example.org" });
    expect(view.unreadable).toEqual([]);
    expect(view.funnel.counts.find((row) => row.kind === "registered")?.count).toBe(1);
    expect(warnings).toEqual([`[applications] ${linkless.id}: application_link_missing`]);
  });

  it("a row that can't make a valid card is named by id alone and logged by reason only", async () => {
    const good = await application({ email: "good@example.org" });
    const broken = await application({ email: "not-an-address", name: "Зламана заявка" });
    const view = await applicationsList(deps(), OPERATOR);
    expect(() => ApplicationsQueueViewSchema.parse(view)).not.toThrow();
    expect(view.applications.map((card) => card.shelterId)).toEqual([good.id]);
    expect(view.unreadable).toEqual([{ shelterId: broken.id }]);
    // The field and the issue, never the value («not-an-address») or the name.
    expect(warnings).toEqual([
      `[applications] ${broken.id}: application_unreadable (email:invalid_format)`,
    ]);
  });
});

describe("through the served route", () => {
  const limiters = {
    perUser: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
    perIp: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
  };

  async function call(
    path: string,
    input: unknown,
    principal: KabinetPrincipal,
    extra: Partial<Parameters<typeof handleKabinetRpc>[1]> = {},
  ) {
    const response = await handleKabinetRpc(
      new Request(`http://localhost/api/kabinet/${path.replaceAll(".", "/")}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
          cookie: TEST_SESSION_COOKIE,
        },
        body: JSON.stringify(toRpcBody(input)),
      }),
      {
        availability: {
          kind: "available",
          passwordMail: capturingPasswordMail(),
          sender: { send: async () => {} },
          invites: capturingInvitationSender(),
          secret: "x",
          baseURL: "http://localhost",
        },
        resolve: async () => ({ principal, userId: OPERATOR, db, cursorSecret: "test-cursor" }),
        limiters,
        ip: "203.0.113.1",
        now: NOW,
        newId: () => randomUUID(),
        operatorDisplayName: "Олексій",
        locationPolicy: testOnlyLocationPolicy("applications-test"),
        production: false,
        shelterWrites: SHELTER_WRITE_POLICY,
        citySearch: roomyCitySearch(),
        ...extra,
      },
    );
    const text = await response.text();
    return { status: response.status, body: text ? fromRpcBody(JSON.parse(text)) : null };
  }

  it("the operator reads the queue and decides; a shelter admin gets nothing", async () => {
    const app = await application();
    const asOperator: KabinetPrincipal = { kind: "super_admin", moderatorId: OPERATOR };
    const list = await call("registry.applications.list", {}, asOperator);
    expect(list.status).toBe(200);
    expect(ApplicationsQueueViewSchema.parse(list.body).applications).toHaveLength(1);
    const admin: KabinetPrincipal = {
      kind: "shelter_admin",
      shelterAdminId: randomUUID() as ShelterAdminId,
      shelterId: app.id,
    };
    const input = { shelterId: app.id, expectedVersion: app.version };
    expect((await call("registry.applications.accept", input, admin)).status).toBe(403);
    expect(await statusOf(app.id)).toBe("application");
    const accepted = await call("registry.applications.accept", input, asOperator);
    expect(accepted).toEqual({ status: 200, body: { kind: "decided", status: "pending" } });
  });

  const asOperator: KabinetPrincipal = { kind: "super_admin", moderatorId: OPERATOR };

  it("a decision is mailed through the context's transactional mail, with no notifier set", async () => {
    const app = await application();
    const accepted = await call(
      "registry.applications.accept",
      { shelterId: app.id, expectedVersion: app.version },
      asOperator,
      { transactionalMail: () => transactional() },
    );
    expect(accepted.body).toEqual({ kind: "decided", status: "pending" });
    await settled();
    expect(provider.sent.map((email) => email.to)).toEqual(["lapa@example.org"]);
  });

  it("without one (a non-served context) no decision email goes, even with a notifier set", async () => {
    const app = await application();
    const rejected = await call(
      "registry.applications.reject",
      { shelterId: app.id, expectedVersion: app.version, reason: REASON },
      asOperator,
      { notify: () => {} },
    );
    expect(rejected.body).toEqual({ kind: "decided", status: "rejected" });
    await settled();
    expect(sends).toEqual([]);
    expect(provider.sent).toEqual([]);
  });
});
