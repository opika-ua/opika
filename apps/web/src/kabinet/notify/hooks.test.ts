import type { RegistryShelterView } from "@opika/contracts";
import { cityRepo, kabinetShelterRepo } from "@opika/db/repos";
import { authMember, authUser, shelters } from "@opika/db/schema";
import { makeCity, makeShelter, setupTestDatabase, truncateAll } from "@opika/db/test";
import {
  type ModeratorId,
  type Shelter,
  type ShelterAdminId,
  type ShelterVerification,
  testOnlyLocationPolicy,
} from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inMemoryRateLimiter } from "../../api/rate-limit";
import { fromRpcBody, toRpcBody } from "../../api/test-harness";
import { SHELTER_WRITE_POLICY } from "../access";
import type { KabinetPrincipal } from "../actor";
import { capturingInvitationSender } from "../email-senders";
import { write } from "../handlers/profile";
import { writePlanned } from "../handlers/registry-writes";
import { capturingPasswordMail } from "../password-mail";
import { PHOTO_UPLOADS_NOT_CONFIGURED } from "../photo-uploads";
import { handleKabinetRpc } from "../rpc-route";
import { TEST_SESSION_COOKIE } from "../test-session-cookie";
import { notifyAfterWrite } from "./after-write";
import type { HistoryLine } from "./intents";
import { depsOf, fakeMail, NOW, seedOperator, seedShelter, seedUser } from "./test-utils/fixtures";

