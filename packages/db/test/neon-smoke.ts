import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type ModeratorId,
  publicLocationOf,
  type ShelterAdminId,
  type ShelterHistoryEntry,
  type ShelterId,
  testOnlyLocationPolicy,
  transitionListing,
} from "@opika/domain";
import { eq, inArray } from "drizzle-orm";
import { createDatabase, type Database } from "../src/client";
import { productionEndpoint } from "../src/prod-guard";
import { adopterRepo } from "../src/repos/adopter-repo";
import { animalRepo } from "../src/repos/animal-repo";
import { authExpiryRepo, KABINET_SESSION_ABSOLUTE_MS } from "../src/repos/auth-expiry-repo";
import { cityRepo } from "../src/repos/city-repo";
import {
  type AnimalHistoryRow,
  kabinetAnimalRepo,
  type ListingMoveHistory,
} from "../src/repos/kabinet-animal-repo";
import { kabinetInvitationAcceptRepo } from "../src/repos/kabinet-invitation-accept-repo";
import { kabinetInvitationRepo } from "../src/repos/kabinet-invitation-repo";
import { kabinetInvitedUsersRepo } from "../src/repos/kabinet-invited-users-repo";
import { kabinetRegistryRepo } from "../src/repos/kabinet-registry-repo";
import { kabinetShelterRepo } from "../src/repos/kabinet-shelter-repo";
import { kabinetSupportRepo, SUPPORT_IDLE_MS } from "../src/repos/kabinet-support-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { superAdminRepo } from "../src/repos/super-admin-repo";
import { swipeRepo } from "../src/repos/swipe-repo";
import { animals } from "../src/schema/animals";
import {
  authInvitation,
  authMember,
  authSession,
  authUser,
  authVerification,
  supportSessions,
} from "../src/schema/auth";
import { insertShelterFromScript, recordAnimalsImported } from "../src/script-history";
import {
  makeAdopter,
  makeAnimal,
  makeCity,
  makeShelter,
  makeSwipe,
} from "../src/test-utils/fixtures";
import { type SmokeTarget, smokeTarget } from "../src/test-utils/smoke-target";

/**
 * `pnpm --filter @opika/db db:neon-smoke --expect ep-…` (from a worktree:
 * `PROD_NEON_ENDPOINT=ep-… pnpm --filter @opika/db db:neon-smoke --expect ep-…`,
 * see below): runs every
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
 *
 * Where `PROD_NEON_ENDPOINT` comes from: the shell first, else the repo-root
 * `.env.local` **of the checkout the script runs from** (`productionEndpoint`,
 * `src/prod-guard.ts`). A git worktree has no `.env.local` of its own, so run
 * from a worktree, set it in the shell for the run (the endpoint id only,
 * `ep-…`, never a URL); without it the script refuses, as it should. Seen on
 * the real run of 2026-10-14 from a worktree: refused until it was set.
 */

type Outcome = { name: string; ok: boolean; detail: string };

