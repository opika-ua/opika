import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { KabinetAnimalView, KabinetShelterView } from "@opika/contracts";
import {
  adopterRepo,
  animalRepo,
  cityRepo,
  kabinetShelterRepo,
  shelterRepo,
  swipeRepo,
} from "@opika/db/repos";
import { shelterHistory } from "@opika/db/schema";
import {
  makeAdopter,
  makeAnimal,
  makeCity,
  makeShelter,
  makeSwipe,
  setupTestDatabase,
  truncateAll,
} from "@opika/db/test";
import { type Animal, type Shelter, type ShelterAdminId, UNDO_WINDOW_MS } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { fromRpcBody, toRpcBody } from "../api/test-harness";
import type { KabinetPrincipal } from "./actor";
import { capturingInvitationSender } from "./email-senders";
import { KABINET_RATE_LIMITS, type KabinetLimiters } from "./rate-limits";
import { handleKabinetRpc } from "./rpc-route";

/**
 * What each shelter procedure does for its own shelter, through the served
 * router (the cross-tenant half is src/api/kabinet-cross-tenant.test.ts).
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const ADMIN = "33333333-3333-4333-8333-333333333333" as ShelterAdminId;
let shelter: Shelter;
let cityId: string;
let asAdmin: KabinetPrincipal;

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  cityId = city.id;
  shelter = makeShelter({ publicLocation: { ...makeShelter().publicLocation, cityId: city.id } });
  await shelterRepo(db).insert(shelter);
  asAdmin = { kind: "shelter_admin", shelterAdminId: ADMIN, shelterId: shelter.id };
});

const generousLimiters = {
  perUser: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
  perIp: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
};

async function call<T = Record<string, unknown>>(
  path: string,
  input: unknown,
  opts: {
    now?: Date;
    principal?: KabinetPrincipal;
    userId?: string | null;
    cursorSecret?: string;
    limiters?: KabinetLimiters;
    ip?: string;
  } = {},
): Promise<{ status: number; body: T }> {
  const request = new Request(`http://localhost/api/kabinet/${path.replaceAll(".", "/")}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify(toRpcBody(input)),
  });
  const response = await handleKabinetRpc(request, {
    availability: {
      kind: "available",
      sender: { send: async () => {} },
      invites: capturingInvitationSender(),
      secret: "x",
      baseURL: "http://localhost",
    },
    limiters: opts.limiters ?? generousLimiters,
    ip: opts.ip ?? "203.0.113.1",
    resolve: async () => ({
      principal: opts.principal ?? asAdmin,
      userId: opts.userId === undefined ? "user-admin" : opts.userId,
      db,
      cursorSecret: opts.cursorSecret ?? "test-cursor-secret",
    }),
    now: opts.now ?? new Date(),
    newId: () => crypto.randomUUID(),
    operatorDisplayName: "Олексій",
    locationPolicy: null,
    production: false,
    // The K2/K3 handlers, exercised with writes opened explicitly (KH-Q1): the
    // served route refuses them (`SHELTER_WRITE_POLICY`), which
    // shelter-writes-refused.test.ts pins.
    shelterWrites: { kind: "open_for_tests_only" },
  });
  const text = await response.text();
  return { status: response.status, body: parsed(text) as T };
}

/** RPC bodies are JSON; a limiter's 429 or a 503 is plain text. */
function parsed(text: string): unknown {
  if (!text) return null;
  try {
    return fromRpcBody(JSON.parse(text));
  } catch {
    return text;
  }
}

async function animal(overrides: Partial<Animal> = {}): Promise<Animal> {
  const a = makeAnimal({ shelterId: shelter.id, ...overrides });
  await animalRepo(db).insert(a, cityId as never);
  return a;
}

type ListBody = {
  items: { id: string }[];
  nextCursor: string | null;
  counts: unknown;
  staleCount: number;
};

const reload = async (id: string) => (await animalRepo(db).findById(id as never)) as Animal;

describe("access, through the served router", () => {
  it("an anonymous caller is UNAUTHENTICATED", async () => {
    expect(
      (await call("shelter.profile.get", {}, { principal: { kind: "anonymous" } })).status,
    ).toBe(401);
  });

  it("a support view reads its shelter and is refused every write", async () => {
    const support: KabinetPrincipal = {
      kind: "support_view",
      moderatorId: "11111111-1111-4111-8111-111111111111" as never,
      shelterId: shelter.id,
    };
    expect((await call("shelter.profile.get", {}, { principal: support })).status).toBe(200);
    expect((await call("shelter.profile.resume", {}, { principal: support })).status).toBe(403);
  });

  it("a super_admin outside support mode reads no shelter's cabinet", async () => {
    const operator: KabinetPrincipal = {
      kind: "super_admin",
      moderatorId: "11111111-1111-4111-8111-111111111111" as never,
    };
    expect((await call("shelter.profile.get", {}, { principal: operator })).status).toBe(403);
  });
});

