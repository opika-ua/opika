import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type ModeratorId,
  publicLocationOf,
  type ShelterHistoryEntry,
  type ShelterId,
  testOnlyLocationPolicy,
} from "@opika/domain";
import { eq, inArray } from "drizzle-orm";
import { createDatabase, type Database } from "../src/client";
import { productionEndpoint } from "../src/prod-guard";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { kabinetInvitationRepo } from "../src/repos/kabinet-invitation-repo";
import { kabinetInvitedUsersRepo } from "../src/repos/kabinet-invited-users-repo";
import { kabinetRegistryRepo } from "../src/repos/kabinet-registry-repo";
import { kabinetShelterRepo } from "../src/repos/kabinet-shelter-repo";
import { kabinetSupportRepo, SUPPORT_IDLE_MS } from "../src/repos/kabinet-support-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { superAdminRepo } from "../src/repos/super-admin-repo";
import { animals } from "../src/schema/animals";
import { authMember, authSession, authUser, supportSessions } from "../src/schema/auth";
import { insertShelterFromScript, recordAnimalsImported } from "../src/script-history";
import { makeAnimal, makeCity, makeShelter } from "../src/test-utils/fixtures";

/**
 * `pnpm --filter @opika/db db:neon-smoke --expect ep-…`: runs every
 * multi-step statement the registry PR added, once, against a real Neon
 * branch through the production driver (neon-http), and reports a count per
 * statement. Oleksii, 2026-10-13: "Run 0011 there with --expect <that
 * endpoint>, then the registry's multi-step write tests against the same
 * branch. Report the counts."
 *
 * Why a script and not the test suite: the suite refuses any non-local
 * database and drops every table; this writes a handful of clearly-named
 * fixture rows on a disposable child branch and reads them back.
 *
 * It lives under `test/`, not `src/`: it is test code (fixtures, a
 * membership, invitations), and `no-self-serve-yet.test.ts` rightly refuses
 * any source module that writes a membership or calls the invitation writer
 * outside the one allowlisted registry module (RG-Q9).
 *
 * Refuses unless the target's compute is exactly `--expect`, and refuses
 * production outright (no `--prod` here, ever): the production endpoint must
 * be known (`PROD_NEON_ENDPOINT`) and differ from the target. Prints the host
 * and counts only. Rows it writes stay on the branch, which is thrown away.
 */

type Outcome = { name: string; ok: boolean; detail: string };

const computeOf = (host: string) =>
  (host.toLowerCase().split(".")[0] ?? "").replace(/-pooler$/, "");

export type SmokeTarget = { kind: "ok"; host: string } | { kind: "refused"; reason: string };

/** Pure, so it is tested without a network: the endpoint must match `--expect` and not be production. */
export function smokeTarget(
  url: string,
  expect: string | undefined,
  prodEndpoint: string | undefined,
): SmokeTarget {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return { kind: "refused", reason: "DATABASE_URL does not parse (not printing it)" };
  }
  if (!host.toLowerCase().endsWith(".neon.tech"))
    return { kind: "refused", reason: "not a Neon host" };
  if (expect === undefined || !/^ep-[a-z0-9-]+$/.test(expect)) {
    return { kind: "refused", reason: "pass --expect ep-… (the rehearsal branch's endpoint id)" };
  }
  if (computeOf(host) !== expect) {
    return { kind: "refused", reason: `endpoint is ${computeOf(host)}, expected ${expect}` };
  }
  if (!prodEndpoint) {
    return {
      kind: "refused",
      reason: "PROD_NEON_ENDPOINT is unknown, so the target can't be shown not to be production",
    };
  }
  // Compared only once it is provably an endpoint id: a URL or a quoted value
  // here would never equal `expect` and let production through (review of
  // the scripts row, finding 1). Same rule as the production guard.
  const prod = computeOf(prodEndpoint.trim());
  if (!/^ep-[a-z0-9-]+$/.test(prod)) {
    return {
      kind: "refused",
      reason: "PROD_NEON_ENDPOINT is not an endpoint id (ep-…); not comparing",
    };
  }
  if (prod === expect) {
    return {
      kind: "refused",
      reason: "that is the production endpoint; this script never runs there",
    };
  }
  return { kind: "ok", host };
}

const NOW = new Date();
const later = (ms: number) => new Date(NOW.getTime() + ms);

