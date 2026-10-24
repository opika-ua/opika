import type * as Repos from "@opika/db/repos";
import { animalRepo, cityRepo, shelterRepo } from "@opika/db/repos";
import { makeAnimal, makeCity, makeShelter, setupTestDatabase, truncateAll } from "@opika/db/test";
import {
  type Animal,
  type AnimalId,
  type DraftAnimal,
  type Shelter,
  type ShelterAdminId,
  transitionListing,
} from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { fromRpcBody, toRpcBody } from "../api/test-harness";
import { SHELTER_WRITE_POLICY } from "./access";
import type { KabinetPrincipal } from "./actor";
import { capturingInvitationSender } from "./email-senders";
import { capturingPasswordMail } from "./password-mail";
import { PHOTO_UPLOADS_NOT_CONFIGURED } from "./photo-uploads";
import { handleKabinetRpc } from "./rpc-route";

/**
 * K3-T7 (Oleksii: "K3-T7 race fix in PR 4: approved as §7.5"), both orders,
 * and the draft-only null guard, through the served router with a real
 * database. The interleaving is made deterministic by running a competing
 * write, once, between a handler's read and its compare-and-set write: the
 * repository is wrapped, never replaced, so every statement is the real one.
 */

const hooks = vi.hoisted(() => ({
  beforeListingWrite: null as null | (() => Promise<void>),
  beforePhotoWrite: null as null | (() => Promise<void>),
  beforeEditWrite: null as null | (() => Promise<void>),
}));

const once = async (key: keyof typeof hooks) => {
  const hook = hooks[key];
  hooks[key] = null;
  if (hook) await hook();
};

vi.mock("@opika/db/repos", async (importOriginal) => {
  const actual = await importOriginal<typeof Repos>();
  return {
    ...actual,
    kabinetAnimalRepo: (db: Parameters<typeof actual.kabinetAnimalRepo>[0]) => {
      const repo = actual.kabinetAnimalRepo(db);
      return {
        ...repo,
        writeListingIf: async (...args: Parameters<typeof repo.writeListingIf>) => {
          await once("beforeListingWrite");
          return repo.writeListingIf(...args);
        },
        writePhotosIf: async (...args: Parameters<typeof repo.writePhotosIf>) => {
          await once("beforePhotoWrite");
          return repo.writePhotosIf(...args);
        },
        writeEditIf: async (...args: Parameters<typeof repo.writeEditIf>) => {
          await once("beforeEditWrite");
          return repo.writeEditIf(...args);
        },
      };
    },
  };
});

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;
let realRepo: typeof Repos.kabinetAnimalRepo;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
  realRepo = (await vi.importActual<typeof Repos>("@opika/db/repos")).kabinetAnimalRepo;
});
afterAll(async () => cleanup?.());

const ADMIN = "33333333-3333-4333-8333-333333333333" as ShelterAdminId;
const PHOTO = { storageKey: "animals/race/1", width: 800, height: 1000, alt: null };
let shelter: Shelter;
let cityId: string;

beforeEach(async () => {
  hooks.beforeListingWrite = null;
  hooks.beforePhotoWrite = null;
  hooks.beforeEditWrite = null;
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  cityId = city.id;
  shelter = makeShelter({ publicLocation: { ...makeShelter().publicLocation, cityId: city.id } });
  await shelterRepo(db).insert(shelter);
});

const generous = () => inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 });