describe("shelter.profile", () => {
  it("get returns the shelter-facing view: no evidence, no moderator ids", async () => {
    const result = await call("shelter.profile.get", {});
    expect(result.status).toBe(200);
    expect(result.body.verification).toEqual({ status: "verified", since: expect.any(Date) });
    expect(JSON.stringify(result.body)).not.toContain("evidence");
    expect(JSON.stringify(result.body)).not.toContain("verifiedBy");
  });

  it("updateContact writes, bumps the version and records who changed what", async () => {
    const next = { primary: { kind: "telegram", handle: "lapa_shelter" }, additional: [] };
    const result = await call("shelter.profile.updateContact", {
      contact: next,
      expectedVersion: 0,
    });
    expect(result.status).toBe(200);
    expect(result.body.version).toBe(1);
    expect(await kabinetShelterRepo(db).historyOf(shelter.id)).toMatchObject([
      {
        kind: "contact_changed",
        previous: shelter.contact,
        next,
        actor: { kind: "shelter_admin", shelterAdminId: ADMIN },
      },
    ]);
  });

  it("updateContact from a stale form is CONFLICT and writes nothing", async () => {
    const next = { primary: { kind: "telegram", handle: "lapa_shelter" }, additional: [] };
    expect(
      (await call("shelter.profile.updateContact", { contact: next, expectedVersion: 3 })).status,
    ).toBe(409);
    expect((await shelterRepo(db).findById(shelter.id))?.contact).toEqual(shelter.contact);
    expect(await kabinetShelterRepo(db).historyOf(shelter.id)).toEqual([]);
  });

  it("updateFreshnessSentence writes, bumps the version and records previous and next", async () => {
    const next = { uk: "Оновлюємо картки щосуботи.", en: null };
    const result = await call<KabinetShelterView>("shelter.profile.updateFreshnessSentence", {
      freshnessSentence: next,
      expectedVersion: 0,
    });
    expect(result.status).toBe(200);
    expect(result.body.version).toBe(1);
    expect(result.body.freshnessSentence).toEqual(next);
    expect(await kabinetShelterRepo(db).historyOf(shelter.id)).toMatchObject([
      {
        kind: "freshness_sentence_changed",
        previous: shelter.freshnessSentence,
        next,
        actor: { kind: "shelter_admin", shelterAdminId: ADMIN },
      },
    ]);
  });

  /**
   * K4 sheet, answer 13 (Oleksii, verbatim: "Clear `en` when `uk` changes; a
   * stale translation would be a false claim."). The shelter starts with a
   * Ukrainian sentence and its English translation; the requests below send
   * that same English back, as the K4 editor does.
   */
  describe("the English translation (answer 13)", () => {
    const stored = {
      uk: "Оновлюємо картки щосуботи.",
      en: { text: "We update the cards every Saturday.", provenance: "human" as const },
    };

    const reseed = async (freshnessSentence: Shelter["freshnessSentence"]) => {
      await truncateAll(db);
      const city = makeCity();
      await cityRepo(db).insert(city);
      cityId = city.id;
      shelter = makeShelter({
        id: shelter.id,
        publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
        freshnessSentence,
      });
      await shelterRepo(db).insert(shelter);
    };

    it("is cleared when the Ukrainian changes, even if the request carries the old English", async () => {
      await reseed(stored);
      const changed = { uk: "Пишіть нам у будь-який день.", en: null };
      const result = await call<KabinetShelterView>("shelter.profile.updateFreshnessSentence", {
        freshnessSentence: { uk: changed.uk, en: stored.en },
        expectedVersion: 0,
      });
      expect(result.status).toBe(200);
      expect(result.body.freshnessSentence).toEqual(changed);
      expect((await shelterRepo(db).findById(shelter.id))?.freshnessSentence).toEqual(changed);
      // History records what was stored, not what was sent.
      expect(await kabinetShelterRepo(db).historyOf(shelter.id)).toMatchObject([
        { kind: "freshness_sentence_changed", previous: stored, next: changed },
      ]);
    });

    it("is kept when the Ukrainian is unchanged", async () => {
      await reseed(stored);
      const result = await call<KabinetShelterView>("shelter.profile.updateFreshnessSentence", {
        freshnessSentence: stored,
        expectedVersion: 0,
      });
      expect(result.status).toBe(200);
      expect(result.body.freshnessSentence).toEqual(stored);
    });

    it("compares the normalised Ukrainian: another spelling of {імʼя} is not a change", async () => {
      const withToken = { uk: "{імʼя} досі шукає дім.", en: stored.en };
      await reseed(withToken);
      const result = await call<KabinetShelterView>("shelter.profile.updateFreshnessSentence", {
        freshnessSentence: { uk: "{ім'я} досі шукає дім.", en: stored.en },
        expectedVersion: 0,
      });
      expect(result.status).toBe(200);
      expect(result.body.freshnessSentence).toEqual(withToken);
    });
  });

  it("updateFreshnessSentence from a stale form is CONFLICT and writes nothing", async () => {
    const result = await call("shelter.profile.updateFreshnessSentence", {
      freshnessSentence: { uk: "Інше речення.", en: null },
      expectedVersion: 5,
    });
    expect(result.status).toBe(409);
    expect((await shelterRepo(db).findById(shelter.id))?.freshnessSentence).toEqual(
      shelter.freshnessSentence,
    );
    expect(await kabinetShelterRepo(db).historyOf(shelter.id)).toEqual([]);
  });

  it("requestReview sends a rejected shelter back to pending, keeping its evidence", async () => {
    await truncateAll(db);
    const city = makeCity();
    await cityRepo(db).insert(city);
    const evidence = {
      items: [
        {
          kind: "site_visit" as const,
          visitedAt: new Date("2026-08-30T00:00:00Z"),
          visitedBy: "0ec0ec0e-0000-4000-8000-0000000000aa" as never,
          notes: "Дзвінок із волонтеркою.",
        },
      ],
      submittedAt: new Date("2026-09-01T00:00:00Z"),
    };
    shelter = makeShelter({
      id: shelter.id,
      publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
      verification: {
        status: "rejected",
        rejectedAt: new Date("2026-09-10T00:00:00Z"),
        rejectedBy: "0ec0ec0e-0000-4000-8000-0000000000aa" as never,
        reason: { code: "insufficient_evidence", note: null },
        evidence,
      },
    });
    await shelterRepo(db).insert(shelter);

    const result = await call<KabinetShelterView>("shelter.verification.requestReview", {});
    expect(result.status).toBe(200);
    expect(result.body.verification.status).toBe("pending");
    const stored = await shelterRepo(db).findById(shelter.id);
    expect(stored?.verification.evidence.items).toEqual(evidence.items);
    const entries = await kabinetShelterRepo(db).historyOf(shelter.id);
    expect(entries.map((e) => (e.kind === "verification" ? `${e.from}->${e.to}` : e.kind))).toEqual(
      ["rejected->pending"],
    );
  });

  it("requestReview on a verified shelter is ILLEGAL_TRANSITION and writes nothing", async () => {
    const result = await call("shelter.verification.requestReview", {});
    expect(result.status).toBe(409);
    expect(result.body.data).toEqual({
      machine: "verification",
      from: "verified",
      event: "resubmit",
    });
    expect(await kabinetShelterRepo(db).historyOf(shelter.id)).toEqual([]);
  });

  it("proposeDonation derives the provider and leaves the live link alone", async () => {
    const result = await call<KabinetShelterView>("shelter.profile.proposeDonation", {
      url: "https://send.monobank.ua/jar/abc",
    });
    expect(result.status).toBe(200);
    expect(result.body.pendingDonation?.link).toEqual({
      url: "https://send.monobank.ua/jar/abc",
      provider: "monobank_jar",
    });
    expect(result.body.donation).toEqual(shelter.donation);
  });

  it("cancelDonationProposal clears it; with nothing pending it records nothing", async () => {
    await call("shelter.profile.proposeDonation", { url: "https://example.org/give" });
    expect(
      (await call("shelter.profile.cancelDonationProposal", {})).body.pendingDonation,
    ).toBeNull();
    await call("shelter.profile.cancelDonationProposal", {});
    const kinds = (await kabinetShelterRepo(db).historyOf(shelter.id)).map((e) => e.kind);
    expect(kinds.sort()).toEqual(["donation_proposal_cancelled", "donation_proposed"]);
  });

  /**
   * RG-Q12 (Oleksii): the operator's donation decision compares-and-sets on
   * `version`, so every proposal and cancellation must move it, a
   * re-proposal of the very same link included; otherwise a decision made on
   * a stale read would pass the check.
   */
  it("every proposal and cancellation bumps the version, a same-link re-proposal too", async () => {
    const url = "https://send.monobank.ua/jar/abc";
    const versionAfter = async (path: string, input: unknown) =>
      (await call<KabinetShelterView>(path, input)).body.version;
    expect(await versionAfter("shelter.profile.proposeDonation", { url })).toBe(1);
    expect(await versionAfter("shelter.profile.proposeDonation", { url })).toBe(2);
    expect(await versionAfter("shelter.profile.cancelDonationProposal", {})).toBe(3);
    // Nothing pending: nothing changes, so nothing to bump.
    expect(await versionAfter("shelter.profile.cancelDonationProposal", {})).toBe(3);
  });

  it("pause then resume, each a verification history entry", async () => {
    const paused = await call<KabinetShelterView>("shelter.profile.pause", {
      reason: { code: "relocation", note: null },
    });
    expect(paused.body.verification.status).toBe("paused");
    const resumed = await call<KabinetShelterView>("shelter.profile.resume", {});
    expect(resumed.body.verification.status).toBe("verified");
    const entries = await kabinetShelterRepo(db).historyOf(shelter.id);
    expect(
      entries.map((e) => (e.kind === "verification" ? `${e.from}->${e.to}` : e.kind)).sort(),
    ).toEqual(["paused->verified", "verified->paused"]);
  });

  /**
   * K4-T15 (Oleksii: "fine") and K4-B4, answer 2: the note is trimmed, blank
   * means none, at most 2,000 characters, and the shelter's own view carries
   * it back (the kabinet shows it under the paused line).
   */
  it("pause: the note is trimmed, kept, and shown back to the shelter; blank is none", async () => {
    const paused = await call<KabinetShelterView>("shelter.profile.pause", {
      reason: { code: "relocation", note: "  Переїжджаємо до Бучі  " },
    });
    expect(paused.status).toBe(200);
    expect(paused.body.verification).toMatchObject({
      status: "paused",
      reason: { code: "relocation", note: "Переїжджаємо до Бучі" },
    });
    expect(
      (await call<KabinetShelterView>("shelter.profile.get", {})).body.verification,
    ).toMatchObject({ reason: { note: "Переїжджаємо до Бучі" } });
    await call("shelter.profile.resume", {});
    const blank = await call<KabinetShelterView>("shelter.profile.pause", {
      reason: { code: "other", note: "   " },
    });
    expect(blank.body.verification).toMatchObject({ reason: { code: "other", note: null } });
  });

  it("pause: a note over 2,000 characters is BAD_REQUEST and writes nothing", async () => {
    const result = await call("shelter.profile.pause", {
      reason: { code: "other", note: "а".repeat(2001) },
    });
    expect(result.status).toBe(400);
    expect((await shelterRepo(db).findById(shelter.id))?.verification.status).toBe("verified");
    expect(await kabinetShelterRepo(db).historyOf(shelter.id)).toEqual([]);
  });

  it("resume on a shelter that isn't paused is ILLEGAL_TRANSITION, naming the machine", async () => {
    const result = await call("shelter.profile.resume", {});
    expect(result.status).toBe(409);
    expect(result.body.data).toEqual({
      machine: "verification",
      from: "verified",
      event: "resume",
    });
  });
});

