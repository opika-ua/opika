import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { KabinetAccess } from "@opika/contracts";
import { animalRepo, cityRepo, kabinetShelterRepo, shelterRepo } from "@opika/db/repos";
import { makeAnimal, makeCity, makeShelter, setupTestDatabase, truncateAll } from "@opika/db/test";
import type { Animal, Shelter, ShelterAdminId } from "@opika/domain";
import { isLazy, isProcedure } from "@orpc/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { fromRpcBody, toRpcBody } from "../api/test-harness";
import { SHELTER_WRITE_POLICY, type ShelterWritePolicy, shelterWritePolicyOf } from "./access";
import type { KabinetPrincipal } from "./actor";
import { capturingInvitationSender } from "./email-senders";
import { handleKabinetRpc, kabinetRouter } from "./rpc-route";

/**
 * KH-Q1: until PR 6 of the K milestone, every `shelter.*` write refuses a
 * shelter admin with `SHELTER_WRITES_NOT_YET_AVAILABLE`, through the served
 * router with the served policy, for every shelter outside the K-Q17
 * allowlist (`KABINET_WRITE_ALLOWLIST`, unset here, which is the refusal). The procedures are found by walking the router actually
 * mounted on `/api/kabinet/*` and reading the access each one declares, not
 * from a list written here, so a write added later is refused by the same
 * assertions automatically. The count is pinned too (`toHaveLength(16)`), as
 * a tripwire: a new write fails it, and the edit that bumps it is where
 * someone confirms the new write belongs behind the refusal.
 */

type Leaf = { path: string; access: KabinetAccess | null };

function leaves(node: unknown, path: readonly string[] = []): Leaf[] {
  if (isProcedure(node)) {
    const meta = node["~orpc"].meta as { access?: KabinetAccess | null };
    return [{ path: path.join("."), access: meta.access ?? null }];
  }
  if (isLazy(node))
    throw new Error(`lazy node at ${path.join(".")}: the walk can't see through it`);
  if (node !== null && typeof node === "object" && !Array.isArray(node)) {
    return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
      leaves(value, [...path, key]),
    );
  }
  return [];
}

const served = leaves(kabinetRouter);
const shelterWrites = served
  .filter((leaf) => leaf.access?.surface === "shelter" && leaf.access.mode === "write")
  .map((leaf) => leaf.path);
const shelterReads = served
  .filter((leaf) => leaf.access?.surface === "shelter" && leaf.access.mode === "read")
  .map((leaf) => leaf.path);

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

let shelter: Shelter;
let draft: Animal;
let asAdmin: KabinetPrincipal;

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  shelter = makeShelter({ publicLocation: { ...makeShelter().publicLocation, cityId: city.id } });
  await shelterRepo(db).insert(shelter);
  draft = makeAnimal({ shelterId: shelter.id, listing: { kind: "draft" } });
  await animalRepo(db).insert(draft, city.id);
  asAdmin = {
    kind: "shelter_admin",
    shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
    shelterId: shelter.id,
  };
});

async function call(
  path: string,
  input: unknown,
  principal: KabinetPrincipal,
  // What the served route passes with KABINET_WRITE_ALLOWLIST unset (pinned
  // by the source scan below).
  policy: ShelterWritePolicy = SHELTER_WRITE_POLICY,
) {
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
    resolve: async () => ({ principal, userId: "user-admin", db, cursorSecret: "test-cursor" }),
    limiters: {
      perUser: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
      perIp: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
    },
    ip: "203.0.113.1",
    now: new Date(),
    newId: () => crypto.randomUUID(),
    operatorDisplayName: "Олексій",
    locationPolicy: null,
    production: false,
    shelterWrites: policy,
  });
  const text = await response.text();
  return { status: response.status, body: text ? parsedBody(text) : null };
}

/** RPC bodies are JSON; oRPC's answer to a thrown non-ORPCError is too. */
function parsedBody(text: string): unknown {
  try {
    return fromRpcBody(JSON.parse(text));
  } catch {
    return text;
  }
}

