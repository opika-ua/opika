import { randomUUID } from "node:crypto";
import type { ShelterAdminId, ShelterId } from "@opika/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  parseDeleteTestArgs,
  REHEARSAL_LOG_BEGIN,
  REHEARSAL_LOG_END,
  rehearsalLogLine,
  runDeleteTestShelter,
  targetRefusalOf,
} from "../src/delete-test-shelter";
import { animalRepo } from "../src/repos/animal-repo";
import { applicationDeletionRepo } from "../src/repos/application-deletion-repo";
import { cityRepo } from "../src/repos/city-repo";
import {
  type SelfRegistrationWrite,
  selfRegistrationRepo,
} from "../src/repos/self-registration-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { animals } from "../src/schema/animals";
import { applicationDeletions } from "../src/schema/application-deletions";
import {
  authAccount,
  authMember,
  authOrganization,
  authSession,
  authUser,
  authVerification,
  supportSessions,
} from "../src/schema/auth";
import { registrationEmailTokens } from "../src/schema/registration-email-tokens";
import { shelterHistory } from "../src/schema/shelter-history";
import { shelters } from "../src/schema/shelters";
import {
  makeAnimal,
  makeCity,
  makeDraftAnimal,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";

/**
 * `shelters:delete-test` (owner, 2026-11-18): one rehearsal shelter, through the application
 * deletion service's batch, guarded twice (the command's read, then the batch under its locks).
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const NOW = new Date("2026-11-20T10:00:00.000Z");
const NAME = "Тестовий притулок +t1";
const EMAIL = "oleksii+t1@example.org";
let cityId: string;

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  cityId = city.id;
});

function registration(email: string): SelfRegistrationWrite {
  const userId = randomUUID();
  const shelter = makeShelter({
    displayName: NAME,
    publicLocation: { ...makeShelter().publicLocation, cityId } as never,
    verification: {
      status: "application",
      appliedAt: NOW,
      evidence: {
        items: [{ kind: "public_link", url: "https://www.instagram.com/prytulok_test/" }],
        submittedAt: NOW,
      },
    },
  });
  return {
    userId,
    email,
    accountId: randomUUID(),
    passwordHash: "scrypt-hash-stand-in",
    organizationId: randomUUID(),
    memberId: randomUUID(),
    shelter,
    history: {
      id: randomUUID(),
      entry: { kind: "shelter_registered", at: NOW, shelterAdminId: userId as ShelterAdminId },
    },
    tokens: [
      { tokenHash: `confirm-${userId}`, purpose: "confirm_email", expiresAt: NOW },
      { tokenHash: `notme-${userId}`, purpose: "not_me", expiresAt: NOW },
    ],
    now: NOW,
  };
}

/** A rehearsal as it is on production: registered through the form, accepted (pending). */
async function rehearsal(): Promise<{ shelterId: ShelterId; userId: string }> {
  const write = registration(EMAIL);
  expect(await selfRegistrationRepo(db).register(write)).toEqual({ kind: "registered" });
  await db
    .update(shelters)
    .set({
      verificationStatus: "pending",
      verification: {
        status: "pending",
        submittedAt: NOW,
        evidence: { items: [], submittedAt: NOW },
      } as never,
    })
    .where(eq(shelters.id, write.shelter.id));
  // Better Auth's rows beside the registration's own: a session and a reset link.
  await db.insert(authSession).values({
    id: randomUUID(),
    token: randomUUID(),
    userId: write.userId,
    expiresAt: new Date(NOW.getTime() + 86_400_000),
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(authVerification).values({
    id: randomUUID(),
    identifier: "R".repeat(43),
    value: write.userId,
    expiresAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  });
  return { shelterId: write.shelter.id, userId: write.userId };
}

const draftOf = async (shelterId: ShelterId) => {
  const draft = makeDraftAnimal({ shelterId, everServedAt: null });
  await animalRepo(db).insert(draft, cityId as never);
  return draft.id;
};

const snapshot = async () => ({
  shelters: (await db.select().from(shelters)).length,
  animals: (await db.select().from(animals)).length,
  history: (await db.select().from(shelterHistory)).length,
  users: (await db.select().from(authUser)).length,
  accounts: (await db.select().from(authAccount)).length,
  sessions: (await db.select().from(authSession)).length,
  links: (await db.select().from(authVerification)).length,
  tokens: (await db.select().from(registrationEmailTokens)).length,
  members: (await db.select().from(authMember)).length,
  organizations: (await db.select().from(authOrganization)).length,
  deletions: (await db.select().from(applicationDeletions)).length,
});

const run = (shelterId: ShelterId, commit: boolean, expectedName = NAME) =>
  runDeleteTestShelter(db, { shelterId, expectedName, commit, now: NOW });

const pasteBlockIn = (lines: readonly string[]) => lines.includes(REHEARSAL_LOG_BEGIN);

describe("shelters:delete-test, dry run", () => {
  it("prints the shelter and what would go, the email's domain only, and writes nothing", async () => {
    const { shelterId } = await rehearsal();
    await draftOf(shelterId);
    const before = await snapshot();
    const report = await run(shelterId, false);
    expect(report.outcome).toBe("dry_run");
    const text = report.lines.join("\n");
    expect(text).toContain(`Shelter: ${shelterId}`);
    expect(text).toContain(`Display name: ${NAME}`);
    expect(text).toContain("Status: pending");
    expect(text).toContain("Registration source: self_registration");
    expect(text).toContain("Registrant email domain: example.org");
    expect(text).toContain("Animals: 1 (1 drafts, 0 ever shown, 0 listed now)");
    expect(text).not.toContain(EMAIL);
    expect(pasteBlockIn(report.lines)).toBe(false);
    expect(await snapshot()).toEqual(before);
  });
});

describe("shelters:delete-test refuses, writing nothing", () => {
  const refuses = async (shelterId: ShelterId, why: RegExp, expectedName = NAME) => {
    const before = await snapshot();
    const report = await run(shelterId, true, expectedName);
    expect(report.outcome).toBe("refused");
    expect(report.lines.at(-1)).toMatch(why);
    expect(pasteBlockIn(report.lines)).toBe(false);
    expect(await snapshot()).toEqual(before);
  };

  it("a display name that isn't --expect-name exactly", async () => {
    const { shelterId } = await rehearsal();
    await refuses(shelterId, /display name is not --expect-name/, `${NAME} `);
  });

  it("an operator-created shelter", async () => {
    const shelter = makeShelter({
      displayName: NAME,
      publicLocation: { ...makeShelter().publicLocation, cityId } as never,
      verification: {
        status: "pending",
        submittedAt: NOW,
        evidence: { items: [], submittedAt: NOW },
      },
    });
    await shelterRepo(db).insert(shelter);
    await refuses(shelter.id, /created by the operator/);
  });

  it("a verified shelter", async () => {
    const { shelterId } = await rehearsal();
    await db
      .update(shelters)
      .set({ verificationStatus: "verified", verification: makeShelter().verification as never })
      .where(eq(shelters.id, shelterId));
    await refuses(shelterId, /status is not one of application, pending, rejected/);
  });

  it("an animal that was ever shown", async () => {
    const { shelterId } = await rehearsal();
    const id = await draftOf(shelterId);
    await db.update(animals).set({ everServedAt: NOW }).where(eq(animals.id, id));
    await refuses(shelterId, /has been shown publicly/);
  });

  it("an animal published now", async () => {
    const { shelterId } = await rehearsal();
    const published = makeAnimal({ shelterId });
    await animalRepo(db).insert(published, cityId as never);
    await db.update(animals).set({ everServedAt: null }).where(eq(animals.id, published.id));
    await refuses(shelterId, /is published\/reserved\/adopted now/);
  });

  it("an unknown id", async () => {
    await refuses(randomUUID() as ShelterId, /no shelter has this id/);
  });
});

describe("the batch re-checks every guard under its locks (no command read before it)", () => {
  const refusedByBatch = async (shelterId: ShelterId, expectedName = NAME) => {
    const before = await snapshot();
    expect(await applicationDeletionRepo(db).deleteRehearsal(shelterId, expectedName, NOW)).toEqual(
      {
        kind: "refused",
      },
    );
    expect(await snapshot()).toEqual(before);
  };

  it("the name", async () => {
    await refusedByBatch((await rehearsal()).shelterId, "Інша назва");
  });

  it("the status", async () => {
    const { shelterId } = await rehearsal();
    await db
      .update(shelters)
      .set({ verificationStatus: "verified", verification: makeShelter().verification as never })
      .where(eq(shelters.id, shelterId));
    await refusedByBatch(shelterId);
  });

  it("an animal ever shown", async () => {
    const { shelterId } = await rehearsal();
    const id = await draftOf(shelterId);
    await db.update(animals).set({ everServedAt: NOW }).where(eq(animals.id, id));
    await refusedByBatch(shelterId);
  });
});

describe("shelters:delete-test --commit", () => {
  it("deletes the shelter and the registrant's auth rows in one batch; the address registers again", async () => {
    const { shelterId, userId } = await rehearsal();
    await draftOf(shelterId);
    const operator = randomUUID();
    await db.insert(authUser).values({
      id: operator,
      name: "Оператор",
      email: "op@example.org",
      emailVerified: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.insert(supportSessions).values({
      id: randomUUID(),
      operatorUserId: operator,
      shelterId,
      tokenHash: randomUUID(),
      startedAt: NOW,
      lastSeenAt: NOW,
    });

    const report = await run(shelterId, true);

    expect(report.outcome).toBe("deleted");
    const left = await snapshot();
    expect(left).toEqual({
      shelters: 0,
      animals: 0,
      history: 0,
      users: 1, // the operator
      accounts: 0,
      sessions: 0,
      links: 0,
      tokens: 0,
      members: 0,
      organizations: 0,
      deletions: 1,
    });
    const [line] = await db.select().from(applicationDeletions);
    expect(line).toMatchObject({ id: report.deletionId, shelterId, reason: "not_me" });
    expect((await db.select().from(authUser).where(eq(authUser.id, userId))).length).toBe(0);
    expect(await db.select().from(supportSessions)).toEqual([
      expect.objectContaining({ operatorUserId: operator, shelterId: null }),
    ]);
    expect(await selfRegistrationRepo(db).register(registration(EMAIL))).toEqual({
      kind: "registered",
    });
  });

  it("prints the log's line between the markers, ids and date only, after the batch succeeded", async () => {
    const { shelterId } = await rehearsal();
    const report = await run(shelterId, true);
    const start = report.lines.indexOf(REHEARSAL_LOG_BEGIN);
    expect(start).toBeGreaterThan(-1);
    expect(report.lines.slice(start)).toEqual([
      REHEARSAL_LOG_BEGIN,
      `- 2026-11-20 · application_deletions ${report.deletionId} · shelter ${shelterId} · rehearsal, not a real «Це не я»`,
      REHEARSAL_LOG_END,
    ]);
    expect(report.lines.join("\n")).not.toContain(EMAIL);
    expect(REHEARSAL_LOG_BEGIN).toBe("---- paste into docs/prelaunch/rehearsal-log.md ----");
    expect(rehearsalLogLine(NOW, "d", "s")).not.toContain(NAME);
  });
});

describe("the command line and the target", () => {
  const argv = (...rest: string[]) => ["node", "delete-test-shelter.ts", ...rest];
  const ID = "5b0e8a43-6a3c-4c5e-9d6d-1f2a3b4c5d6e";

  it("needs a shelter uuid and an exact name; a dry run unless --commit", () => {
    expect(parseDeleteTestArgs(argv("--shelter-id", ID, "--expect-name", NAME))).toEqual({
      kind: "ok",
      shelterId: ID,
      expectedName: NAME,
      commit: false,
      endpoint: undefined,
    });
    expect(parseDeleteTestArgs(argv("--expect-name", NAME)).kind).toBe("refused");
    expect(parseDeleteTestArgs(argv("--shelter-id", "x", "--expect-name", NAME)).kind).toBe(
      "refused",
    );
    expect(parseDeleteTestArgs(argv("--shelter-id", ID)).kind).toBe("refused");
    expect(
      parseDeleteTestArgs(argv("--shelter-id", ID, "--expect-name", NAME, "--force")).kind,
    ).toBe("refused");
  });

  const PROD =
    "postgresql://u:secret@ep-quiet-lake-a1b2c3-pooler.eu-central-1.aws.neon.tech/neondb";
  const env = { PROD_NEON_ENDPOINT: "ep-quiet-lake-a1b2c3" };

  it("production needs --prod, and any Neon target --expect naming its exact compute", () => {
    expect(targetRefusalOf(PROD, argv(), "ep-quiet-lake-a1b2c3", env)).not.toBeNull();
    expect(targetRefusalOf(PROD, argv("--prod"), "ep-other-hill-d4e5f6", env)).toMatch(/REFUSED/);
    expect(targetRefusalOf(PROD, argv("--prod"), undefined, env)).toMatch(/REFUSED/);
    expect(targetRefusalOf(PROD, argv("--prod"), "ep-quiet-lake-a1b2c3", env)).toBeNull();
  });

  it("an unknown production endpoint fails closed without --prod", () => {
    const child = "postgresql://u:secret@ep-other-hill-d4e5f6.eu-central-1.aws.neon.tech/neondb";
    expect(
      targetRefusalOf(child, argv(), "ep-other-hill-d4e5f6", {
        PROD_GUARD_ENV_FILE: "/nonexistent",
      }),
    ).not.toBeNull();
  });

  it("a local target needs neither", () => {
    expect(
      targetRefusalOf("postgresql://u:p@localhost:5433/opika", argv(), undefined, {}),
    ).toBeNull();
  });
});