describe("shelter.animals", () => {
  it("createDraft makes a draft in this shelter, with unknown medical facts", async () => {
    const result = await call<KabinetAnimalView>("shelter.animals.createDraft", {
      name: "  Мурчик ",
      species: "cat",
      sex: "male",
      size: "small",
      age: { kind: "declared_bucket", bucket: "young", declaredAt: new Date("2020-01-01") },
      description: { uk: "Опис", en: null },
    });
    expect(result.status).toBe(200);
    expect(result.body.name).toBe("Мурчик");
    expect(result.body.listing).toEqual({ kind: "draft" });
    expect(result.body.vaccination.state).toBe("unknown");
    // The server stamps a declared age bucket; the client's date is ignored.
    expect((result.body.age as { declaredAt: Date }).declaredAt.getFullYear()).toBeGreaterThan(
      2020,
    );
    expect((await reload(result.body.id)).shelterId).toBe(shelter.id);
  });

  /** S3-T6: an edit bumps version by exactly one, and a second save from the same read is CONFLICT. */
  it("update bumps version, and a save from the old version is then CONFLICT", async () => {
    const a = await animal();
    const first = await call<KabinetAnimalView>("shelter.animals.update", {
      animalId: a.id,
      expectedVersion: a.version,
      patch: { name: "Перше" },
    });
    expect(first.status).toBe(200);
    expect(first.body.version).toBe(a.version + 1);
    expect((await reload(a.id)).version).toBe(a.version + 1);
    const second = await call("shelter.animals.update", {
      animalId: a.id,
      expectedVersion: a.version,
      patch: { name: "Друге" },
    });
    expect(second.status).toBe(409);
    expect((await reload(a.id)).name).toBe("Перше");
  });

  /** Commitment #7: an edit moves lastUpdatedAt, never the confirmation date. */
  it("update edits, and leaves confirmedAt exactly where it was", async () => {
    const a = await animal();
    const result = await call("shelter.animals.update", {
      animalId: a.id,
      expectedVersion: a.version,
      patch: { name: "Нове ім'я" },
    });
    expect(result.status).toBe(200);
    const after = await reload(a.id);
    expect(after.name).toBe("Нове ім'я");
    expect(after.listing.kind === "published" && after.listing.confirmedAt).toEqual(
      a.listing.kind === "published" && a.listing.confirmedAt,
    );
    expect(after.lastUpdatedAt.getTime()).toBeGreaterThan(a.lastUpdatedAt.getTime());
  });

  it("update from a stale form is CONFLICT", async () => {
    const a = await animal();
    const result = await call("shelter.animals.update", {
      animalId: a.id,
      expectedVersion: a.version + 1,
      patch: { name: "x" },
    });
    expect(result.status).toBe(409);
  });

  it("a declaration never overwrites a registry-confirmed vaccination", async () => {
    const a = await animal({
      vaccination: {
        source: "registry",
        state: "confirmed",
        registryRef: "R-1",
        verifiedAt: new Date("2026-01-01"),
      },
    });
    const result = await call("shelter.animals.update", {
      animalId: a.id,
      expectedVersion: a.version,
      patch: { vaccination: { state: "unknown" } },
    });
    // Its own code, not 403 (HS-T6): 403 means access, and only access.
    expect(result.status).toBe(409);
    expect((result.body as { code?: string }).code).toBe("REGISTRY_CONFIRMED");
    expect((await reload(a.id)).vaccination.source).toBe("registry");
  });

  it("publishing a draft with no photo is PUBLISH_REQUIREMENTS_UNMET, naming the gap", async () => {
    const a = await animal({ listing: { kind: "draft" }, photos: [] });
    const result = await call("shelter.animals.transition", {
      animalId: a.id,
      event: { type: "publish" },
    });
    expect(result.status).toBe(422);
    expect(result.body.data).toEqual({ gaps: [{ kind: "photo" }] });
  });

  it("confirm moves the confirmation and answers when the undo window closes", async () => {
    const a = await animal();
    const now = new Date();
    const result = await call<{ animal: KabinetAnimalView; undoUntil: Date }>(
      "shelter.animals.confirm",
      { animalId: a.id },
      { now },
    );
    expect(result.status).toBe(200);
    expect((result.body.animal.listing as { confirmedAt: Date }).confirmedAt).toEqual(now);
    expect(result.body.undoUntil).toEqual(new Date(now.getTime() + UNDO_WINDOW_MS));
  });

  /**
   * HS-T8 (Oleksii): «Ще шукає» must not touch last_updated_at; edits and
   * confirmations are separate facts. So the K2 order (most recently edited
   * first) doesn't move when an animal is confirmed.
   */
  it("confirm leaves last_updated_at and the list order exactly as they were", async () => {
    const older = await animal({ lastUpdatedAt: new Date("2026-08-01T00:00:00.000Z") });
    const newer = await animal({ lastUpdatedAt: new Date("2026-08-02T00:00:00.000Z") });
    const order = async () =>
      (
        await call<ListBody>("shelter.animals.list", { listing: null, cursor: null, limit: 10 })
      ).body.items.map((item) => item.id);
    const before = await order();
    expect(before).toEqual([newer.id, older.id]);

    const confirmed = await call<{ animal: KabinetAnimalView }>("shelter.animals.confirm", {
      animalId: older.id,
    });
    expect(confirmed.status).toBe(200);
    // Neither stored nor reported as an edit.
    expect(confirmed.body.animal.lastUpdatedAt).toEqual(older.lastUpdatedAt);
    expect((await reload(older.id)).lastUpdatedAt).toEqual(older.lastUpdatedAt);
    expect(await order()).toEqual(before);
  });

  it("an edit form opened before a «Ще шукає» still saves, and the confirmation survives it", async () => {
    const a = await animal();
    const formReadVersion = a.version;
    const confirmedAt = new Date();
    await call("shelter.animals.confirm", { animalId: a.id }, { now: confirmedAt });
    const saved = await call("shelter.animals.update", {
      animalId: a.id,
      expectedVersion: formReadVersion,
      patch: { name: "Збережено після підтвердження" },
    });
    expect(saved.status).toBe(200);
    const after = await reload(a.id);
    expect(after.name).toBe("Збережено після підтвердження");
    expect((after.listing as { confirmedAt: Date }).confirmedAt).toEqual(confirmedAt);
  });

  /** The listing's own compare-and-set: two taps from the same read, the second loses and re-plans. */
  it("a listing move planned on a listing that has since changed doesn't overwrite it", async () => {
    const a = await animal();
    await call("shelter.animals.transition", { animalId: a.id, event: { type: "reserve" } });
    // A second "reserve" now plans on the new state, where reserve is illegal.
    const again = await call("shelter.animals.transition", {
      animalId: a.id,
      event: { type: "reserve" },
    });
    expect(again.status).toBe(409);
    expect((await reload(a.id)).listing.kind).toBe("reserved");
  });

  it("undo inside the window restores the previous confirmation exactly; after it, UNDO_EXPIRED", async () => {
    const a = await animal();
    const previous = a.listing.kind === "published" ? a.listing.confirmedAt : null;
    const t = new Date();
    await call("shelter.animals.confirm", { animalId: a.id }, { now: t });
    const undone = await call<KabinetAnimalView>(
      "shelter.animals.undoConfirm",
      { animalId: a.id },
      { now: new Date(t.getTime() + UNDO_WINDOW_MS) },
    );
    expect(undone.status).toBe(200);
    expect((undone.body.listing as { confirmedAt: Date }).confirmedAt).toEqual(previous);

    const b = await animal();
    const t2 = new Date();
    await call("shelter.animals.confirm", { animalId: b.id }, { now: t2 });
    const late = await call(
      "shelter.animals.undoConfirm",
      { animalId: b.id },
      { now: new Date(t2.getTime() + UNDO_WINDOW_MS + 1) },
    );
    expect(late.status).toBe(409);
    expect(late.body.code).toBe("UNDO_EXPIRED");
  });

  it("deleteDraft deletes a draft, and refuses anything else as ILLEGAL_TRANSITION", async () => {
    const draft = await animal({ listing: { kind: "draft" } });
    expect((await call("shelter.animals.deleteDraft", { animalId: draft.id })).status).toBe(200);
    expect(await animalRepo(db).findById(draft.id)).toBeNull();

    const published = await animal();
    const refused = await call("shelter.animals.deleteDraft", { animalId: published.id });
    expect(refused.status).toBe(409);
    expect(refused.body.data).toEqual({
      machine: "listing",
      from: "published",
      event: "delete_draft",
    });
  });

  it("list pages by last edit, counts every kind, and counts stale listings by the freshness policy", async () => {
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;
    // Literal ages, not values derived from staleBefore(): the strip says
    // "понад 30 днів", so 31 days unconfirmed is stale and 30 days is not.
    const stale = await animal({
      listing: {
        kind: "published",
        publishedAt: new Date("2026-01-01"),
        confirmedAt: new Date(now.getTime() - 31 * day - 60_000),
        undoable: null,
      },
    });
    await animal({
      listing: {
        kind: "published",
        publishedAt: new Date("2026-01-01"),
        confirmedAt: new Date(now.getTime() - 30 * day - 60_000),
        undoable: null,
      },
    });
    await animal({ listing: { kind: "draft" } });

    const first = await call<ListBody>(
      "shelter.animals.list",
      { listing: null, cursor: null, limit: 2 },
      { now },
    );
    expect(first.status).toBe(200);
    expect(first.body.counts).toEqual({
      draft: 1,
      published: 2,
      reserved: 0,
      adopted: 0,
      withdrawn: 0,
    });
    expect(first.body.staleCount).toBe(1);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).not.toBeNull();

    const second = await call<ListBody>(
      "shelter.animals.list",
      { listing: null, cursor: first.body.nextCursor, limit: 2 },
      { now },
    );
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
    const seen = [...first.body.items, ...second.body.items].map((i: { id: string }) => i.id);
    expect(new Set(seen).size).toBe(3);
    expect(seen).toContain(stale.id);
  });

  it("a cursor is bound to its filter and its signature", async () => {
    await animal();
    await animal();
    const first = await call<ListBody>("shelter.animals.list", {
      listing: null,
      cursor: null,
      limit: 1,
    });
    const otherFilter = await call("shelter.animals.list", {
      listing: "published",
      cursor: first.body.nextCursor,
      limit: 1,
    });
    expect(otherFilter.status).toBe(400);
    const forged = await call(
      "shelter.animals.list",
      { listing: null, cursor: first.body.nextCursor, limit: 1 },
      { cursorSecret: "a-different-secret" },
    );
    expect(forged.status).toBe(400);
  });
});

