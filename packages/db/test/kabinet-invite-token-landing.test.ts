import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../src/client";
import { cityRepo } from "../src/repos/city-repo";
import { kabinetInvitationRepo } from "../src/repos/kabinet-invitation-repo";
import { kabinetInviteTokenRepo } from "../src/repos/kabinet-invite-token-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { authInvitation, authUser } from "../src/schema/auth";
import { makeCity, makeShelter, setupTestDatabase, truncateAll } from "../src/test-utils/index";

/**
 * PW2-F1 (review note 1 of PW-2 at 663b00e): `landingOf` itself must read its three refusal
 * flags through the fail-closed normaliser. `kabinet-invite-token-flags.test.ts` covers the
 * normaliser alone; this covers the call, so a refactor that hands back the driver's row as it
 * came cannot silently undo Oleksii's rule (2026-10-21, verbatim: "The three refusal checks
 * (operator, has a password, already a member) fail closed: anything other than an explicit
 * “not refused” counts as refused.").
 *
 * Today's drivers parse `bool`, so the real row is never anything but true/false; the wrapper
 * below rewrites one flag of the row the query builder resolves with, as a driver answering
 * `'t'` or null would. A flag reading `true` is the refusal `invitePasswordStateOf` (apps/web)
 * turns into the one "link no longer works" page.
 */

const FLAGS = ["operator", "hasPassword", "member"] as const;

/** Values a driver could answer that are not an explicit "not refused". */
const RAW_VALUES: ReadonlyArray<readonly [string, unknown]> = [
  ["'t'", "t"],
  ["null", null],
];

const isThenable = (value: unknown): value is object =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { then?: unknown }).then === "function";

/**
 * `db`, with every select's resolved rows passed through `rewrite` before the caller sees them.
 * The statement still runs against the real database; only what it hands back changes.
 */
function rowsRewritten(db: Database, rewrite: (row: Record<string, unknown>) => void): Database {
  const follow = (builder: object): object =>
    new Proxy(builder, {
      get(target, property) {
        const value = Reflect.get(target, property, target);
        if (typeof value !== "function") return value;
        if (property === "then") {
          return (onFulfilled?: (rows: unknown) => unknown, onRejected?: unknown) =>
            value.call(
              target,
              (rows: unknown) => {
                if (Array.isArray(rows)) for (const row of rows) rewrite(row);
                return onFulfilled ? onFulfilled(rows) : rows;
              },
              onRejected,
            );
        }
        return (...args: unknown[]) => {
          const result = value.apply(target, args);
          return isThenable(result) ? follow(result) : result;
        };
      },
    });
  return new Proxy(db, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      if (property !== "select") return value.bind(target);
      return (...args: unknown[]) => follow(value.apply(target, args));
    },
  });
}

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const NOW = new Date("2026-10-21T10:00:00.000Z");
const LATER = new Date(NOW.getTime() + 72 * 3_600_000);
const TOKEN = "pw2-f1-token";

/**
 * An otherwise usable link: a pending, unexpired invitation to a shelter, for an address whose
 * user holds no operator grant, no password and no membership.
 */
beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
  });
  await shelterRepo(db).insert(shelter);
  const inviter = crypto.randomUUID();
  await db.insert(authUser).values([
    {
      id: inviter,
      name: "Оператор",
      email: "op@example.org",
      emailVerified: true,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: crypto.randomUUID(),
      name: "Олена",
      email: "olena@example.org",
      emailVerified: false,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);
  const organizationId = await kabinetInvitationRepo(db).ensureOrganization(
    shelter.id,
    { organizationId: crypto.randomUUID() },
    NOW,
  );
  const invitationId = crypto.randomUUID();
  await db.insert(authInvitation).values({
    id: invitationId,
    organizationId,
    email: "olena@example.org",
    role: "admin",
    status: "pending",
    expiresAt: LATER,
    createdAt: NOW,
    inviterId: inviter,
  });
  await kabinetInviteTokenRepo(db).issue({
    id: crypto.randomUUID(),
    invitationId,
    token: TOKEN,
    expiresAt: LATER,
    now: NOW,
  });
});

describe("landingOf reads the refusal flags fail-closed (PW2-F1)", () => {
  it("over the real driver, the link is usable: no flag refuses", async () => {
    const row = await kabinetInviteTokenRepo(db).landingOf(TOKEN);
    expect(row).not.toBeNull();
    expect({
      operator: row?.operator,
      hasPassword: row?.hasPassword,
      member: row?.member,
    }).toEqual({ operator: false, hasPassword: false, member: false });
  });

  for (const flag of FLAGS) {
    it.each(RAW_VALUES)(`${flag} answered as %s → refused`, async (_name, raw) => {
      const answering = rowsRewritten(db, (row) => {
        if (flag in row) row[flag] = raw;
      });
      const row = await kabinetInviteTokenRepo(answering).landingOf(TOKEN);
      expect(row).not.toBeNull();
      expect(row?.[flag], flag).toBe(true);
      for (const other of FLAGS.filter((f) => f !== flag)) {
        expect(row?.[other], other).toBe(false);
      }
    });
  }
});
