import {
  adopterRepo,
  animalRepo,
  cityRepo,
  kabinetShelterRepo,
  revealRepo,
  shelterRepo,
  swipeRepo,
} from "@opika/db/repos";
import {
  makeAdopter,
  makeAnimal,
  makeCity,
  makeReveal,
  makeShelter,
  makeSwipe,
  setupTestDatabase,
  truncateAll,
} from "@opika/db/test";
import {
  type Animal,
  type AnimalListingState,
  LISTING_EVENT_TYPES,
  LISTING_KINDS,
  type ListingEvent,
  type ListingEventType,
  type Shelter,
  type ShelterAdminId,
  type ShelterHistoryEntry,
  transitionListing,
  UNDO_WINDOW_MS,
} from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { fromRpcBody, toRpcBody } from "../api/test-harness";
import { SHELTER_WRITE_POLICY } from "./access";
import type { KabinetPrincipal } from "./actor";
import { capturingInvitationSender } from "./email-senders";
import { PHOTO_UPLOADS_NOT_CONFIGURED } from "./photo-uploads";
import { handleKabinetRpc } from "./rpc-route";

/**
 * K2's listing moves as one exhaustive table (PR 5): every starting listing
 * against every move a shelter can make through the kabinet, legal or not,
 * through the served router and a real database.
 *
 * The table is written out by hand below, and tied to the domain twice: one
 * test checks that the hand table agrees with `transitionListing` for every
 * listing event, so a change to the domain's table turns this red until the
 * hand table is edited to match; and the columns must be exactly the domain's
 * events plus `delete_draft`, so a new event can't go untested. Each case
 * then checks what the router actually did against the same hand table.
 *
 * What every case asserts besides the answer:
 * - a move writes exactly the listing the domain computes, and nothing else:
 *   `last_updated_at` and `version` stay as they were (HS-T9, RG-Q7);
 * - a recorded move leaves one `animal_listing_changed` line, a confirmation
 *   or its undo none (K-Q7, S1), a refusal none and changes nothing;
 * - a form opened before the move still saves afterwards (HS-T8: an open form
 *   and a listing move never conflict);
 * - the answer doesn't vary with whether adopters swiped or asked about the
 *   animal (commitment #2): every non-draft case runs on a twin that has a
 *   swipe and a reveal, and the two answers must be identical but for the id.
 *   A draft gets no twin: no swipe or reveal can reach one (DR-F1), and the
 *   one place activity does matter, deleting a draft, answers one refusal for
 *   both causes (K-Q9; `handlers.test.ts`).
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const ADMIN = "33333333-3333-4333-8333-333333333333" as ShelterAdminId;
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-18T12:00:00.000Z");
const before = (ms: number) => new Date(NOW.getTime() - ms);

/** Every instant distinct, so carrying the wrong one forward is visible. */
const PUBLISHED_AT = before(40 * DAY);
const CONFIRMED_AT = before(20 * DAY);
const SINCE = before(10 * DAY);
const ENDED_AT = before(5 * DAY);
/** Two seconds before NOW: a «Ще шукає» whose 8-second undo is still open. */
const JUST_CONFIRMED = before(2_000);
const EDITED = before(30 * DAY);
const VERSION = 3;
const PHOTO = { storageKey: "animals/k2/table", width: 800, height: 1000, alt: null };
const WITHDRAWAL = { code: "transferred", note: "Переїхав до іншого притулку" } as const;

const STARTS = {
  draft: { kind: "draft" },
  published: {
    kind: "published",
    publishedAt: PUBLISHED_AT,
    confirmedAt: CONFIRMED_AT,
    undoable: null,
  },
  published_undoable: {
    kind: "published",
    publishedAt: PUBLISHED_AT,
    confirmedAt: JUST_CONFIRMED,
    undoable: { previousConfirmedAt: CONFIRMED_AT, confirmedAt: JUST_CONFIRMED },
  },
  reserved: {
    kind: "reserved",
    since: SINCE,
    publishedAt: PUBLISHED_AT,
    confirmedAt: CONFIRMED_AT,
    undoable: null,
  },
  reserved_undoable: {
    kind: "reserved",
    since: SINCE,
    publishedAt: PUBLISHED_AT,
    confirmedAt: JUST_CONFIRMED,
    undoable: { previousConfirmedAt: CONFIRMED_AT, confirmedAt: JUST_CONFIRMED },
  },
  adopted: { kind: "adopted", adoptedAt: ENDED_AT },
  withdrawn: {
    kind: "withdrawn",
    withdrawnAt: ENDED_AT,
    reason: { code: "listing_error", note: "Помилка в картці" },
  },
} as const satisfies Record<string, AnimalListingState>;
type Start = keyof typeof STARTS;
const START_NAMES = Object.keys(STARTS) as Start[];

type Action = ListingEventType | "delete_draft";
/** The table's columns, in this order. */
const ACTIONS = [
  "publish",
  "reserve",
  "release",
  "adopt",
  "withdraw",
  "restore_to_draft",
  "confirm",
  "undo_confirm",
  "delete_draft",
] as const satisfies readonly Action[];