describe("deleting a draft (HS-Q9: only one that has never been public)", () => {
  /** Oleksii's test: publish → withdraw → back to draft → delete refused. */
  it("refuses a draft that was once published, with WAS_PUBLISHED, and keeps it", async () => {
    const a = await animal({
      listing: { kind: "draft" },
      photos: [{ storageKey: "a/1.jpg", width: 1200, height: 900, alt: null }],
    });
    expect(
      (await call("shelter.animals.transition", { animalId: a.id, event: { type: "publish" } }))
        .status,
    ).toBe(200);
    expect(
      (
        await call("shelter.animals.transition", {
          animalId: a.id,
          event: { type: "withdraw", reason: { code: "listing_error", note: null } },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call("shelter.animals.transition", {
          animalId: a.id,
          event: { type: "restore_to_draft" },
        })
      ).status,
    ).toBe(200);
    expect((await reload(a.id)).listing.kind).toBe("draft");

    const refused = await call<{ code: string; data: unknown }>("shelter.animals.deleteDraft", {
      animalId: a.id,
    });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("WAS_PUBLISHED");
    expect(refused.body.data).toBeUndefined();
    expect(await animalRepo(db).findById(a.id)).not.toBeNull();
  });

  it("deletes a draft that has never been public", async () => {
    const a = await animal({ listing: { kind: "draft" } });
    expect((await call("shelter.animals.deleteDraft", { animalId: a.id })).status).toBe(200);
    expect(await animalRepo(db).findById(a.id)).toBeNull();
  });

  /**
   * HS-Q9: "map the FK violation (swipe/reveal reference) to a typed error
   * regardless, so no path returns an untyped 500." A never-published draft
   * can't normally have a swipe; this plants one to reach the database's own
   * refusal and proves it comes back typed.
   */
  it("answers WAS_PUBLISHED, not a 500, when a swipe still references the draft", async () => {
    const a = await animal({ listing: { kind: "draft" } });
    const adopter = makeAdopter();
    await adopterRepo(db).insert(adopter);
    await swipeRepo(db).record(makeSwipe({ adopterId: adopter.id, animalId: a.id }));
    const result = await call<{ code: string; data: unknown }>("shelter.animals.deleteDraft", {
      animalId: a.id,
    });
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("WAS_PUBLISHED");
    expect(await animalRepo(db).findById(a.id)).not.toBeNull();
  });

  /**
   * K-Q9 (Oleksii: "one refusal for both cases"): a once-public draft and a
   * draft with activity get byte-identical answers, so the refusal can't tell
   * a shelter that an adopter acted on its animal (commitment #2).
   */
  it("refuses a once-public draft and a referenced draft with the same answer", async () => {
    const wasPublished = await animal({
      listing: { kind: "draft" },
      photos: [{ storageKey: "a/1.jpg", width: 1200, height: 900, alt: null }],
    });
    await call("shelter.animals.transition", {
      animalId: wasPublished.id,
      event: { type: "publish" },
    });
    await call("shelter.animals.transition", {
      animalId: wasPublished.id,
      event: { type: "withdraw", reason: { code: "listing_error", note: null } },
    });
    await call("shelter.animals.transition", {
      animalId: wasPublished.id,
      event: { type: "restore_to_draft" },
    });
    const withActivity = await animal({ listing: { kind: "draft" } });
    const adopter = makeAdopter();
    await adopterRepo(db).insert(adopter);
    await swipeRepo(db).record(makeSwipe({ adopterId: adopter.id, animalId: withActivity.id }));

    const first = await call("shelter.animals.deleteDraft", { animalId: wasPublished.id });
    const second = await call("shelter.animals.deleteDraft", { animalId: withActivity.id });
    expect(first.status).toBe(409);
    expect(first.body.code).toBe("WAS_PUBLISHED");
    expect(second).toEqual(first);
    expect(JSON.stringify(second.body)).not.toMatch(/activity|reason/i);
  });
});

/**
 * K-Q7 (Oleksii: "creation, deletion, every listing move; edits record field
 * names only; never adopter data"). Each write's line is read back from the
 * table, the way the operator's history will show it.
 */
describe("a shelter's animal writes are history (K-Q7)", () => {
  const animalLines = async () =>
    (await kabinetShelterRepo(db).historyOf(shelter.id)).filter((entry) =>
      entry.kind.startsWith("animal_"),
    );
  const ACTOR = { kind: "shelter_admin", shelterAdminId: ADMIN };
  const PHOTO = { storageKey: "a/1.jpg", width: 1200, height: 900, alt: null };

  it("createDraft records animal_created, by the shelter's admin", async () => {
    const now = new Date("2026-10-16T10:00:00.000Z");
    const created = await call<KabinetAnimalView>(
      "shelter.animals.createDraft",
      {
        name: "Мурчик",
        species: "cat",
        sex: "male",
        size: "small",
        age: { kind: "declared_bucket", bucket: "young", declaredAt: now },
        description: { uk: "Опис", en: null },
      },
      { now },
    );
    expect(created.status).toBe(200);
    expect(await animalLines()).toEqual([
      {
        kind: "animal_created",
        at: now,
        actor: ACTOR,
        animalId: created.body.id,
        animalName: "Мурчик",
      },
    ]);
  });

  it("update records the changed field names and none of their values", async () => {
    const a = await animal({ size: "small" });
    const now = new Date("2026-10-16T11:00:00.000Z");
    const SECRET = "Опис, якого в історії бути не може";
    const result = await call(
      "shelter.animals.update",
      {
        animalId: a.id,
        expectedVersion: a.version,
        patch: { size: "large", description: { uk: SECRET, en: null } },
      },
      { now },
    );
    expect(result.status).toBe(200);
    const lines = await animalLines();
    expect(lines).toEqual([
      {
        kind: "animal_edited",
        at: now,
        actor: ACTOR,
        animalId: a.id,
        animalName: a.name,
        fields: ["size", "description"],
      },
    ]);
    const stored = JSON.stringify(lines);
    expect(stored).not.toContain(SECRET);
    expect(stored).not.toContain('"large"');
    expect(stored).not.toContain('"small"');
  });

  /** Review finding 4: a form that sends every field names only the one that changed. */
  it("update names only the fields whose value changed, not every key the form sent", async () => {
    const a = await animal({ size: "small" });
    const now = new Date("2026-10-16T11:30:00.000Z");
    const result = await call(
      "shelter.animals.update",
      {
        animalId: a.id,
        expectedVersion: a.version,
        patch: {
          name: a.name,
          species: a.species,
          sex: a.sex,
          size: "large",
          age: a.age,
          description: a.description,
          vaccination: { state: a.vaccination.state },
          spayNeuter: { state: a.spayNeuter.state },
        },
      },
      { now },
    );
    expect(result.status).toBe(200);
    expect(await animalLines()).toEqual([
      {
        kind: "animal_edited",
        at: now,
        actor: ACTOR,
        animalId: a.id,
        animalName: a.name,
        fields: ["size"],
      },
    ]);
  });

  it("a save that changes nothing writes nothing: same version, same edit time, no line", async () => {
    const a = await animal();
    const result = await call<KabinetAnimalView>(
      "shelter.animals.update",
      {
        animalId: a.id,
        expectedVersion: a.version,
        patch: { name: a.name, size: a.size, description: a.description },
      },
      { now: new Date(a.lastUpdatedAt.getTime() + 60_000) },
    );
    expect(result.status).toBe(200);
    expect(result.body.version).toBe(a.version);
    expect(result.body.lastUpdatedAt).toEqual(a.lastUpdatedAt);
    const after = await reload(a.id);
    expect(after.version).toBe(a.version);
    expect(after.lastUpdatedAt).toEqual(a.lastUpdatedAt);
    expect(await animalLines()).toEqual([]);
  });

  it("re-sending the declared age bucket keeps its anchor and records no change", async () => {
    const declaredAt = new Date(Date.now() - 24 * 3600 * 1000);
    const a = await animal({ age: { kind: "declared_bucket", bucket: "young", declaredAt } });
    const result = await call<KabinetAnimalView>("shelter.animals.update", {
      animalId: a.id,
      expectedVersion: a.version,
      patch: { age: { kind: "declared_bucket", bucket: "young", declaredAt: new Date() } },
    });
    expect(result.status).toBe(200);
    expect(result.body.version).toBe(a.version);
    expect((await reload(a.id)).age).toEqual({
      kind: "declared_bucket",
      bucket: "young",
      declaredAt,
    });
    expect(await animalLines()).toEqual([]);
  });

  it("re-entering a bucket the animal has since grown out of is a correction: restamped, recorded", async () => {
    // Declared «young» years ago: the card shows an older bucket today.
    const declaredAt = new Date("2019-01-01T00:00:00.000Z");
    const a = await animal({ age: { kind: "declared_bucket", bucket: "young", declaredAt } });
    const now = new Date();
    const result = await call<KabinetAnimalView>(
      "shelter.animals.update",
      {
        animalId: a.id,
        expectedVersion: a.version,
        patch: { age: { kind: "declared_bucket", bucket: "young", declaredAt: new Date(0) } },
      },
      { now },
    );
    expect(result.status).toBe(200);
    expect(result.body.version).toBe(a.version + 1);
    expect((await reload(a.id)).age).toEqual({
      kind: "declared_bucket",
      bucket: "young",
      declaredAt: now,
    });
    expect(
      (await animalLines()).map((l) => (l.kind === "animal_edited" ? l.fields : l.kind)),
    ).toEqual([["age"]]);
  });

  it("each of the six moves records animal_listing_changed with from and to", async () => {
    /** K-Q18 (review finding 5): a note can name an adopter, and history can't be erased. */
    const NOTE = "Забрала пані Олена";
    const base = Date.now();
    const at = (i: number) => new Date(base + i * 1000);
    const a = await animal({ listing: { kind: "draft" }, photos: [PHOTO] });
    const moves = [
      { event: { type: "publish" }, from: "draft", to: "published" },
      { event: { type: "reserve" }, from: "published", to: "reserved" },
      { event: { type: "release" }, from: "reserved", to: "published" },
      {
        event: { type: "withdraw", reason: { code: "transferred", note: NOTE } },
        recorded: { type: "withdraw", reason: { code: "transferred" } },
        from: "published",
        to: "withdrawn",
      },
      { event: { type: "restore_to_draft" }, from: "withdrawn", to: "draft" },
    ] as const;
    for (const [i, move] of moves.entries()) {
      const moved = await call(
        "shelter.animals.transition",
        { animalId: a.id, event: move.event },
        { now: at(i) },
      );
      expect(moved.status, move.event.type).toBe(200);
    }
    const b = await animal();
    expect(
      (
        await call(
          "shelter.animals.transition",
          { animalId: b.id, event: { type: "adopt" } },
          { now: at(moves.length) },
        )
      ).status,
    ).toBe(200);

    const expected = [
      ...moves.map(({ event, from, to, ...move }, i) => ({
        kind: "animal_listing_changed",
        at: at(i),
        actor: ACTOR,
        animalId: a.id,
        animalName: a.name,
        event: "recorded" in move ? move.recorded : event,
        from,
        to,
      })),
      {
        kind: "animal_listing_changed",
        at: at(moves.length),
        actor: ACTOR,
        animalId: b.id,
        animalName: b.name,
        event: { type: "adopt" },
        from: "published",
        to: "adopted",
      },
    ];
    // historyOf is newest first.
    expect((await animalLines()).reverse()).toEqual(expected);
    // The stored history jsonb holds no trace of the note.
    const stored = JSON.stringify(
      await db.select({ entry: shelterHistory.entry }).from(shelterHistory),
    );
    expect(stored).toContain('"transferred"');
    expect(stored).not.toContain(NOTE);
    expect(stored).not.toContain('"note"');
  });

  it("a withdrawal keeps its note on the listing, not in history (K-Q18)", async () => {
    const NOTE = "Забрала пані Олена";
    const a = await animal();
    const moved = await call("shelter.animals.transition", {
      animalId: a.id,
      event: { type: "withdraw", reason: { code: "other", note: NOTE } },
    });
    expect(moved.status).toBe(200);
    const after = await reload(a.id);
    expect(after.listing).toMatchObject({
      kind: "withdrawn",
      reason: { code: "other", note: NOTE },
    });
    const stored = JSON.stringify(
      await db.select({ entry: shelterHistory.entry }).from(shelterHistory),
    );
    expect(stored).toContain('"other"');
    expect(stored).not.toContain(NOTE);
  });

  /** S1 (Oleksii: "no history for «Ще шукає» / undo"). */
  it("confirm and undo record nothing", async () => {
    const a = await animal();
    const t = new Date();
    expect((await call("shelter.animals.confirm", { animalId: a.id }, { now: t })).status).toBe(
      200,
    );
    expect(
      (
        await call(
          "shelter.animals.undoConfirm",
          { animalId: a.id },
          { now: new Date(t.getTime() + 1000) },
        )
      ).status,
    ).toBe(200);
    expect(await animalLines()).toEqual([]);
  });

  it("deleteDraft records animal_deleted with the name it had", async () => {
    const draft = await animal({ listing: { kind: "draft" }, name: "Пиріжок" });
    const now = new Date("2026-10-16T12:00:00.000Z");
    expect(
      (await call("shelter.animals.deleteDraft", { animalId: draft.id }, { now })).status,
    ).toBe(200);
    expect(await animalLines()).toEqual([
      { kind: "animal_deleted", at: now, actor: ACTOR, animalId: draft.id, animalName: "Пиріжок" },
    ]);
  });

  it("a refused write records nothing: a stale edit, an illegal move, a refused delete", async () => {
    const a = await animal();
    expect(
      (
        await call("shelter.animals.update", {
          animalId: a.id,
          expectedVersion: a.version + 1,
          patch: { name: "x" },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call("shelter.animals.transition", {
          animalId: a.id,
          event: { type: "restore_to_draft" },
        })
      ).status,
    ).toBe(409);
    const referenced = await animal({ listing: { kind: "draft" } });
    const adopter = makeAdopter();
    await adopterRepo(db).insert(adopter);
    await swipeRepo(db).record(makeSwipe({ adopterId: adopter.id, animalId: referenced.id }));
    expect((await call("shelter.animals.deleteDraft", { animalId: referenced.id })).status).toBe(
      409,
    );
    expect(await animalLines()).toEqual([]);
  });

  /** The shelter's own history view returns them by name, with no ids (RG-Q8). */
  it("shelter.history.list returns the lines by animal name, without the animal id", async () => {
    const draft = await animal({ listing: { kind: "draft" }, name: "Пиріжок" });
    await call("shelter.animals.deleteDraft", { animalId: draft.id });
    const listed = await call<{ items: unknown[] }>("shelter.history.list", {
      cursor: null,
      limit: 10,
    });
    expect(listed.status).toBe(200);
    expect(listed.body.items).toEqual([
      expect.objectContaining({
        kind: "animal_deleted",
        actor: { kind: "shelter" },
        animalName: "Пиріжок",
      }),
    ]);
    expect(JSON.stringify(listed.body)).not.toContain(draft.id);
  });
});

describe("the kabinet's own rate limits (HS-Q10)", () => {
  const tight = (perUser: number, perIp: number): KabinetLimiters => ({
    perUser: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: perUser }),
    perIp: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: perIp }),
  });

  it("pins Oleksii's numbers: 100 a minute per user, 300 a minute per IP", () => {
    expect(KABINET_RATE_LIMITS).toEqual({
      perUser: { windowMs: 60_000, maxRequests: 100 },
      perIp: { windowMs: 60_000, maxRequests: 300 },
    });
  });

  it("limits per signed-in user, whatever the IP", async () => {
    const limiters = tight(2, 1000);
    const as = (ip: string) => call("shelter.profile.get", {}, { limiters, ip, userId: "u1" });
    expect((await as("198.51.100.1")).status).toBe(200);
    expect((await as("198.51.100.2")).status).toBe(200);
    expect((await as("198.51.100.3")).status).toBe(429);
    // Another user is a separate budget.
    expect((await call("shelter.profile.get", {}, { limiters, userId: "u2" })).status).toBe(200);
  });

  it("backstops per IP for everyone, signed in or not", async () => {
    const limiters = tight(1000, 2);
    const ip = "198.51.100.9";
    expect((await call("shelter.profile.get", {}, { limiters, ip, userId: "u1" })).status).toBe(
      200,
    );
    expect((await call("shelter.profile.get", {}, { limiters, ip, userId: "u2" })).status).toBe(
      200,
    );
    expect(
      (
        await call(
          "shelter.profile.get",
          {},
          { limiters, ip, userId: null, principal: { kind: "anonymous" } },
        )
      ).status,
    ).toBe(429);
  });

  /** Carrier NAT puts shelters and adopters behind one IP: the two budgets must never be one. */
  it("the kabinet route never uses the adopter limiter", () => {
    const route = readFileSync(join(__dirname, "../app/api/kabinet/[...rpc]/route.ts"), "utf8");
    expect(route).not.toContain("apiRateLimiter");
    expect(route).toContain("kabinetLimiters");
  });
});

