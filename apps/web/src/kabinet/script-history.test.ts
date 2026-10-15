import { insertShelterFromScript, recordAnimalsImported } from "@opika/db";
import { cityRepo, kabinetShelterRepo } from "@opika/db/repos";
import { makeCity, makeShelter, setupTestDatabase, truncateAll } from "@opika/db/test";
import type { ModeratorId, ShelterAdminId } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { fromRpcBody, toRpcBody } from "../api/test-harness";
import { SHELTER_WRITE_POLICY } from "./access";
import { capturingInvitationSender } from "./email-senders";
import { handleKabinetRpc } from "./rpc-route";

/**
 * RG-Q8 (Oleksii): "onboard-shelter.ts (and any other script that writes
 * shelter or animal data) records shelter_history entries with the operator
 * as actor … Test: script import → history rows present and visible through
 * the new read." The scripts' write path, then the shelter's own read.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const NOW = new Date("2026-10-13T10:00:00.000Z");
const FOUNDER = "0ec0ec0e-0000-4000-8000-0000000000f0" as ModeratorId;

async function asShelterAdmin(shelterId: string, path: string, input: unknown) {
  const request = new Request(`http://localhost/api/kabinet/${path.replaceAll(".", "/")}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
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
    resolve: async () => ({
      principal: {
        kind: "shelter_admin",
        shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
        shelterId: shelterId as never,
      },
      userId: "user-1",
      db,
      cursorSecret: "test-cursor-secret",
    }),
    limiters: {
      perUser: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 1000 }),
      perIp: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 1000 }),
    },
    ip: "203.0.113.1",
    now: NOW,
    newId: () => crypto.randomUUID(),
    operatorDisplayName: "Олексій",
    locationPolicy: null,
    production: false,
    shelterWrites: SHELTER_WRITE_POLICY,
  });
  return fromRpcBody(JSON.parse(await response.text())) as { items: unknown[] };
}

describe("script history (RG-Q8)", () => {
  it("a script import is in the shelter's own history, with the operator as actor", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = makeShelter({
      publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
    });
    const by = { moderatorId: FOUNDER, now: NOW, newId: () => crypto.randomUUID() };
    await insertShelterFromScript(db, shelter, by);
    await recordAnimalsImported(db, shelter.id, 3, { ...by, now: new Date(NOW.getTime() + 1000) });

    const seen = await asShelterAdmin(shelter.id, "shelter.history.list", {
      cursor: null,
      limit: 10,
    });
    expect(seen.items).toEqual([
      {
        kind: "animals_imported",
        at: new Date(NOW.getTime() + 1000),
        actor: { kind: "operator", displayName: "Олексій" },
        count: 3,
      },
      { kind: "shelter_created", at: NOW, actor: { kind: "operator", displayName: "Олексій" } },
    ]);
    // The operator's record names who and how; the shelter's view doesn't carry the id.
    expect(await kabinetShelterRepo(db).historyOf(shelter.id)).toContainEqual({
      kind: "shelter_created",
      at: NOW,
      moderatorId: FOUNDER,
      via: "script",
    });
  });

  it("records nothing for a batch that inserted no animal", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = makeShelter({
      publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
    });
    const by = { moderatorId: FOUNDER, now: NOW, newId: () => crypto.randomUUID() };
    await insertShelterFromScript(db, shelter, by);
    await recordAnimalsImported(db, shelter.id, 0, by);
    expect((await kabinetShelterRepo(db).historyOf(shelter.id)).map((entry) => entry.kind)).toEqual(
      ["shelter_created"],
    );
  });
});