const OK = "ok";
const NO = "ILLEGAL_TRANSITION";
const LATE = "UNDO_EXPIRED";
type Outcome = typeof OK | typeof NO | typeof LATE;

/**
 * The hand table. Columns: publish, reserve, release, adopt, withdraw,
 * restore_to_draft, confirm, undo_confirm, delete_draft. Read across a row:
 * adopted is terminal (H2-7); a draft is deleted, never withdrawn; only a
 * visible card is confirmed, and only one confirmed within the window can be
 * undone (UNDO_EXPIRED otherwise: the move exists, it just isn't available).
 */
const TABLE: Record<Start, readonly Outcome[]> = {
  draft: [OK, NO, NO, NO, NO, NO, NO, NO, OK],
  published: [NO, OK, NO, OK, OK, NO, OK, LATE, NO],
  published_undoable: [NO, OK, NO, OK, OK, NO, OK, OK, NO],
  reserved: [NO, NO, OK, OK, OK, NO, OK, LATE, NO],
  reserved_undoable: [NO, NO, OK, OK, OK, NO, OK, OK, NO],
  adopted: [NO, NO, NO, NO, NO, NO, NO, NO, NO],
  withdrawn: [NO, NO, NO, NO, NO, OK, NO, NO, NO],
};

const expectedOutcome = (start: Start, action: Action): Outcome => {
  const outcome = TABLE[start][ACTIONS.indexOf(action)];
  if (outcome === undefined) throw new Error(`No cell for ${start} × ${action}`);
  return outcome;
};

/** The domain event a kabinet action stands for, stamped NOW as the server stamps it. */
const domainEvent = (type: ListingEventType): ListingEvent =>
  type === "withdraw" ? { type, at: NOW, reason: WITHDRAWAL } : { type, at: NOW };

let shelter: Shelter;
let cityId: string;

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  cityId = city.id;
  shelter = makeShelter({ publicLocation: { ...makeShelter().publicLocation, cityId: city.id } });
  await shelterRepo(db).insert(shelter);
});

const generous = () => inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 });

type Answer = { status: number; body: Record<string, unknown> };

async function call(path: string, input: unknown): Promise<Answer> {
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
        sender: { send: async () => {} },
        invites: capturingInvitationSender(),
        secret: "x",
        baseURL: "http://localhost",
      },
      limiters: { perUser: generous(), perIp: generous() },
      ip: "203.0.113.1",
      resolve: async () => ({ principal, userId: "user-admin", db, cursorSecret: "secret" }),
      now: NOW,
      newId: () => crypto.randomUUID(),
      operatorDisplayName: "Олексій",
      locationPolicy: null,
      production: false,
      // The served policy (shelter writes open, `shelter-writes-open.test.ts`).
      shelterWrites: SHELTER_WRITE_POLICY,
      photoUploads: PHOTO_UPLOADS_NOT_CONFIGURED,
    },
  );
  const text = await response.text();
  return {
    status: response.status,
    body: (text ? fromRpcBody(JSON.parse(text)) : {}) as Record<string, unknown>,
  };
}

const act = (action: Action, animalId: string): Promise<Answer> => {
  switch (action) {
    case "confirm":
      return call("shelter.animals.confirm", { animalId });
    case "undo_confirm":
      return call("shelter.animals.undoConfirm", { animalId });
    case "delete_draft":
      return call("shelter.animals.deleteDraft", { animalId });
    case "withdraw":
      return call("shelter.animals.transition", {
        animalId,
        event: { type: "withdraw", reason: WITHDRAWAL },
      });
    default:
      return call("shelter.animals.transition", { animalId, event: { type: action } });
  }
};

/** A complete animal with one photo in the given listing, edited long ago at a version past zero. */
async function animalAt(start: Start): Promise<Animal> {
  const animal = makeAnimal({
    shelterId: shelter.id,
    listing: STARTS[start],
    photos: [PHOTO],
    lastUpdatedAt: EDITED,
    version: VERSION,
  });
  await animalRepo(db).insert(animal, cityId as never);
  return animal;
}

/** The same, plus an adopter's swipe and contact reveal pointing at it. */
async function animalWithActivityAt(start: Start): Promise<Animal> {
  const animal = await animalAt(start);
  const adopter = makeAdopter();
  await adopterRepo(db).insert(adopter);
  await swipeRepo(db).record(
    makeSwipe({ adopterId: adopter.id, animalId: animal.id, direction: "interested", at: SINCE }),
  );
  await revealRepo(db).insert(
    makeReveal({
      adopterId: adopter.id,
      animalId: animal.id,
      shelterId: shelter.id,
      revealedAt: SINCE,
    }),
  );
  return animal;
}

const linesOf = async (animalId: string): Promise<ShelterHistoryEntry[]> =>
  (await kabinetShelterRepo(db).historyOf(shelter.id)).filter(
    (entry) => "animalId" in entry && entry.animalId === animalId,
  );