/**
 * HS-T9 (Oleksii): "No listing move (publish, reserve, release, adopt,
 * withdraw, back-to-draft, confirm, undo) touches last_updated_at. Add one
 * test per move." Each starts from the state the move needs, makes the move
 * through the served router, and checks the edit time both as stored and as
 * returned.
 */
describe("no listing move touches last_updated_at (HS-T9)", () => {
  const EDITED = new Date("2026-08-01T00:00:00.000Z");
  const PUBLISHED = new Date("2026-07-01T00:00:00.000Z");
  const photo = { storageKey: "a/1.jpg", width: 1200, height: 900, alt: null };
  const published = {
    kind: "published",
    publishedAt: PUBLISHED,
    confirmedAt: PUBLISHED,
    undoable: null,
  } as const;
  const reserved = {
    kind: "reserved",
    since: PUBLISHED,
    publishedAt: PUBLISHED,
    confirmedAt: PUBLISHED,
    undoable: null,
  } as const;
  const withdrawn = {
    kind: "withdrawn",
    withdrawnAt: PUBLISHED,
    reason: { code: "listing_error", note: null },
  } as const;

  // [move, starting state, procedure, input, what the stored listing must show afterwards]
  const cases: [
    string,
    Partial<Animal>,
    string,
    (id: string) => unknown,
    (after: Animal) => void,
  ][] = [
    [
      "publish",
      { listing: { kind: "draft" }, photos: [photo] },
      "shelter.animals.transition",
      (id) => ({ animalId: id, event: { type: "publish" } }),
      (after) => expect(after.listing.kind).toBe("published"),
    ],
    [
      "reserve",
      { listing: published },
      "shelter.animals.transition",
      (id) => ({ animalId: id, event: { type: "reserve" } }),
      (after) => expect(after.listing.kind).toBe("reserved"),
    ],
    [
      "release",
      { listing: reserved },
      "shelter.animals.transition",
      (id) => ({ animalId: id, event: { type: "release" } }),
      (after) => expect(after.listing.kind).toBe("published"),
    ],
    [
      "adopt",
      { listing: published },
      "shelter.animals.transition",
      (id) => ({ animalId: id, event: { type: "adopt" } }),
      (after) => expect(after.listing.kind).toBe("adopted"),
    ],
    [
      "withdraw",
      { listing: published },
      "shelter.animals.transition",
      (id) => ({
        animalId: id,
        event: { type: "withdraw", reason: { code: "transferred", note: null } },
      }),
      (after) => expect(after.listing.kind).toBe("withdrawn"),
    ],
    [
      "back-to-draft",
      { listing: withdrawn },
      "shelter.animals.transition",
      (id) => ({ animalId: id, event: { type: "restore_to_draft" } }),
      (after) => expect(after.listing.kind).toBe("draft"),
    ],
    [
      "confirm",
      { listing: published },
      "shelter.animals.confirm",
      (id) => ({ animalId: id }),
      // Still published, so the kind proves nothing: the confirmation must have moved.
      (after) =>
        expect((after.listing as { confirmedAt: Date }).confirmedAt.getTime()).toBeGreaterThan(
          PUBLISHED.getTime(),
        ),
    ],
  ];

  for (const [move, start, procedure, input, reached] of cases) {
    it(`${move} leaves last_updated_at as it was`, async () => {
      const a = await animal({ ...start, lastUpdatedAt: EDITED });
      const result = await call<{ lastUpdatedAt?: Date; animal?: { lastUpdatedAt: Date } }>(
        procedure,
        input(a.id),
      );
      expect(result.status).toBe(200);
      expect(result.body.lastUpdatedAt ?? result.body.animal?.lastUpdatedAt).toEqual(EDITED);
      const after = await reload(a.id);
      expect(after.lastUpdatedAt).toEqual(EDITED);
      // RG-Q7: a move never bumps the edit guard either.
      expect(after.version).toBe(a.version);
      // The move really happened: "unchanged" proves nothing about a write that never ran.
      reached(after);
    });
  }

  it("undo leaves last_updated_at as it was", async () => {
    const a = await animal({ listing: published, lastUpdatedAt: EDITED });
    const t = new Date();
    expect((await call("shelter.animals.confirm", { animalId: a.id }, { now: t })).status).toBe(
      200,
    );
    const undone = await call<KabinetAnimalView>(
      "shelter.animals.undoConfirm",
      { animalId: a.id },
      { now: t },
    );
    expect(undone.status).toBe(200);
    expect(undone.body.lastUpdatedAt).toEqual(EDITED);
    const after = await reload(a.id);
    expect(after.lastUpdatedAt).toEqual(EDITED);
    // The undo really happened: the stored confirmation is back where it was.
    expect(after.listing).toMatchObject({ kind: "published", confirmedAt: PUBLISHED });
  });
});