export { type SmokeTarget, smokeTarget };

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

  // 15. the automatic accept (IN-Q12/IN-Q13): invitation + membership + admin_joined in one
  // statement, then the one-membership index's violation read off neon-http's error shape.
  const joinShelter = makeShelter({ id: randomUUID() as ShelterId, displayName: `Smoke ${tag} D` });
  const otherShelter = makeShelter({
    id: randomUUID() as ShelterId,
    displayName: `Smoke ${tag} E`,
  });
  for (const s of [joinShelter, otherShelter]) {
    await insertShelterFromScript(
      db,
      {
        ...s,
        exactAddress: { ...s.exactAddress, cityId: city.id },
        publicLocation: publicLocationOf(s.id, { ...s.exactAddress, cityId: city.id }, policy),
      },
      by,
    );
  }
  const joinEmail = `smoke-join-${tag}@example.invalid`;
  const toJoin = await invitations.invite({
    shelterId: joinShelter.id,
    email: joinEmail,
    name: "Smoke join",
    inviterUserId: operator,
    ids: { invitationId: randomUUID(), userId: randomUUID(), organizationId: randomUUID() },
    now: NOW,
    history: { id: randomUUID(), entry: inviteEntry(joinEmail) },
  });
  if (toJoin.kind !== "invited") {
    check("accept", false, `invite: ${toJoin.kind}`);
    return out;
  }
  // Magic-link verify sets this on sign-in; the accept requires it.
  await db.update(authUser).set({ emailVerified: true }).where(eq(authUser.id, toJoin.userId));
  const acceptRepo = kabinetInvitationAcceptRepo(db);
  const acceptIds = () => ({ memberId: randomUUID(), historyId: randomUUID() });
  const joined = await acceptRepo.accept({ userId: toJoin.userId, now: NOW, ids: acceptIds() });
  const again = await acceptRepo.accept({ userId: toJoin.userId, now: NOW, ids: acceptIds() });
  const joinedLines = (await shelters.historyOf(joinShelter.id)).filter(
    (e) => e.kind === "admin_joined",
  ).length;
  const memberships = await db
    .select({ id: authMember.id })
    .from(authMember)
    .where(eq(authMember.userId, toJoin.userId));
  check(
    "accept (invitation + membership + admin_joined), then idempotent",
    joined.kind === "accepted" &&
      again.kind === "nothing_to_accept" &&
      joinedLines === 1 &&
      memberships.length === 1,
    `${joined.kind}, then ${again.kind}; ${memberships.length} membership(s), ${joinedLines} admin_joined`,
  );
  // IN-T1's race: a second shelter's invitation for the same address, written straight past
  // the registry's refusal, then driven at the statement directly so only the index refuses.
  const otherOrganization = await invitations.ensureOrganization(
    otherShelter.id,
    { organizationId: randomUUID() },
    NOW,
  );
  const racedId = randomUUID();
  await db.insert(authInvitation).values({
    id: racedId,
    organizationId: otherOrganization,
    email: joinEmail,
    role: "admin",
    status: "pending",
    expiresAt: later(3_600_000),
    createdAt: NOW,
    inviterId: operator,
  });
  const conflict = await acceptRepo.write({
    userId: toJoin.userId,
    invitation: {
      id: racedId as never,
      organizationId: otherOrganization,
      shelterId: otherShelter.id,
      email: joinEmail,
    },
    now: NOW,
    ids: acceptIds(),
  });
  const [racedRow] = await db
    .select({ status: authInvitation.status })
    .from(authInvitation)
    .where(eq(authInvitation.id, racedId));
  check(
    "accept: one-membership conflict (driver error shape)",
    conflict.kind === "membership_conflict" && racedRow?.status === "pending",
    `${conflict.kind}, invitation ${racedRow?.status}`,
  );

  // 17. IN-T12 (Oleksii, 2026-10-14): two pending invitations to the same shelter for one
  // address; the accept takes the newest and cancels the older in the same statement, so none
  // stays pending. The older is the registry's own invite; the newer is written straight in,
  // as a re-invite racing the registry's one-pending rule would leave it.
  const dupShelter = makeShelter({ id: randomUUID() as ShelterId, displayName: `Smoke ${tag} F` });
  await insertShelterFromScript(
    db,
    {
      ...dupShelter,
      exactAddress: { ...dupShelter.exactAddress, cityId: city.id },
      publicLocation: publicLocationOf(
        dupShelter.id,
        { ...dupShelter.exactAddress, cityId: city.id },
        policy,
      ),
    },
    by,
  );
  const dupEmail = `smoke-dup-${tag}@example.invalid`;
  const olderInvite = await invitations.invite({
    shelterId: dupShelter.id,
    email: dupEmail,
    name: "Smoke duplicate",
    inviterUserId: operator,
    ids: { invitationId: randomUUID(), userId: randomUUID(), organizationId: randomUUID() },
    now: NOW,
    history: { id: randomUUID(), entry: inviteEntry(dupEmail) },
  });
  if (olderInvite.kind !== "invited") {
    check("accept: duplicates", false, `invite: ${olderInvite.kind}`);
    return out;
  }
  const dupOrganization = await invitations.ensureOrganization(
    dupShelter.id,
    { organizationId: randomUUID() },
    NOW,
  );
  const newerId = randomUUID();
  await db.insert(authInvitation).values({
    id: newerId,
    organizationId: dupOrganization,
    email: dupEmail,
    role: "admin",
    status: "pending",
    expiresAt: later(3_600_000),
    createdAt: later(1_000),
    inviterId: operator,
  });
  await db.update(authUser).set({ emailVerified: true }).where(eq(authUser.id, olderInvite.userId));
  const dupAccepted = await acceptRepo.accept({
    userId: olderInvite.userId,
    now: later(2_000),
    ids: acceptIds(),
  });
  const dupRows = await db
    .select({ id: authInvitation.id, status: authInvitation.status })
    .from(authInvitation)
    .where(eq(authInvitation.organizationId, dupOrganization));
  const statusOf = (id: string) => dupRows.find((row) => row.id === id)?.status;
  const stillPending = dupRows.filter((row) => row.status === "pending").length;
  check(
    "accept: duplicate invitations (newest accepted, older canceled, none pending)",
    dupAccepted.kind === "accepted" &&
      dupAccepted.invitationId === newerId &&
      statusOf(newerId) === "accepted" &&
      statusOf(olderInvite.invitationId) === "canceled" &&
      stillPending === 0,
    `${dupAccepted.kind}; newest ${statusOf(newerId)}, older ${statusOf(olderInvite.invitationId)}, ${stillPending} pending`,
  );

  // 18. the daily auth clean-up's one statement (KH-Q9, plus EM-Q11's 30-day
  // cap): two data-modifying CTEs and their counts, through neon-http. Rows
  // past expiry go, and a session past the absolute cap goes even with its
  // idle expiry still ahead (EM-Q11: "Test the case where the cap is passed
  // but the idle expiry is in the future"); one just under the cap stays. On a
  // disposable branch the counts may include rows copied from production, so
  // they are "at least" and this run's own rows are checked by id.
  const expired = { session: randomUUID(), verification: randomUUID() };
  const live = { session: randomUUID(), verification: randomUUID() };
  const pastCap = randomUUID();
  const underCap = randomUUID();
  await db.insert(authSession).values([
    { ...session(operator), id: expired.session, expiresAt: later(-1000) },
    { ...session(operator), id: live.session, expiresAt: later(86_400_000) },
    {
      ...session(operator),
      id: pastCap,
      createdAt: later(-KABINET_SESSION_ABSOLUTE_MS - 60_000),
      expiresAt: later(5 * 86_400_000),
    },
    {
      ...session(operator),
      id: underCap,
      createdAt: later(-KABINET_SESSION_ABSOLUTE_MS + 60_000),
      expiresAt: later(5 * 86_400_000),
    },
  ]);
  const verification = (id: string, expiresAt: Date) => ({
    id,
    identifier: `smoke-${tag}-${id}`,
    value: "{}",
    expiresAt,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db
    .insert(authVerification)
    .values([
      verification(expired.verification, later(-1000)),
      verification(live.verification, later(900_000)),
    ]);
  const counts = await authExpiryRepo(db).deleteExpired(NOW);
  const left = new Set([
    ...(
      await db
        .select({ id: authSession.id })
        .from(authSession)
        .where(inArray(authSession.id, [expired.session, live.session, pastCap, underCap]))
    ).map((r) => r.id),
    ...(
      await db
        .select({ id: authVerification.id })
        .from(authVerification)
        .where(inArray(authVerification.id, [expired.verification, live.verification]))
    ).map((r) => r.id),
  ]);
  check(
    "auth clean-up (expired verification + session, session past the 30-day cap, one statement)",
    typeof counts.sessions === "number" &&
      typeof counts.verifications === "number" &&
      counts.sessions >= 2 &&
      counts.verifications >= 1 &&
      !left.has(expired.session) &&
      !left.has(expired.verification) &&
      !left.has(pastCap) &&
      left.has(underCap) &&
      left.has(live.session) &&
      left.has(live.verification),
    `deleted ${counts.verifications} verification(s), ${counts.sessions} session(s); this run's live rows kept ${left.has(live.session) && left.has(live.verification)}, expired gone ${!left.has(expired.session) && !left.has(expired.verification)}, past-cap gone ${!left.has(pastCap)}, under-cap kept ${left.has(underCap)}`,
  );

  // 19–21: the K2/K3 animal writes HS-T4b names (the listing jsonb
  // compare-and-set, the deleteDraft 23503 catch) and S3-T6's guard, which is
  // the integer `version` since Oleksii's override (S3-T6: "integer version for
  // animals too"), so the `last_updated_at` equality round-trip it once
  // needed no longer exists. Shelter writes stay refused in production until
  // K2/K3 (KH-Q1); HS-T4b still asks for these on real Neon before the 503
  // lifts, so they run here, through the kabinet's own repo.
  const kabinetAnimals = kabinetAnimalRepo(db);
  // K-Q7: each write's history line lands in the write's own statement, so
  // on this driver too a refused write must leave no line behind.
  const smokeActor = {
    kind: "shelter_admin",
    shelterAdminId: randomUUID() as ShelterAdminId,
  } as const;
  const animalLines = async (kind: ShelterHistoryEntry["kind"], animalId: string) =>
    (await history()).filter(
      (entry) => entry.kind === kind && "animalId" in entry && entry.animalId === animalId,
    ).length;

  // 19. an edit compare-and-sets on `version`: the read version writes and
  // bumps, the same version again (a stale form) writes nothing.
  const edited = await kabinetAnimals.findWithCity(atShelter.id);
  const editVersion = edited?.animal.version ?? -1;
  function editedLine(animalName: string): AnimalHistoryRow<"animal_edited"> {
    return {
      id: randomUUID(),
      entry: {
        kind: "animal_edited",
        at: later(1000),
        actor: smokeActor,
        animalId: atShelter.id,
        animalName,
        fields: ["name"],
      },
    };
  }
  const firstEdit = edited
    ? await kabinetAnimals.writeEditIf(
        { ...edited.animal, name: `Smoke ${tag}`, lastUpdatedAt: later(1000) },
        edited.cityId,
        editVersion,
        editedLine(`Smoke ${tag}`),
      )
    : { kind: "conflict" as const };
  const staleEdit = edited
    ? await kabinetAnimals.writeEditIf(
        { ...edited.animal, name: `Smoke ${tag} stale` },
        edited.cityId,
        editVersion,
        editedLine(`Smoke ${tag} stale`),
      )
    : { kind: "ok" as const };
  const afterEdit = await kabinetAnimals.findWithCity(atShelter.id);
  const editLines = await animalLines("animal_edited", atShelter.id);
  check(
    "animal edit compare-and-set on version (S3-T6), one animal_edited line (K-Q7)",
    firstEdit.kind === "ok" &&
      staleEdit.kind === "conflict" &&
      afterEdit?.animal.version === editVersion + 1 &&
      afterEdit.animal.name === `Smoke ${tag}` &&
      editLines === 1,
    `first ${firstEdit.kind}, stale ${staleEdit.kind}, version ${editVersion} → ${afterEdit?.animal.version}, ${editLines} animal_edited line(s)`,
  );

  // 20. a listing move compare-and-sets on the listing as read back through
  // this driver (jsonb equality on the value the request read): the read
  // listing moves, the same stale read moves nothing, and `last_updated_at`
  // stays put (HS-T8).
  const readListing = afterEdit?.animal.listing;
  const listingMoved =
    readListing && readListing.kind === "published"
      ? await kabinetAnimals.writeListingIf(
          atShelter.id,
          { ...readListing, confirmedAt: later(2000), undoable: null },
          readListing,
          { kind: "not_recorded", because: "confirmation" },
        )
      : { kind: "conflict" as const };
  const staleMove =
    readListing && readListing.kind === "published"
      ? await kabinetAnimals.writeListingIf(
          atShelter.id,
          { ...readListing, confirmedAt: later(3000), undoable: null },
          readListing,
          { kind: "not_recorded", because: "confirmation" },
        )
      : { kind: "ok" as const };
  const afterMove = await kabinetAnimals.findWithCity(atShelter.id);
  check(
    "listing jsonb compare-and-set (HS-T4b)",
    readListing?.kind === "published" &&
      listingMoved.kind === "ok" &&
      staleMove.kind === "conflict" &&
      afterMove?.animal.listing.kind === "published" &&
      afterMove.animal.listing.confirmedAt.getTime() === later(2000).getTime() &&
      afterMove.animal.lastUpdatedAt.getTime() === afterEdit?.animal.lastUpdatedAt.getTime(),
    `read ${readListing?.kind}, move ${listingMoved.kind}, stale ${staleMove.kind}`,
  );

  // 21. deleteDraft on a never-published draft a swipe points at: the FK
  // refuses, and the SQLSTATE 23503 read off neon-http's error becomes the
  // typed `referenced`, never a 500 (HS-Q9); an unreferenced draft deletes.
  const referencedDraft = makeAnimal({
    id: randomUUID() as never,
    shelterId: shelter.id,
    listing: { kind: "draft" },
  });
  const freeDraft = makeAnimal({
    id: randomUUID() as never,
    shelterId: shelter.id,
    listing: { kind: "draft" },
  });
  await animalRepo(db).insert(referencedDraft, city.id);
  await animalRepo(db).insert(freeDraft, city.id);
  const adopter = makeAdopter({ id: randomUUID() as never });
  await adopterRepo(db).insert(adopter);
  await swipeRepo(db).record(
    makeSwipe({ adopterId: adopter.id, animalId: referencedDraft.id, at: NOW }),
  );
  const deletedLine = (animal: { id: typeof freeDraft.id; name: string }) =>
    ({
      id: randomUUID(),
      entry: {
        kind: "animal_deleted",
        at: later(4000),
        actor: smokeActor,
        animalId: animal.id,
        animalName: animal.name,
      },
    }) as const;
  const refused = await kabinetAnimals.deleteDraftIf(
    referencedDraft.id,
    0,
    deletedLine(referencedDraft),
  );
  const freed = await kabinetAnimals.deleteDraftIf(freeDraft.id, 0, deletedLine(freeDraft));
  const refusedLines = await animalLines("animal_deleted", referencedDraft.id);
  const freedLines = await animalLines("animal_deleted", freeDraft.id);
  check(
    "deleteDraft 23503 catch (HS-T4b), its line only when it deleted (K-Q7)",
    refused.kind === "referenced" &&
      freed.kind === "ok" &&
      (await kabinetAnimals.findWithCity(referencedDraft.id)) !== null &&
      (await kabinetAnimals.findWithCity(freeDraft.id)) === null &&
      refusedLines === 0 &&
      freedLines === 1,
    `referenced draft: ${refused.kind} (${refusedLines} line(s)); free draft: ${freed.kind} (${freedLines} line(s))`,
  );

  // 22. a new draft: the INSERT runs inside the CTE that writes its
  // `animal_created` line (K-Q7), so on this driver too the two land together,
  // exactly one line (review of PR 1 part 2, finding 1).
  const createdDraft = makeAnimal({
    id: randomUUID() as never,
    shelterId: shelter.id,
    listing: { kind: "draft" },
    version: 0,
  });
  await kabinetAnimals.insert(createdDraft, city.id, {
    id: randomUUID(),
    entry: {
      kind: "animal_created",
      at: later(5000),
      actor: smokeActor,
      animalId: createdDraft.id,
      animalName: createdDraft.name,
    },
  });
  const createdRead = await kabinetAnimals.findWithCity(createdDraft.id);
  const createdLines = await animalLines("animal_created", createdDraft.id);
  check(
    "draft insert in a CTE with its animal_created line (K-Q7)",
    createdRead?.animal.listing.kind === "draft" && createdLines === 1,
    `draft ${createdRead === null ? "missing" : createdRead.animal.listing.kind}, ${createdLines} animal_created line(s)`,
  );

  // 23. a recorded listing move (publish): the listing compare-and-set and its
  // `animal_listing_changed` line in one statement, one line; the same move
  // again on the now-stale read conflicts and records nothing.
  const draftListing = createdRead?.animal.listing ?? { kind: "draft" as const };
  const published = transitionListing(draftListing, { type: "publish", at: later(6000) });
  const listingLine = (): ListingMoveHistory => ({
    kind: "recorded",
    row: {
      id: randomUUID(),
      entry: {
        kind: "animal_listing_changed",
        at: later(6000),
        actor: smokeActor,
        animalId: createdDraft.id,
        animalName: createdDraft.name,
        event: { type: "publish" },
        from: "draft",
        to: "published",
      },
    },
  });
  const recordedMove =
    published.kind === "ok"
      ? await kabinetAnimals.writeListingIf(
          createdDraft.id,
          published.next,
          draftListing,
          listingLine(),
        )
      : { kind: "conflict" as const };
  const conflictingMove =
    published.kind === "ok"
      ? await kabinetAnimals.writeListingIf(
          createdDraft.id,
          published.next,
          draftListing,
          listingLine(),
        )
      : { kind: "ok" as const };
  const afterRecorded = await kabinetAnimals.findWithCity(createdDraft.id);
  const moveLines = await animalLines("animal_listing_changed", createdDraft.id);
  check(
    "recorded listing move writes one animal_listing_changed line; a conflicting one none (K-Q7)",
    published.kind === "ok" &&
      recordedMove.kind === "ok" &&
      conflictingMove.kind === "conflict" &&
      afterRecorded?.animal.listing.kind === "published" &&
      moveLines === 1,
    `move ${recordedMove.kind}, conflicting ${conflictingMove.kind}, now ${afterRecorded?.animal.listing.kind}, ${moveLines} animal_listing_changed line(s)`,
  );

  // 24. a photo change compare-and-sets on the photo list as read back
  // through this driver (jsonb equality, P-Q3): the read list writes,
  // `last_updated_at` moves, `version` stays, one `animal_edited` line naming
  // photos; the same stale read again writes and records nothing.
  const photoRead = await kabinetAnimals.findWithCity(createdDraft.id);
  const smokePhoto = (n: number) => ({
    storageKey: `animals/${createdDraft.id}/${randomUUID()}`,
    width: 800 + n,
    height: 1000,
    alt: null,
  });
  const nextPhotos = [smokePhoto(1), smokePhoto(2)];
  const photosLine = (): AnimalHistoryRow<"animal_edited"> => ({
    id: randomUUID(),
    entry: {
      kind: "animal_edited",
      at: later(7000),
      actor: smokeActor,
      animalId: createdDraft.id,
      animalName: createdDraft.name,
      fields: ["photos"],
    },
  });
  const photoWrite = photoRead
    ? await kabinetAnimals.writePhotosIf(
        createdDraft.id,
        nextPhotos,
        photoRead.animal.photos,
        later(7000),
        photosLine(),
      )
    : { kind: "conflict" as const };
  const stalePhotoWrite = photoRead
    ? await kabinetAnimals.writePhotosIf(
        createdDraft.id,
        [smokePhoto(3)],
        photoRead.animal.photos,
        later(8000),
        photosLine(),
      )
    : { kind: "ok" as const };
  const afterPhotos = await kabinetAnimals.findWithCity(createdDraft.id);
  const photoLines = (await history()).filter(
    (entry) =>
      entry.kind === "animal_edited" &&
      entry.animalId === createdDraft.id &&
      entry.fields.includes("photos"),
  ).length;
  check(
    "photo list jsonb compare-and-set with its animal_edited line (P-Q3)",
    photoWrite.kind === "ok" &&
      stalePhotoWrite.kind === "conflict" &&
      afterPhotos?.animal.photos.length === 2 &&
      afterPhotos.animal.photos[0]?.storageKey === nextPhotos[0]?.storageKey &&
      afterPhotos.animal.lastUpdatedAt.getTime() === later(7000).getTime() &&
      afterPhotos.animal.version === photoRead?.animal.version &&
      photoLines === 1,
    `write ${photoWrite.kind}, stale ${stalePhotoWrite.kind}, ${afterPhotos?.animal.photos.length} photo(s), version ${photoRead?.animal.version} → ${afterPhotos?.animal.version}, ${photoLines} photos line(s)`,
  );

  // 25. the compare-and-set every reorder, remove and add-to-non-empty makes:
  // the expected value is a non-empty list of photo objects (`alt: null`) as
  // neon-http reads it back, not step 24's `[]`. If that read-back did not
  // compare equal as jsonb, every such write would conflict in production.
  // Reorder against the list as read, then remove against the reorder as
  // read; the pre-reorder list, now stale, writes and records nothing.
  const heldPhotos = afterPhotos?.animal.photos ?? [];
  const reorderWrite =
    heldPhotos.length === 2
      ? await kabinetAnimals.writePhotosIf(
          createdDraft.id,
          [...heldPhotos].reverse(),
          heldPhotos,
          later(9000),
          photosLine(),
        )
      : { kind: "conflict" as const };
  const afterReorder = await kabinetAnimals.findWithCity(createdDraft.id);
  const reorderedPhotos = afterReorder?.animal.photos ?? [];
  const removeWrite =
    reorderedPhotos.length === 2
      ? await kabinetAnimals.writePhotosIf(
          createdDraft.id,
          reorderedPhotos.slice(0, 1),
          reorderedPhotos,
          later(10000),
          photosLine(),
        )
      : { kind: "conflict" as const };
  const staleReorderWrite = await kabinetAnimals.writePhotosIf(
    createdDraft.id,
    [...heldPhotos].reverse(),
    heldPhotos,
    later(11000),
    photosLine(),
  );
  const afterRemove = await kabinetAnimals.findWithCity(createdDraft.id);
  const nonEmptyPhotoLines = (await history()).filter(
    (entry) =>
      entry.kind === "animal_edited" &&
      entry.animalId === createdDraft.id &&
      entry.fields.includes("photos"),
  ).length;
  check(
    "photo list compare-and-set against a non-empty read-back list: reorder, remove, stale (P-Q3)",
    reorderWrite.kind === "ok" &&
      reorderedPhotos[0]?.storageKey === nextPhotos[1]?.storageKey &&
      reorderedPhotos[1]?.storageKey === nextPhotos[0]?.storageKey &&
      removeWrite.kind === "ok" &&
      staleReorderWrite.kind === "conflict" &&
      afterRemove?.animal.photos.length === 1 &&
      afterRemove.animal.photos[0]?.storageKey === nextPhotos[1]?.storageKey &&
      afterRemove.animal.lastUpdatedAt.getTime() === later(10000).getTime() &&
      afterRemove.animal.version === photoRead?.animal.version &&
      nonEmptyPhotoLines === 3,
    `reorder ${reorderWrite.kind}, remove ${removeWrite.kind}, stale ${staleReorderWrite.kind}, ${afterRemove?.animal.photos.length} photo(s), version ${photoRead?.animal.version} → ${afterRemove?.animal.version}, ${nonEmptyPhotoLines} photos line(s)`,
  );

  // 26. R-UI answer 2 (Oleksii, verbatim: "add the admins count (signed in /
  // invited) and the donationPending flag to the list row, in one query (no
  // N+1)"): the S1 row's counts come from one grouped subquery over a UNION
  // of members and pending invitees, with a NOT EXISTS, a FILTER'd count and
  // a jsonb_typeof flag, all read back through neon-http. A shelter with a
  // member (whose own invitation is still pending), a re-invited address and
  // an expired invitation counts 1 joined and 2 invited, as `adminsOf` lists
  // them; one that never invited anyone counts 0 and 0, with no link waiting.
  const countedBase = makeShelter({
    id: randomUUID() as ShelterId,
    displayName: `Smoke ${tag} F`,
    pendingDonation: {
      link: { url: "https://send.monobank.ua/jar/smoke", provider: "monobank_jar" },
      proposedAt: NOW,
      proposedBy: randomUUID() as ShelterAdminId,
    },
  });
  const uncountedBase = makeShelter({
    id: randomUUID() as ShelterId,
    displayName: `Smoke ${tag} G`,
    pendingDonation: null,
  });
  for (const s of [countedBase, uncountedBase]) {
    await insertShelterFromScript(
      db,
      {
        ...s,
        exactAddress: { ...s.exactAddress, cityId: city.id },
        publicLocation: publicLocationOf(s.id, { ...s.exactAddress, cityId: city.id }, policy),
      },
      by,
    );
  }
  const inviteTo = (email: string, at: Date) =>
    invitations.invite({
      shelterId: countedBase.id,
      email,
      name: "Smoke counted",
      inviterUserId: operator,
      ids: { invitationId: randomUUID(), userId: randomUUID(), organizationId: randomUUID() },
      now: at,
      history: { id: randomUUID(), entry: inviteEntry(email) },
    });
  const countedMember = await inviteTo(`smoke-counted-member-${tag}@example.invalid`, NOW);
  await inviteTo(`smoke-counted-again-${tag}@example.invalid`, NOW);
  await inviteTo(`smoke-counted-again-${tag}@example.invalid`, later(1000));
  await inviteTo(`smoke-counted-expired-${tag}@example.invalid`, later(-10 * 86_400_000));
  const countedOrganization = await kabinetRegistryRepo(db).organizationIdOf(countedBase.id);
  if (countedMember.kind === "invited" && countedOrganization !== null) {
    await db.insert(authMember).values({
      id: randomUUID(),
      organizationId: countedOrganization,
      userId: countedMember.userId,
      role: "admin",
      createdAt: NOW,
    });
  }
  const rowNamed = async (name: string) =>
    (await registry.listPage({ search: name, status: null, after: null, limit: 5 })).items.find(
      (item) => item.displayName === name,
    );
  const counted = await rowNamed(`Smoke ${tag} F`);
  const uncounted = await rowNamed(`Smoke ${tag} G`);
  const countedListed = await registry.adminsOf(countedBase.id);
  const listedJoined = countedListed.filter((a) => a.invite.status === "accepted").length;
  const listedInvited = countedListed.filter((a) => a.invite.status === "pending").length;
  check(
    "S1 row: admin counts and donationPending (one grouped subquery, R-UI answer 2)",
    counted?.admins.joined === 1 &&
      counted.admins.invited === 2 &&
      counted.admins.joined === listedJoined &&
      counted.admins.invited === listedInvited &&
      counted.donationPending === true &&
      uncounted?.admins.joined === 0 &&
      uncounted.admins.invited === 0 &&
      uncounted.donationPending === false,
    `F: joined ${counted?.admins.joined}, invited ${counted?.admins.invited} (adminsOf ${listedJoined}/${listedInvited}), donationPending ${counted?.donationPending}; G: joined ${uncounted?.admins.joined}, invited ${uncounted?.admins.invited}, donationPending ${uncounted?.donationPending}`,
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
