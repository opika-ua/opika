import type { KabinetShelterView } from "@opika/contracts";
import { cityRepo, kabinetShelterRepo, shelterRepo } from "@opika/db/repos";
import {
  imageFactsOf,
  makeCity,
  makeShelter,
  setupTestDatabase,
  testJpeg,
  truncateAll,
} from "@opika/db/test";
import type { Shelter, ShelterAdminId } from "@opika/domain";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inMemoryRateLimiter, type RateLimiter } from "../api/rate-limit";
import { fromRpcBody, rpcRequestInit } from "../api/test-harness";
import { SHELTER_WRITE_POLICY } from "./access";
import type { KabinetPrincipal } from "./actor";
import { capturingInvitationSender } from "./email-senders";
import { capturingPasswordMail } from "./password-mail";
import { PHOTO_PROCESSING_BUDGET_MS, type PhotoUploads } from "./photo-uploads";
import { handleKabinetRpc } from "./rpc-route";

/**
 * `shelter.logo.*` (pet card PR 3b), through the served router: a real
 * `Request` encoded the way oRPC's client encodes an upload (multipart), the
 * access middleware, the handler, real sharp (through the db package, via
 * `prepareUploadedLogo`/`LOGO_VARIANTS`) and real Postgres. The same
 * plumbing `kabinet/photos.test.ts` uses for `shelter.photos.*`, scoped to
 * the shelter's own view instead of an animal's.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
afterEach(() => {
  vi.restoreAllMocks();
});

const ADMIN = "33333333-3333-4333-8333-333333333333" as ShelterAdminId;
const ORIGIN = "http://localhost";
let shelter: Shelter;
let asAdmin: KabinetPrincipal;

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  const created = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
  });
  await shelterRepo(db).insert(created);
  shelter = created;
  asAdmin = { kind: "shelter_admin", shelterAdminId: ADMIN, shelterId: shelter.id };
});

type Put = { key: string; contentType: string; bytes: Buffer };

function capturingStore() {
  const puts: Put[] = [];
  return {
    puts,
    storage: {
      async put(key: string, bytes: Buffer, contentType: string) {
        puts.push({ key, contentType, bytes });
      },
    },
  };
}

const generous = () => inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 });

function uploadsOn(
  store = capturingStore(),
  limiters: { perHour?: RateLimiter; perDay?: RateLimiter } = {},
): { uploads: PhotoUploads; puts: Put[] } {
  return {
    puts: store.puts,
    uploads: {
      kind: "on",
      storage: store.storage,
      limiters: { perHour: limiters.perHour ?? generous(), perDay: limiters.perDay ?? generous() },
      processingBudgetMs: PHOTO_PROCESSING_BUDGET_MS,
    },
  };
}

async function call(
  path: string,
  input: unknown,
  opts: { uploads: PhotoUploads },
): Promise<{ status: number; body: KabinetShelterView }> {
  const { body, headers } = rpcRequestInit(input);
  const request = new Request(`${ORIGIN}/api/kabinet/${path.replaceAll(".", "/")}`, {
    method: "POST",
    headers: { ...headers, origin: ORIGIN },
    body,
  });
  const response = await handleKabinetRpc(request, {
    availability: {
      kind: "available",
      passwordMail: capturingPasswordMail(),
      sender: { send: async () => {} },
      invites: capturingInvitationSender(),
      secret: "x",
      baseURL: ORIGIN,
    },
    limiters: { perUser: generous(), perIp: generous() },
    ip: "203.0.113.1",
    resolve: async () => ({
      principal: asAdmin,
      userId: "user-admin",
      db,
      cursorSecret: "test-cursor-secret",
    }),
    now: new Date(),
    newId: () => crypto.randomUUID(),
    operatorDisplayName: "Олексій",
    locationPolicy: null,
    production: false,
    shelterWrites: SHELTER_WRITE_POLICY,
    photoUploads: opts.uploads,
  });
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = fromRpcBody(JSON.parse(text));
  } catch {
    // a plain-text refusal
  }
  return { status: response.status, body: parsed as KabinetShelterView };
}

const errorOf = (body: unknown) => body as { code?: string; data?: unknown };

const jpeg = async (gpsCanary?: string) =>
  new File(
    [new Uint8Array(await testJpeg(gpsCanary === undefined ? {} : { gpsCanary }))],
    "logo.jpg",
    { type: "image/jpeg" },
  );

const svgFile = () =>
  new File(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], "logo.jpg", {
    type: "image/jpeg",
  });

const logoHistory = async () =>
  (await kabinetShelterRepo(db).historyOf(shelter.id)).filter(
    (entry) => entry.kind === "logo_changed",
  );

describe("shelter.logo.set", () => {
  it("stores the two WebP variants under a fresh random key and sets the logo", async () => {
    const { uploads, puts } = uploadsOn();

    const result = await call("shelter.logo.set", { file: await jpeg() }, { uploads });

    expect(result.status).toBe(200);
    const logo = result.body.logo;
    expect(logo?.storageKey).toMatch(
      new RegExp(
        `^shelters/${shelter.id}/logo/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`,
      ),
    );
    expect(puts.map((p) => p.key).sort()).toEqual(
      ["large", "small"].map((v) => `${logo?.storageKey}/${v}.webp`),
    );
    expect(puts.every((p) => p.contentType === "image/webp")).toBe(true);
    for (const put of puts) expect((await imageFactsOf(put.bytes)).format).toBe("webp");

    const stored = await shelterRepo(db).findById(shelter.id);
    expect(stored?.logo).toEqual(logo);
    expect(stored?.version).toBe(shelter.version + 1);

    const history = await logoHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ previous: null, next: logo });
  });

  it("replacing an existing logo gets a fresh key, previous and next in history, and the old object still untouched (the R2 clean-up job reclaims it, not this write)", async () => {
    const { uploads } = uploadsOn();
    const first = (await call("shelter.logo.set", { file: await jpeg() }, { uploads })).body.logo;
    const second = (await call("shelter.logo.set", { file: await jpeg() }, { uploads })).body.logo;

    expect(second?.storageKey).not.toBe(first?.storageKey);
    const stored = await shelterRepo(db).findById(shelter.id);
    expect(stored?.logo).toEqual(second);

    // historyOf is newest-first: [0] is this replace, [1] the first set.
    const history = await logoHistory();
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ previous: first, next: second });
    expect(history[1]).toMatchObject({ previous: null, next: first });
  });

  it("a GPS-tagged upload is stored without its location, end to end (same stripping as animal photos)", async () => {
    const { uploads, puts } = uploadsOn();
    const result = await call(
      "shelter.logo.set",
      { file: await jpeg("CANARY-LOGO-LOCATION") },
      { uploads },
    );
    expect(result.status).toBe(200);
    for (const put of puts) {
      expect(put.bytes.toString("latin1")).not.toContain("CANARY-LOGO-LOCATION");
    }
  });

  it("a file that isn't a real image is PHOTO_REJECTED, in the logo's own words, and nothing is stored", async () => {
    const { uploads, puts } = uploadsOn();
    const result = await call("shelter.logo.set", { file: svgFile() }, { uploads });
    expect(result.status).toBe(422);
    expect(errorOf(result.body).code).toBe("PHOTO_REJECTED");
    expect(puts).toEqual([]);
    expect((await shelterRepo(db).findById(shelter.id))?.logo).toBeNull();
  });

  it("uploads off is PHOTO_UPLOADS_UNAVAILABLE, charged nothing", async () => {
    const result = await call(
      "shelter.logo.set",
      { file: await jpeg() },
      { uploads: { kind: "off", because: "not_configured" } },
    );
    expect(result.status).toBe(503);
    expect(errorOf(result.body).code).toBe("PHOTO_UPLOADS_UNAVAILABLE");
  });

  it("shares the animal-photo upload allowance (a decision taken, not a separate limiter pool) - exhausting it rate-limits a logo set too", async () => {
    const exhausted = inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 0 });
    const { uploads } = uploadsOn(capturingStore(), { perHour: exhausted });
    const result = await call("shelter.logo.set", { file: await jpeg() }, { uploads });
    expect(result.status).toBe(429);
    expect(errorOf(result.body).code).toBe("RATE_LIMITED");
  });
});

describe("shelter.logo.remove", () => {
  it("clears the logo and records previous/next in history", async () => {
    const { uploads } = uploadsOn();
    const set = await call("shelter.logo.set", { file: await jpeg() }, { uploads });
    const logo = set.body.logo;

    const result = await call("shelter.logo.remove", {}, { uploads });
    expect(result.status).toBe(200);
    expect(result.body.logo).toBeNull();
    expect((await shelterRepo(db).findById(shelter.id))?.logo).toBeNull();

    // historyOf is newest-first: [0] is this remove, [1] the original set.
    const history = await logoHistory();
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ previous: logo, next: null });
  });

  it("with no logo set, is a no-op: no history line, no version bump", async () => {
    const { uploads } = uploadsOn();
    const result = await call("shelter.logo.remove", {}, { uploads });
    expect(result.status).toBe(200);
    expect(result.body.version).toBe(shelter.version);
    expect(await logoHistory()).toEqual([]);
  });
});