async function snapshot() {
  return {
    shelter: await shelterRepo(db).findById(shelter.id),
    history: await kabinetShelterRepo(db).historyOf(shelter.id),
    animals: (await animalRepo(db).findByShelterId(shelter.id)).map((a) => JSON.stringify(a)),
  };
}

describe("the walk finds the shelter writes (an empty walk can't pass)", () => {
  it("finds the sixteen shelter writes, confirm, update and the photo writes among them", () => {
    expect(shelterWrites).toHaveLength(16);
    expect(shelterWrites).toEqual(
      expect.arrayContaining([
        "shelter.animals.confirm",
        "shelter.animals.update",
        "shelter.photos.add",
        "shelter.photos.reorder",
        "shelter.photos.remove",
        "shelter.profile.updateContact",
        "shelter.verification.requestReview",
      ]),
    );
  });

  it("and the four shelter reads, which stay open", () => {
    expect(shelterReads.sort()).toEqual(
      [
        "shelter.animals.byId",
        "shelter.animals.list",
        "shelter.history.list",
        "shelter.profile.get",
      ].sort(),
    );
  });
});

describe("every shelter write refuses a shelter admin until K2/K3 (KH-Q1)", () => {
  /**
   * Sent with a real animal id and an otherwise empty input: the refusal is
   * the access middleware's, ahead of input validation and of the handler.
   * Were validation first, these would answer 400, and the test would fail
   * rather than pass on the wrong reason.
   */
  it.each(shelterWrites)(
    "%s → 403 SHELTER_WRITES_NOT_YET_AVAILABLE, nothing written",
    async (path) => {
      const before = await snapshot();
      const result = await call(path, { animalId: draft.id }, asAdmin);
      expect(result.status).toBe(403);
      expect(result.body).toMatchObject({ code: "SHELTER_WRITES_NOT_YET_AVAILABLE" });
      expect(await snapshot()).toEqual(before);
    },
  );
});

describe("reads stay open to a shelter admin", () => {
  const INPUTS: Record<string, () => unknown> = {
    "shelter.profile.get": () => ({}),
    "shelter.history.list": () => ({ cursor: null }),
    "shelter.animals.list": () => ({ filter: { kind: "all" }, cursor: null }),
    "shelter.animals.byId": () => ({ animalId: draft.id }),
  };

  it("has an input for every read the walk found", () => {
    expect(Object.keys(INPUTS).sort()).toEqual([...shelterReads].sort());
  });

  it.each(shelterReads)("%s → 200", async (path) => {
    const input = INPUTS[path];
    if (input === undefined) throw new Error(`no input for ${path}`);
    expect((await call(path, input(), asAdmin)).status).toBe(200);
  });
});

describe("a support view is refused writes exactly as before", () => {
  it.each(shelterWrites)("%s → 403 FORBIDDEN, not the not-yet code", async (path) => {
    const support: KabinetPrincipal = {
      kind: "support_view",
      moderatorId: "11111111-1111-4111-8111-111111111111" as never,
      shelterId: shelter.id,
    };
    const result = await call(path, { animalId: draft.id }, support);
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ code: "FORBIDDEN" });
  });
});

/**
 * K-Q17 (Oleksii, verbatim: "one open path for that id"): the allowlist opens
 * the listed shelter's writes and nobody else's. Built the way the served
 * route builds it (`shelterWritePolicyOf` over the environment), and
 * production-legal: the same answers with NODE_ENV and VERCEL_ENV set to
 * production, where the test-only policy would 500.
 */