export async function runSmoke(db: Database): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });
  const tag = randomUUID().slice(0, 8);
  const policy = testOnlyLocationPolicy(`smoke-${tag}`);
  const operator = randomUUID() as ModeratorId;
  const by = { moderatorId: operator, now: NOW };

  // Fixtures: a city of its own, the operator's user, a shelter made the way scripts make it.
  const city = makeCity({ id: randomUUID() as never });
  const otherCity = makeCity({ id: randomUUID() as never });
  await cityRepo(db).insert(city);
  await cityRepo(db).insert(otherCity);
  await db.insert(authUser).values({
    id: operator,
    name: `smoke-${tag}`,
    email: `smoke-operator-${tag}@example.invalid`,
    emailVerified: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const base = makeShelter({ id: randomUUID() as ShelterId, displayName: `Smoke ${tag} A` });
  const shelter = {
    ...base,
    exactAddress: { ...base.exactAddress, cityId: city.id },
    publicLocation: publicLocationOf(base.id, { ...base.exactAddress, cityId: city.id }, policy),
  };
  const shelters = kabinetShelterRepo(db);
  const history = () => shelters.historyOf(shelter.id);

  // 1. createWithHistory (via the script helper): shelter + shelter_created, one statement.
  await insertShelterFromScript(db, shelter, by);
  check(
    "createWithHistory",
    (await history()).length === 1,
    `${(await history()).length} history row(s)`,
  );

  // 2. animals at the shelter and fostered, then animals_imported.
  const atShelter = makeAnimal({ id: randomUUID() as never, shelterId: shelter.id });
  const fostered = makeAnimal({
    id: randomUUID() as never,
    shelterId: shelter.id,
    publicLocation: { precision: "city", cityId: city.id, district: null },
  });
  await animalRepo(db).insert(atShelter, city.id);
  await animalRepo(db).insert(fostered, city.id);
  await recordAnimalsImported(db, shelter.id, 2, by);
  check(
    "animals_imported",
    (await history()).length === 2,
    `${(await history()).length} history row(s)`,
  );

  // 3. applyAuditedMany: two entries, one version bump (UNION ALL of history rows).
  const actor = { kind: "moderator", moderatorId: operator } as const;
  const description = { uk: `Опис ${tag}`, en: null };
  const contact = {
    primary: { kind: "telegram", handle: `smoke_${tag}` },
    additional: [],
  } as const;
  const many = await shelters.applyAuditedMany({
    shelterId: shelter.id,
    expectedVersion: 0,
    changes: [
      { kind: "contact", contact },
      { kind: "description", description },
    ],
    entries: [
      {
        id: randomUUID(),
        entry: {
          kind: "contact_changed",
          at: NOW,
          actor,
          previous: shelter.contact,
          next: contact,
        },
      },
      {
        id: randomUUID(),
        entry: {
          kind: "description_changed",
          at: NOW,
          actor,
          previous: shelter.description,
          next: description,
        },
      },
    ],
    now: NOW,
  });
  const afterMany = await shelterRepo(db).findById(shelter.id);
  check(
    "applyAuditedMany (2 entries)",
    many.kind === "ok" && afterMany?.version === 1 && (await history()).length === 4,
    `${many.kind}, version ${afterMany?.version}, ${(await history()).length} history row(s)`,
  );

  // 4. the same with a stale version: nothing written, nothing recorded.
  const stale = await shelters.applyAuditedMany({
    shelterId: shelter.id,
    expectedVersion: 0,
    changes: [{ kind: "description", description: { uk: "ні", en: null } }],
    entries: [
      {
        id: randomUUID(),
        entry: {
          kind: "description_changed",
          at: NOW,
          actor,
          previous: description,
          next: { uk: "ні", en: null },
        },
      },
    ],
    now: NOW,
  });
  check(
    "applyAuditedMany (stale version)",
    stale.kind === "conflict" && (await history()).length === 4,
    `${stale.kind}, ${(await history()).length} history row(s)`,
  );

  // 5. an address change: pin, city, and the at-shelter animal move in one statement; the fostered one stays.
  const nextAddress = {
    ...shelter.exactAddress,
    cityId: otherCity.id,
    coordinates: { lat: 49.84, lng: 24.03 },
  };
  const moved = await shelters.applyAudited({
    shelterId: shelter.id,
    expectedVersion: 1,
    change: {
      kind: "exact_address",
      exactAddress: nextAddress,
      publicLocation: publicLocationOf(shelter.id, nextAddress, policy),
    },
    entry: {
      kind: "verified_data_changed",
      at: NOW,
      moderatorId: operator,
      change: { field: "exact_address", previous: shelter.exactAddress, next: nextAddress },
    },
    historyId: randomUUID(),
    now: NOW,
  });
  const cities = await db
    .select({ id: animals.id, cityId: animals.cityId })
    .from(animals)
    .where(inArray(animals.id, [atShelter.id, fostered.id]));
  const cityOf = (id: string) => cities.find((row) => row.id === id)?.cityId;
  check(
    "address change (animals CTE)",
    moved.kind === "ok" && cityOf(atShelter.id) === otherCity.id && cityOf(fostered.id) === city.id,
    `${moved.kind}, at-shelter animal ${cityOf(atShelter.id) === otherCity.id ? "moved" : "NOT moved"}, fostered ${cityOf(fostered.id) === city.id ? "stayed" : "MOVED"}`,
  );

  // 6. invite: organization, invitation + admin_invited (one statement), created user + its row.
  const invitations = kabinetInvitationRepo(db);
  const inviteEntry = (email: string): ShelterHistoryEntry => ({
    kind: "admin_invited",
    at: NOW,
    moderatorId: operator,
    email,
  });
  const invited = await invitations.invite({
    shelterId: shelter.id,
    email: `smoke-admin-${tag}@example.invalid`,
    name: "Smoke admin",
    inviterUserId: operator,
    ids: { invitationId: randomUUID(), userId: randomUUID(), organizationId: randomUUID() },
    now: NOW,
    history: { id: randomUUID(), entry: inviteEntry(`smoke-admin-${tag}@example.invalid`) },
  });
  check(
    "invite (invitation + history + created user)",
    invited.kind === "invited" && invited.createdUser && (await history()).length === 6,
    `${invited.kind}${invited.kind === "invited" ? `, createdUser ${invited.createdUser}` : ""}, ${(await history()).length} history row(s)`,
  );
  if (invited.kind !== "invited") return out;

  // 7. resend + admin_invitation_resent, one statement.
  const resent = await invitations.resend(invited.invitationId, later(1000), {
    id: randomUUID(),
    shelterId: shelter.id,
    entry: {
      kind: "admin_invitation_resent",
      at: later(1000),
      moderatorId: operator,
      email: `smoke-admin-${tag}@example.invalid`,
    },
  });
  check(
    "resend (+ history)",
    resent.kind === "resent" && (await history()).length === 7,
    `${resent.kind}, ${(await history()).length} history row(s)`,
  );

  // 8. removeMember: membership + every session of theirs + history; another user's session survives.
  const organizationId = await kabinetRegistryRepo(db).organizationIdOf(shelter.id);
  await db.insert(authMember).values({
    id: randomUUID(),
    organizationId: organizationId ?? "",
    userId: invited.userId,
    role: "admin",
    createdAt: NOW,
  });
  const session = (userId: string) => ({
    id: randomUUID(),
    token: randomUUID(),
    userId,
    expiresAt: later(86_400_000),
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db
    .insert(authSession)
    .values([session(invited.userId), session(invited.userId), session(operator)]);
  const removed = await invitations.removeMember({
    organizationId: organizationId ?? "",
    userId: invited.userId,
    history: {
      id: randomUUID(),
      shelterId: shelter.id,
      entry: {
        kind: "admin_removed",
        at: NOW,
        moderatorId: operator,
        email: `smoke-admin-${tag}@example.invalid`,
        wasPending: false,
      },
    },
  });
  const theirs = await db
    .select({ id: authSession.id })
    .from(authSession)
    .where(eq(authSession.userId, invited.userId));
  const mine = await db
    .select({ id: authSession.id })
    .from(authSession)
    .where(eq(authSession.userId, operator));
  check(
    "removeMember (membership + sessions + history)",
    removed && theirs.length === 0 && mine.length === 1 && (await history()).length === 8,
    `removed ${removed}, their sessions left ${theirs.length}, other user's left ${mine.length}, ${(await history()).length} history row(s)`,
  );

  // 9. withdrawPending: a second pending invitation, withdrawn with one history line.
  const second = await invitations.invite({
    shelterId: shelter.id,
    email: `smoke-pending-${tag}@example.invalid`,
    name: "Smoke pending",
    inviterUserId: operator,
    ids: { invitationId: randomUUID(), userId: randomUUID(), organizationId: randomUUID() },
    now: NOW,
    history: { id: randomUUID(), entry: inviteEntry(`smoke-pending-${tag}@example.invalid`) },
  });
  const withdrawn = await invitations.withdrawPending({
    organizationId: organizationId ?? "",
    email: `smoke-pending-${tag}@example.invalid`,
    history: {
      id: randomUUID(),
      shelterId: shelter.id,
      entry: {
        kind: "admin_removed",
        at: NOW,
        moderatorId: operator,
        email: `smoke-pending-${tag}@example.invalid`,
        wasPending: true,
      },
    },
  });
  check(
    "withdrawPending (+ history)",
    second.kind === "invited" && withdrawn && (await history()).length === 10,
    `withdrawn ${withdrawn}, ${(await history()).length} history row(s)`,
  );

  // 10. the invited-user clean-up: the withdrawn invitee is a candidate and is deleted.
  const users = kabinetInvitedUsersRepo(db);
  if (organizationId === null) {
    // `null` means every shelter: on a branch copied from production that
    // would sweep real invited users. Never run unscoped here (finding 5).
    check(
      "invited-user clean-up",
      false,
      "the smoke shelter has no organization; not sweeping unscoped",
    );
    return out;
  }
  const candidates = await users.cleanupCandidates({ organizationId, now: NOW });
  const deleted = await users.deleteCandidates(
    candidates.map((c) => c.userId),
    NOW,
  );
  check(
    "invited-user clean-up",
    candidates.length === 1 && deleted === 1,
    `${candidates.length} candidate(s), ${deleted} deleted`,
  );

  // 11. support: enter replaces, touch keeps alive, idle ends at last use + 30 min (make_interval).
  const support = kabinetSupportRepo(db);
  const hash = `smoke-${tag}-${randomUUID()}`;
  await support.enter({
    id: randomUUID(),
    operatorUserId: operator,
    shelterId: shelter.id,
    tokenHash: hash,
    now: NOW,
  });
  const alive = await support.touch({
    tokenHash: hash,
    operatorUserId: operator,
    now: later(60_000),
  });
  const idle = await support.touch({
    tokenHash: hash,
    operatorUserId: operator,
    now: later(60_000 + SUPPORT_IDLE_MS),
  });
  const [row] = await db.select().from(supportSessions).where(eq(supportSessions.tokenHash, hash));
  check(
    "support touch / idle (make_interval)",
    alive === shelter.id &&
      idle === null &&
      row?.endReason === "idle" &&
      row.endedAt?.getTime() === later(60_000 + SUPPORT_IDLE_MS).getTime(),
    `alive ${alive === shelter.id}, idle ended ${row?.endReason ?? "no"} at ${row?.endedAt?.toISOString() === later(60_000 + SUPPORT_IDLE_MS).toISOString() ? "last use + 30 min" : row?.endedAt?.toISOString()}`,
  );

  // 12. the S1 list's row-comparison keyset, paged two at a time over this run's own shelters.
  for (const name of ["B", "C"]) {
    const b = makeShelter({ id: randomUUID() as ShelterId, displayName: `Smoke ${tag} ${name}` });
    await insertShelterFromScript(
      db,
      {
        ...b,
        exactAddress: { ...b.exactAddress, cityId: city.id },
        publicLocation: publicLocationOf(b.id, { ...b.exactAddress, cityId: city.id }, policy),
      },
      by,
    );
  }
  const registry = kabinetRegistryRepo(db);
  const seen: string[] = [];
  let after: Parameters<typeof registry.listPage>[0]["after"] = null;
  for (let page = 0; page < 5; page += 1) {
    const result = await registry.listPage({
      search: `Smoke ${tag}`,
      status: null,
      after,
      limit: 2,
    });
    seen.push(...result.items.map((item) => item.displayName));
    after = result.next;
    if (after === null) break;
  }
  check(
    "S1 keyset (rank, name, id)",
    seen.length === 3 && new Set(seen).size === 3,
    `${seen.length} row(s) over pages of 2: ${seen.join(", ")}`,
  );

  // 13. history keyset, paged two at a time: every row once.
  const pagedIds: string[] = [];
  let hAfter: { at: Date; id: string } | null = null;
  for (let page = 0; page < 10; page += 1) {
    const result = await shelters.historyPage({ shelterId: shelter.id, after: hAfter, limit: 2 });
    pagedIds.push(...result.items.map((entry) => entry.kind));
    hAfter = result.next;
    if (hAfter === null) break;
  }
  check(
    "history keyset",
    pagedIds.length === 10,
    `${pagedIds.length} of 10 history row(s) over pages of 2`,
  );

  // 14. admin:bootstrap's statement: refused here if an operator exists, else creates user + grant.
  const admins = superAdminRepo(db);
  const before = await admins.activeCount();
  const boot = await admins.bootstrap({
    userId: randomUUID(),
    email: `smoke-bootstrap-${tag}@example.invalid`,
    name: "Smoke bootstrap",
    now: NOW,
  });
  check(
    "bootstrap statement",
    before === 0 ? boot.kind === "bootstrapped" : boot.kind === "refused",
    `${before} active operator(s) before, ${boot.kind}`,
  );
  return out;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }
  const at = process.argv.indexOf("--expect");
  const target = smokeTarget(url, at > -1 ? process.argv[at + 1] : undefined, productionEndpoint());
  if (target.kind === "refused") {
    console.error(`REFUSED: ${target.reason}. Nothing was run.`);
    process.exit(1);
  }
  console.log(`Target host: ${target.host}`);
  const outcomes = await runSmoke(createDatabase(url));
  for (const o of outcomes) console.log(`${o.ok ? "PASS" : "FAIL"}  ${o.name}: ${o.detail}`);
  const failed = outcomes.filter((o) => !o.ok).length;
  console.log(`${outcomes.length - failed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