describe("the hand table", () => {
  it("has a column for every listing event the domain defines, plus delete_draft", () => {
    expect(ACTIONS.filter((action) => action !== "delete_draft").sort()).toEqual(
      [...LISTING_EVENT_TYPES].sort(),
    );
  });

  it("starts from every listing kind, both visible kinds with and without an open undo", () => {
    expect([...new Set(Object.values(STARTS).map((listing) => listing.kind))].sort()).toEqual(
      [...LISTING_KINDS].sort(),
    );
    expect(START_NAMES.length * ACTIONS.length).toBe(63);
  });

  it("agrees with the domain's transitionListing for every listing event", () => {
    const disagreements: string[] = [];
    for (const start of START_NAMES) {
      for (const action of ACTIONS) {
        if (action === "delete_draft") continue;
        const result = transitionListing(STARTS[start], domainEvent(action));
        const domain =
          result.kind === "ok"
            ? OK
            : result.kind === "illegal"
              ? NO
              : result.kind === "undo_expired"
                ? LATE
                : `non_monotonic`;
        if (domain !== expectedOutcome(start, action)) {
          disagreements.push(
            `${start} × ${action}: domain ${domain}, table ${expectedOutcome(start, action)}`,
          );
        }
      }
    }
    expect(disagreements).toEqual([]);
  });
});

describe("every (listing, move) pair through the kabinet", () => {
  for (const start of START_NAMES) {
    for (const action of ACTIONS) {
      const expected = expectedOutcome(start, action);
      const listing: AnimalListingState = STARTS[start];

      it(`${start} --${action}--> ${expected}`, async () => {
        const animal = await animalAt(start);
        const answer = await act(action, animal.id);
        const stored = await animalRepo(db).findById(animal.id);
        const lines = await linesOf(animal.id);

        if (expected === OK && action === "delete_draft") {
          expect(answer.status).toBe(200);
          expect(stored).toBeNull();
          expect(lines.map((line) => line.kind)).toEqual(["animal_deleted"]);
          return;
        }

        if (expected === OK) {
          expect(answer.status, JSON.stringify(answer.body)).toBe(200);
          const result = transitionListing(listing, domainEvent(action as ListingEventType));
          if (result.kind !== "ok") throw new Error(`domain refused ${start} × ${action}`);
          // Exactly the listing the domain computes, instants included.
          expect(stored?.listing).toEqual(result.next);
          const view = (action === "confirm" ? answer.body.animal : answer.body) as {
            listing: unknown;
            lastUpdatedAt: unknown;
          };
          expect(view.listing).toEqual(result.next);
          if (action === "confirm") {
            expect(answer.body.undoUntil).toEqual(new Date(NOW.getTime() + UNDO_WINDOW_MS));
          }
          // A move is not an edit (HS-T9, RG-Q7).
          expect(stored?.lastUpdatedAt).toEqual(EDITED);
          expect(view.lastUpdatedAt).toEqual(EDITED);
          expect(stored?.version).toBe(VERSION);
          // A publish carries the draft's facts onto the listed animal (F-B1).
          expect({
            size: stored?.size,
            age: stored?.age,
            description: stored?.description,
          }).toEqual({ size: animal.size, age: animal.age, description: animal.description });
          // Recorded moves leave one line; a confirmation and its undo none (S1).
          if (action === "confirm" || action === "undo_confirm") {
            expect(lines).toEqual([]);
          } else {
            expect(lines).toEqual([
              expect.objectContaining({
                kind: "animal_listing_changed",
                at: NOW,
                from: listing.kind,
                to: result.next.kind,
              }),
            ]);
          }
          // HS-T8: a form opened before the move still saves, over nothing the move wrote.
          const saved = await call("shelter.animals.update", {
            animalId: animal.id,
            expectedVersion: VERSION,
            patch: { name: "Збережено після руху" },
          });
          expect(saved.status, JSON.stringify(saved.body)).toBe(200);
          expect((await animalRepo(db).findById(animal.id))?.listing).toEqual(result.next);
          return;
        }

        // A refusal: its code, and nothing written or recorded.
        expect(answer.status, JSON.stringify(answer.body)).toBe(409);
        expect(answer.body.code).toBe(expected);
        if (expected === NO) {
          expect(answer.body.data).toEqual({
            machine: "listing",
            from: listing.kind,
            event: action,
          });
        } else {
          expect(answer.body.data).toBeUndefined();
        }
        expect(stored?.listing).toEqual(listing);
        expect(stored?.lastUpdatedAt).toEqual(EDITED);
        expect(stored?.version).toBe(VERSION);
        expect(lines).toEqual([]);
      });

      if (start === "draft") continue;

      it(`${start} --${action}--> answers the same whether or not adopters acted on the animal`, async () => {
        const quiet = await animalAt(start);
        const active = await animalWithActivityAt(start);
        const quietAnswer = await act(action, quiet.id);
        const activeAnswer = await act(action, active.id);
        expect(activeAnswer.status).toBe(quietAnswer.status);
        expect(JSON.stringify(activeAnswer.body).replaceAll(active.id, quiet.id)).toBe(
          JSON.stringify(quietAnswer.body),
        );
        expect((await linesOf(active.id)).length).toBe((await linesOf(quiet.id)).length);
      });
    }
  }
});