async function call(path: string, input: unknown) {
  const principal: KabinetPrincipal = {
    kind: "shelter_admin",
    shelterAdminId: ADMIN,
    shelterId: shelter.id,
  };
  const response = await handleKabinetRpc(
    new Request(`http://localhost/api/kabinet/${path.replaceAll(".", "/")}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
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
      limiters: { perUser: generous(), perIp: generous() },
      ip: "203.0.113.1",
      resolve: async () => ({ principal, userId: "user-admin", db, cursorSecret: "secret" }),
      now: new Date(),
      newId: () => crypto.randomUUID(),
      operatorDisplayName: "Олексій",
      locationPolicy: null,
      production: false,
      shelterWrites: SHELTER_WRITE_POLICY,
      photoUploads: PHOTO_UPLOADS_NOT_CONFIGURED,
    },
  );
  const text = await response.text();
  return {
    status: response.status,
    body: fromRpcBody(JSON.parse(text)) as { code?: string; data?: unknown },
  };
}

/** A complete draft with one photo: ready to publish. */
async function readyDraft(): Promise<DraftAnimal> {
  const draft = makeAnimal({ shelterId: shelter.id, listing: { kind: "draft" }, photos: [PHOTO] });
  await animalRepo(db).insert(draft, cityId as never);
  return draft;
}

const reload = async (id: AnimalId) => (await animalRepo(db).findById(id)) as Animal;

/** A publish made by "another tab", straight through the real repository. */
const publishedElsewhere = (draft: DraftAnimal) => async () => {
  const next = transitionListing({ kind: "draft" }, { type: "publish", at: new Date() });
  if (next.kind !== "ok") throw new Error("publish refused");
  await realRepo(db).writeListingIf(
    draft.id,
    next.next,
    { kind: "draft" },
    new Date(),
    { kind: "not_recorded", because: "confirmation" },
    { kind: "publish", expectedVersion: draft.version },
  );
};

describe("K3-T7: a publish and a last-photo removal can't leave a photo-less public card", () => {
  it("publish, then remove: the removal planned on the draft answers PHOTOS_REQUIRED_WHILE_VISIBLE", async () => {
    const draft = await readyDraft();
    hooks.beforePhotoWrite = publishedElsewhere(draft);
    const result = await call("shelter.photos.remove", {
      animalId: draft.id,
      expectedPhotoKeys: [PHOTO.storageKey],
      storageKey: PHOTO.storageKey,
    });
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("PHOTOS_REQUIRED_WHILE_VISIBLE");
    const stored = await reload(draft.id);
    expect(stored.listing.kind).toBe("published");
    expect(stored.photos).toEqual([PHOTO]);
  });

  it("remove, then publish: the publish planned with the photo answers PUBLISH_REQUIREMENTS_UNMET [photo]", async () => {
    const draft = await readyDraft();
    hooks.beforeListingWrite = async () => {
      await realRepo(db).writePhotosIf(
        draft.id,
        { next: [], expected: [PHOTO] },
        { next: { kind: "draft" }, expected: { kind: "draft" } },
        new Date(),
        {
          id: crypto.randomUUID(),
          entry: {
            kind: "animal_edited",
            at: new Date(),
            actor: { kind: "shelter_admin", shelterAdminId: ADMIN },
            animalId: draft.id,
            animalName: draft.name,
            fields: ["photos"],
          },
        },
      );
    };
    const result = await call("shelter.animals.transition", {
      animalId: draft.id,
      event: { type: "publish" },
    });
    expect(result.status).toBe(422);
    expect(result.body).toMatchObject({
      code: "PUBLISH_REQUIREMENTS_UNMET",
      data: { gaps: [{ kind: "photo" }] },
    });
    const stored = await reload(draft.id);
    expect(stored.listing.kind).toBe("draft");
    expect(stored.photos).toEqual([]);
  });
});

describe("a publish and a description-clearing save can't leave an incomplete public card", () => {
  it("clear, then publish: the publish planned on the description answers PUBLISH_REQUIREMENTS_UNMET [description]", async () => {
    const draft = await readyDraft();
    hooks.beforeListingWrite = async () => {
      await realRepo(db).writeEditIf(
        { ...draft, description: null, lastUpdatedAt: new Date(), version: draft.version + 1 },
        cityId as never,
        draft.version,
        {
          id: crypto.randomUUID(),
          entry: {
            kind: "animal_edited",
            at: new Date(),
            actor: { kind: "shelter_admin", shelterAdminId: ADMIN },
            animalId: draft.id,
            animalName: draft.name,
            fields: ["description"],
          },
        },
      );
    };
    const result = await call("shelter.animals.transition", {
      animalId: draft.id,
      event: { type: "publish" },
    });
    expect(result.status).toBe(422);
    expect(result.body).toMatchObject({
      code: "PUBLISH_REQUIREMENTS_UNMET",
      data: { gaps: [{ kind: "description" }] },
    });
    expect((await reload(draft.id)).listing.kind).toBe("draft");
  });

  it("publish, then clear: the save planned on the draft is CONFLICT, the card keeps its description", async () => {
    const draft = await readyDraft();
    hooks.beforeEditWrite = publishedElsewhere(draft);
    const result = await call("shelter.animals.update", {
      animalId: draft.id,
      expectedVersion: draft.version,
      patch: { description: null },
    });
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("CONFLICT");
    const stored = await reload(draft.id);
    expect(stored.listing.kind).toBe("published");
    expect(stored.description).toEqual(draft.description);
  });
});

/**
 * RH-B3 at the point where it can actually break: a photo added between the
 * form save's own read and its write. `photos.test.ts` runs his scenario as
 * he gave it (a stale read on the client); this one would catch a save that
 * wrote the photos column from its read.
 */
describe("a photo added between a form save's read and its write survives the save (RH-B3)", () => {
  it("keeps the photo list and the confirmation date the photo write set", async () => {
    const listed = makeAnimal({ shelterId: shelter.id, photos: [PHOTO] });
    await animalRepo(db).insert(listed, cityId as never);
    const second = { ...PHOTO, storageKey: "animals/race/2" };
    const photoAt = new Date(Date.now() + 60_000);
    hooks.beforeEditWrite = async () => {
      const current = await reload(listed.id);
      const listing =
        current.listing.kind === "published"
          ? { ...current.listing, confirmedAt: photoAt, undoable: null }
          : current.listing;
      await realRepo(db).writePhotosIf(
        listed.id,
        { next: [PHOTO, second], expected: [PHOTO] },
        { next: listing, expected: current.listing },
        photoAt,
        {
          id: crypto.randomUUID(),
          entry: {
            kind: "animal_edited",
            at: photoAt,
            actor: { kind: "shelter_admin", shelterAdminId: ADMIN },
            animalId: listed.id,
            animalName: listed.name,
            fields: ["photos"],
          },
        },
      );
    };
    const result = await call("shelter.animals.update", {
      animalId: listed.id,
      expectedVersion: listed.version,
      patch: { name: "Нове імʼя" },
    });
    expect(result.status).toBe(200);
    const stored = await reload(listed.id);
    expect(stored.name).toBe("Нове імʼя");
    expect(stored.photos).toEqual([PHOTO, second]);
    expect(stored.listing).toMatchObject({ kind: "published", confirmedAt: photoAt });
  });
});