/**
 * The two write choke points hand a committed write to the notifier, through the served router.
 * The notifier here is the real `notifyAfterWrite` over a fake provider, awaited at the end of
 * each call in place of `after()`.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const OPERATOR = "0ec0ec0e-0000-4000-8000-000000000001" as ModeratorId;
const asOperator: KabinetPrincipal = { kind: "super_admin", moderatorId: OPERATOR };
const policy = testOnlyLocationPolicy("hooks-test");
const limiters = {
  perUser: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
  perIp: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
};

let provider: ReturnType<typeof fakeMail>;
let handedOver: { shelter: Shelter; lines: readonly HistoryLine[] }[];
let scheduled: Promise<void>[];
let notifierThrows: boolean;

beforeEach(async () => {
  await truncateAll(db);
  provider = fakeMail();
  handedOver = [];
  scheduled = [];
  notifierThrows = false;
});

async function call<T = Record<string, unknown>>(
  path: string,
  input: unknown,
  principal: KabinetPrincipal,
): Promise<{ status: number; body: T }> {
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
      newId: () => crypto.randomUUID(),
      operatorDisplayName: "Олексій",
      locationPolicy: policy,
      production: false,
      shelterWrites: SHELTER_WRITE_POLICY,
      notify: (shelter, lines) => {
        handedOver.push({ shelter, lines });
        if (notifierThrows) throw new Error("no request scope");
        scheduled.push(notifyAfterWrite(depsOf(db, provider.mail), shelter, lines));
      },
    },
  );
  await Promise.all(scheduled);
  const text = await response.text();
  return { status: response.status, body: (text ? fromRpcBody(JSON.parse(text)) : null) as T };
}

const evidence = { items: [], submittedAt: NOW };
const REJECTED = {
  status: "rejected",
  rejectedAt: NOW,
  rejectedBy: OPERATOR,
  reason: { code: "insufficient_evidence", note: null },
  evidence,
} as unknown as ShelterVerification;
const LINK = { url: "https://send.monobank.ua/jar/abc", provider: "monobank_jar" } as const;
const sentTo = () => provider.sent.map((email) => email.to).sort();

const EVIDENCE_INPUT = [
  { kind: "edrpou_registration", edrpou: "12345678", registeredName: "ГО Лапа" },
  { kind: "bank_account_holder", holderName: "ГО Лапа" },
  {
    kind: "reference_contact",
    name: "Ветклініка",
    channel: { kind: "phone", e164: "+380501112233" },
    relationship: "veterinary_clinic",
  },
  { kind: "site_visit", visitedOn: "2026-10-12", notes: "Був на місці" },
];

describe("registry writes", () => {
  it("an approval is mailed to every member of that shelter and not to a pending invitee", async () => {
    // The inviter of the first admin must exist as a user.
    await db.insert(authUser).values({
      id: OPERATOR,
      name: "Оператор",
      email: "op@example.org",
      emailVerified: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const city = makeCity();
    await cityRepo(db).insert(city);
    const base = makeShelter();
    const { cityId: _drop, ...street } = base.exactAddress;
    const created = await call<RegistryShelterView>(
      "registry.shelters.create",
      {
        displayName: "Лапа допомоги",
        cityId: city.id,
        description: base.description,
        legalEntity: base.legalEntity,
        exactAddress: street,
        contact: base.contact,
        evidence: EVIDENCE_INPUT,
        firstAdmin: { name: "Олена", email: "Olena@Example.org" },
      },
      asOperator,
    );
    expect(created.status).toBe(200);
    expect(handedOver).toEqual([]);
    const [row] = await db.select().from(shelters);
    const organizationId = row?.organizationId ?? "";
    for (const email of ["one@example.org", "two@example.org"]) {
      await db.insert(authMember).values({
        id: crypto.randomUUID(),
        organizationId,
        userId: await seedUser(db, email),
        role: "admin",
        createdAt: NOW,
      });
    }
    const id = created.body.id;
    expect(
      (await call("registry.verification.startReview", { shelterId: id }, asOperator)).status,
    ).toBe(200);
    expect(provider.sent).toEqual([]);
    const approved = await call("registry.verification.approve", { shelterId: id }, asOperator);
    expect(approved.status).toBe(200);
    expect(sentTo()).toEqual(["one@example.org", "two@example.org"]);
    expect(provider.sent[0]?.subject).toBe("Притулок пройшов перевірку");
  });

  it("the operator's own resubmit records history but mails nobody", async () => {
    await seedOperator(db, "op@example.org");
    const { shelter } = await seedShelter(db, {
      admins: ["shelter@example.org"],
      overrides: { verification: REJECTED } as Partial<Shelter>,
    });
    const result = await call(
      "registry.verification.resubmit",
      { shelterId: shelter.id, evidence: EVIDENCE_INPUT },
      asOperator,
    );
    expect(result.status).toBe(200);
    expect(handedOver).toHaveLength(1);
    expect(provider.sent).toEqual([]);
  });

  it("an approved donation link is mailed to the admins, and a stale version sends nothing", async () => {
    const { shelter } = await seedShelter(db, {
      admins: ["shelter@example.org"],
      overrides: {
        pendingDonation: { link: LINK, proposedAt: NOW, proposedBy: null },
      } as Partial<Shelter>,
    });
    const stale = await call(
      "registry.donation.approve",
      { shelterId: shelter.id, expectedVersion: 99 },
      asOperator,
    );
    expect(stale.status).toBe(409);
    expect(handedOver).toEqual([]);
    expect(provider.sent).toEqual([]);
    const approved = await call(
      "registry.donation.approve",
      { shelterId: shelter.id, expectedVersion: shelter.version },
      asOperator,
    );
    expect(approved.status).toBe(200);
    expect(sentTo()).toEqual(["shelter@example.org"]);
    expect(provider.sent[0]?.text).toContain("send.monobank.ua");
  });

  it("a decision with nothing pending writes nothing and mails nothing", async () => {
    const { shelter } = await seedShelter(db, { admins: ["shelter@example.org"] });
    const result = await call(
      "registry.donation.reject",
      { shelterId: shelter.id, expectedVersion: shelter.version },
      asOperator,
    );
    expect(result.status).toBe(200);
    expect(handedOver).toEqual([]);
    expect(provider.sent).toEqual([]);
  });
});

describe("the shelter's own writes", () => {
  const ADMIN = "33333333-3333-4333-8333-333333333333" as ShelterAdminId;
  const asAdmin = (shelter: Shelter): KabinetPrincipal => ({
    kind: "shelter_admin",
    shelterAdminId: ADMIN,
    shelterId: shelter.id,
  });

  it("asking for another review mails every operator", async () => {
    await seedOperator(db, "op1@example.org");
    await seedOperator(db, "op2@example.org");
    const { shelter } = await seedShelter(db, {
      admins: ["shelter@example.org"],
      overrides: { verification: REJECTED } as Partial<Shelter>,
    });
    const result = await call("shelter.verification.requestReview", {}, asAdmin(shelter));
    expect(result.status).toBe(200);
    expect(sentTo()).toEqual(["op1@example.org", "op2@example.org"]);
    expect(provider.sent[0]?.subject).toBe("Повторна перевірка: Тестовий притулок");
  });

  it("proposing a donation link mails the operators its host", async () => {
    await seedOperator(db, "op@example.org");
    const { shelter } = await seedShelter(db, { admins: ["shelter@example.org"] });
    const result = await call(
      "shelter.profile.proposeDonation",
      { url: "https://send.monobank.ua/jar/abc" },
      asAdmin(shelter),
    );
    expect(result.status).toBe(200);
    expect(sentTo()).toEqual(["op@example.org"]);
    expect(provider.sent[0]?.text).toContain("send.monobank.ua");
    expect(provider.sent[0]?.text).not.toContain("/jar/abc");
  });

  it("a write that is not a mail event hands over a line and mails nobody", async () => {
    await seedOperator(db, "op@example.org");
    const { shelter } = await seedShelter(db, { admins: ["shelter@example.org"] });
    const result = await call(
      "shelter.profile.updateContact",
      { contact: shelter.contact, expectedVersion: shelter.version },
      asAdmin(shelter),
    );
    expect(result.status).toBe(200);
    expect(provider.sent).toEqual([]);
  });

  it("a notifier that throws never fails the saved change", async () => {
    await seedOperator(db, "op@example.org");
    const { shelter } = await seedShelter(db, { admins: ["shelter@example.org"] });
    notifierThrows = true;
    const result = await call(
      "shelter.profile.proposeDonation",
      { url: "https://send.monobank.ua/jar/abc" },
      asAdmin(shelter),
    );
    expect(result.status).toBe(200);
    expect(handedOver).toHaveLength(1);
    expect(provider.sent).toEqual([]);
  });

  it("a provider that is down never fails the saved change either", async () => {
    await seedOperator(db, "op@example.org");
    const { shelter } = await seedShelter(db, { admins: ["shelter@example.org"] });
    provider.state.failing = true;
    const result = await call(
      "shelter.profile.proposeDonation",
      { url: "https://send.monobank.ua/jar/abc" },
      asAdmin(shelter),
    );
    expect(result.status).toBe(200);
  });
});
describe("a repeat of the link already waiting", () => {
  const ADMIN = "33333333-3333-4333-8333-333333333333" as ShelterAdminId;

  it("writes no history line, hands nothing over and mails nobody", async () => {
    await seedOperator(db, "op@example.org");
    const { shelter } = await seedShelter(db, { admins: ["shelter@example.org"] });
    const principal: KabinetPrincipal = {
      kind: "shelter_admin",
      shelterAdminId: ADMIN,
      shelterId: shelter.id,
    };
    const url = { url: "https://send.monobank.ua/jar/abc" };
    expect((await call("shelter.profile.proposeDonation", url, principal)).status).toBe(200);
    expect(provider.sent).toHaveLength(1);
    const again = await call("shelter.profile.proposeDonation", url, principal);
    expect(again.status).toBe(200);
    expect(handedOver).toHaveLength(1);
    expect(provider.sent).toHaveLength(1);
    const lines = await kabinetShelterRepo(db).historyOf(shelter.id);
    expect(lines.filter((line) => line.kind === "donation_proposed")).toHaveLength(1);
  });

  it("five different links in a day still mail each operator once", async () => {
    await seedOperator(db, "op1@example.org");
    await seedOperator(db, "op2@example.org");
    const { shelter } = await seedShelter(db, { admins: ["shelter@example.org"] });
    const principal: KabinetPrincipal = {
      kind: "shelter_admin",
      shelterAdminId: ADMIN,
      shelterId: shelter.id,
    };
    for (let n = 0; n < 5; n += 1) {
      const result = await call(
        "shelter.profile.proposeDonation",
        { url: `https://send.monobank.ua/jar/${n}` },
        principal,
      );
      expect(result.status).toBe(200);
    }
    expect(handedOver).toHaveLength(5);
    expect(sentTo()).toEqual(["op1@example.org", "op2@example.org"]);
  });
});

describe("hand-over happens only when the write landed", () => {
  const ADMIN = "33333333-3333-4333-8333-333333333333" as ShelterAdminId;
  const link = { url: "https://send.monobank.ua/jar/abc", provider: "monobank_jar" } as const;
  const proposed = (at: Date) =>
    ({
      kind: "donation_proposed",
      at,
      actor: { kind: "shelter_admin", shelterAdminId: ADMIN },
      link,
    }) as const;
  const change = (at: Date) =>
    ({
      kind: "pending_donation",
      pendingDonation: { link, proposedAt: at, proposedBy: ADMIN },
    }) as const;

  it("registry writePlanned hands over on ok and not on a lost compare-and-set", async () => {
    const { shelter } = await seedShelter(db, { admins: ["shelter@example.org"] });
    const calls: unknown[] = [];
    const deps = {
      db,
      now: NOW,
      newId: () => crypto.randomUUID(),
      operatorDisplayName: "Олексій",
      invites: capturingInvitationSender(),
      linkBaseURL: "http://localhost",
      notify: (...args: unknown[]) => {
        calls.push(args);
      },
    };
    const plan = { changes: [change(NOW)], entries: [proposed(NOW)] };
    const stale = { ...shelter, version: shelter.version + 5 };
    expect(await writePlanned(deps, stale, plan)).toBe("conflict");
    expect(calls).toEqual([]);
    expect(await kabinetShelterRepo(db).historyOf(shelter.id)).toEqual([]);
    expect(await writePlanned(deps, shelter, plan)).toBe("ok");
    expect(calls).toHaveLength(1);
  });

  it("the shelter's own write hands over on ok and not on a lost compare-and-set", async () => {
    const { shelter } = await seedShelter(db, { admins: ["shelter@example.org"] });
    const calls: unknown[] = [];
    const deps = {
      db,
      now: NOW,
      newId: () => crypto.randomUUID(),
      photoUploads: PHOTO_UPLOADS_NOT_CONFIGURED,
      notify: (...args: unknown[]) => {
        calls.push(args);
      },
    };
    const plan = { kind: "write", change: change(NOW), entry: proposed(NOW) } as const;
    const lost = await write(deps, shelter, shelter.version + 5, plan);
    expect(lost.kind).toBe("conflict");
    expect(calls).toEqual([]);
    expect((await write(deps, shelter, shelter.version, plan)).kind).toBe("ok");
    expect(calls).toHaveLength(1);
  });
});