describe("shelter.history.list (RG-Q8)", () => {
  const MOD = "11111111-1111-4111-8111-111111111111";

  it("shows the shelter its own history: operator by display name, no ids, newest first, paged", async () => {
    const repo = kabinetShelterRepo(db);
    // The operator's change, then the shelter's own: the newer one must come first.
    expect(
      (
        await repo.applyAudited({
          shelterId: shelter.id,
          expectedVersion: 0,
          change: { kind: "freshness_sentence", freshnessSentence: { uk: "Щосуботи", en: null } },
          entry: {
            kind: "freshness_sentence_changed",
            at: new Date("2026-10-01T00:00:00.000Z"),
            actor: { kind: "moderator", moderatorId: MOD as never },
            previous: null,
            next: { uk: "Щосуботи", en: null },
          },
          historyId: "h1",
          now: new Date("2026-10-01T00:00:00.000Z"),
        })
      ).kind,
    ).toBe("ok");
    const contact = { primary: { kind: "telegram", handle: "lapa_shelter" }, additional: [] };
    expect(
      (await call("shelter.profile.updateContact", { contact, expectedVersion: 1 })).status,
    ).toBe(200);

    const first = await call<{
      items: { kind: string; actor: unknown }[];
      nextCursor: string | null;
    }>("shelter.history.list", { cursor: null, limit: 1 });
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.items[0]).toMatchObject({
      kind: "contact_changed",
      actor: { kind: "shelter" },
    });
    expect(first.body.nextCursor).not.toBeNull();

    const second = await call<{
      items: { kind: string; actor: unknown }[];
      nextCursor: string | null;
    }>("shelter.history.list", { cursor: first.body.nextCursor, limit: 1 });
    expect(second.body.items[0]).toMatchObject({
      kind: "freshness_sentence_changed",
      actor: { kind: "operator", displayName: "Олексій" },
    });
    expect(second.body.nextCursor).toBeNull();
    const json = JSON.stringify([first.body, second.body]);
    expect(json).not.toContain(MOD);
    expect(json).not.toContain(ADMIN);
  });
});