describe("the allowlist opens one shelter's writes, and only that one's (K-Q17)", () => {
  let other: Shelter;
  let otherDraft: Animal;
  let asOtherAdmin: KabinetPrincipal;

  beforeEach(async () => {
    const city = (await cityRepo(db).findById(shelter.publicLocation.cityId)) ?? makeCity();
    other = makeShelter({ publicLocation: { ...makeShelter().publicLocation, cityId: city.id } });
    await shelterRepo(db).insert(other);
    otherDraft = makeAnimal({ shelterId: other.id, listing: { kind: "draft" } });
    await animalRepo(db).insert(otherDraft, city.id);
    asOtherAdmin = {
      kind: "shelter_admin",
      shelterAdminId: "44444444-4444-4444-8444-444444444444" as ShelterAdminId,
      shelterId: other.id,
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const allowlisted = () => shelterWritePolicyOf({ KABINET_WRITE_ALLOWLIST: shelter.id });
  const otherSnapshot = async () => ({
    shelter: await shelterRepo(db).findById(other.id),
    history: await kabinetShelterRepo(db).historyOf(other.id),
    animals: (await animalRepo(db).findByShelterId(other.id)).map((a) => JSON.stringify(a)),
  });

  for (const deployed of [false, true]) {
    const where = deployed ? "on a production deployment" : "locally";
    it(`${where}: the listed shelter's admin writes (a real write, 200)`, async () => {
      if (deployed) {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("VERCEL_ENV", "production");
        vi.stubEnv("RATE_LIMIT_KEY_SECRET", "test-rate-limit-key-secret-0123456789abcdef");
      }
      const result = await call(
        "shelter.profile.proposeDonation",
        { url: "https://example.org/give" },
        asAdmin,
        allowlisted(),
      );
      expect(result.status).toBe(200);
      expect((await shelterRepo(db).findById(shelter.id))?.pendingDonation?.link.url).toBe(
        "https://example.org/give",
      );
    });

    it.each(shelterWrites)(
      `${where}: %s refuses a shelter outside the list, nothing written`,
      async (path) => {
        if (deployed) {
          vi.stubEnv("NODE_ENV", "production");
          vi.stubEnv("VERCEL_ENV", "production");
          vi.stubEnv("RATE_LIMIT_KEY_SECRET", "test-rate-limit-key-secret-0123456789abcdef");
        }
        const before = await otherSnapshot();
        const result = await call(path, { animalId: otherDraft.id }, asOtherAdmin, allowlisted());
        expect(result.status).toBe(403);
        expect(result.body).toMatchObject({ code: "SHELTER_WRITES_NOT_YET_AVAILABLE" });
        expect(await otherSnapshot()).toEqual(before);
      },
    );
  }

  it.each(shelterWrites)(
    "%s passes access for the listed shelter (no not-yet refusal)",
    async (path) => {
      const result = await call(path, { animalId: draft.id }, asAdmin, allowlisted());
      expect(result.body).not.toMatchObject({ code: "SHELTER_WRITES_NOT_YET_AVAILABLE" });
      expect(result.status).not.toBe(403);
    },
  );

  it.each(shelterWrites)("%s still refuses a support view of the listed shelter", async (path) => {
    const support: KabinetPrincipal = {
      kind: "support_view",
      moderatorId: "11111111-1111-4111-8111-111111111111" as never,
      shelterId: shelter.id,
    };
    const result = await call(path, { animalId: draft.id }, support, allowlisted());
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ code: "FORBIDDEN" });
  });
});

/**
 * KH-T1: even if a deployed instance were handed the test-only policy, the
 * served router refuses the request outright (500, nothing written) rather
 * than open writes. `accessOrThrow` reads `process.env` itself, so the stub
 * below is the only way to reach it.
 */
describe("the test-only policy fails closed on a deployed instance (KH-T1)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sanity: outside a deployment it opens a write (so the refusals below mean something)", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    const result = await call("shelter.animals.deleteDraft", { animalId: draft.id }, asAdmin, {
      kind: "open_for_tests_only",
    });
    expect(result.status).toBe(200);
  });

  it.each([
    ["NODE_ENV=production", "NODE_ENV", "production"],
    ["VERCEL_ENV=preview", "VERCEL_ENV", "preview"],
  ])("%s: a write answers 500 and writes nothing", async (_label, name, value) => {
    vi.stubEnv(name, value);
    // A real Preview has its own limiter secret (EM-B6: required on every
    // Vercel deployment); without one the limiter refuses first and this case
    // would never reach the write policy it is about.
    vi.stubEnv("RATE_LIMIT_KEY_SECRET", "test-rate-limit-key-secret-0123456789abcdef");
    const before = await snapshot();
    const result = await call("shelter.animals.deleteDraft", { animalId: draft.id }, asAdmin, {
      kind: "open_for_tests_only",
    });
    expect(result.status).toBe(500);
    expect(await snapshot()).toEqual(before);
  });

  it("NODE_ENV=production: a read answers 500 too, not 200", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const result = await call("shelter.profile.get", {}, asAdmin, {
      kind: "open_for_tests_only",
    });
    expect(result.status).toBe(500);
  });
});

/**
 * The policy reaches `decideAccess` through the request context, so the
 * served refusal holds only if no non-test file ever builds the open variant.
 * Its literal, `open_for_tests_only`, is unique in the codebase (unlike a
 * plain `"open"`, which `features/reveal` uses for something else), so a
 * scan for it catches every spelling of the use site: an object literal,
 * a shorthand property (`{ ...base, shelterWrites }`), a spread, a computed
 * key. Only `kabinet/access.ts`, which defines it, may contain it. Scanned
 * like `no-self-serve-yet.test.ts`.
 *
 * (The earlier scan matched `shelterWrites: <value>` and was bypassed by a
 * shorthand property: review of the hardening, finding 1.)
 */
const OPEN_LITERAL = "open_for_tests_only";
const DEFINED_IN = "apps/web/src/kabinet/access.ts";

function filesNamingOpenPolicy(files: readonly { path: string; text: string }[]): string[] {
  return files.filter((file) => file.text.includes(OPEN_LITERAL)).map((file) => file.path);
}

describe("outside tests, only access.ts names the open policy", () => {
  const REPO = resolve(fileURLToPath(import.meta.url), "../../../../..");
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sources(path);
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
  const nonTestFiles = ["apps/web/src", "packages"].flatMap((root) =>
    sources(join(REPO, root)).map((file) => ({
      path: relative(REPO, file).replaceAll("\\", "/"),
      text: readFileSync(file, "utf8"),
    })),
  );

  it("sanity: the scan reads the served route, the home page and access.ts", () => {
    const paths = nonTestFiles.map((file) => file.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "apps/web/src/app/api/kabinet/[...rpc]/route.ts",
        "apps/web/src/features/kabinet/home.ts",
        DEFINED_IN,
      ]),
    );
  });

  it("names it in access.ts and nowhere else", () => {
    expect(filesNamingOpenPolicy(nonTestFiles)).toEqual([DEFINED_IN]);
  });

  it("catches the reviewer's shorthand-property bypass, and an object literal", () => {
    const shorthand = [
      'const shelterWrites = { kind: "open_for_tests_only" } as const;',
      "return { ...base, shelterWrites };",
    ].join("\n");
    const literal = 'context: { ...rest, shelterWrites: { kind: "open_for_tests_only" } },';
    expect(
      filesNamingOpenPolicy([
        { path: "apps/web/src/kabinet/shorthand.ts", text: shorthand },
        { path: "apps/web/src/kabinet/literal.ts", text: literal },
        { path: "apps/web/src/kabinet/constant.ts", text: "shelterWrites: SHELTER_WRITE_POLICY," },
      ]),
    ).toEqual(["apps/web/src/kabinet/shorthand.ts", "apps/web/src/kabinet/literal.ts"]);
  });

  // K-Q17's scans (the route and the page build their policy with
  // `shelterWritePolicyOf(process.env)`, and only access.ts names the
  // allowlist variant) live in no-self-serve-yet.test.ts, the test K-Q17 names.

  it("the served constant is the refusal, and frozen", () => {
    expect(SHELTER_WRITE_POLICY).toEqual({ kind: "refused_until_edit_screens" });
    expect(Object.isFrozen(SHELTER_WRITE_POLICY)).toBe(true);
    expect(() => {
      (SHELTER_WRITE_POLICY as { kind: string }).kind = OPEN_LITERAL;
    }).toThrow(TypeError);
  });
});
