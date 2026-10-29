import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import {
  type AdopterId,
  type Animal,
  type AnimalId,
  type AnimalListingState,
  type ContactReveal,
  DEFAULT_SEEN_SET_POLICY,
  EVERYONE_SCOPE,
  type FeedFilters,
  isDraftAnimal,
  listingAfterPhotoChange,
  listingHistoryEventOf,
  type ModeratorId,
  NO_FILTERS,
  publicLocationOf,
  type ShelterAdminId,
  type ShelterHistoryEntry,
  type ShelterId,
  testOnlyLocationPolicy,
  transitionListing,
} from "@opika/domain";
import { count, countDistinct, eq, inArray, sql } from "drizzle-orm";
import { createDatabase, type Database, inOneTransaction } from "../src/client";
import { variantObjectKey } from "../src/image-pipeline/variants";
import { productionEndpoint } from "../src/prod-guard";
import { adopterRepo, ORPHAN_ADOPTER_MIN_AGE_MS } from "../src/repos/adopter-repo";
import { animalRepo } from "../src/repos/animal-repo";
import { authExpiryRepo, KABINET_SESSION_LIMITS } from "../src/repos/auth-expiry-repo";
import { authRevokeRepo } from "../src/repos/auth-revoke-repo";
import { cityRepo } from "../src/repos/city-repo";
import { feedRepo } from "../src/repos/feed-repo";
import { galleryRepo } from "../src/repos/gallery-repo";
import {
  type AnimalHistoryRow,
  isCheckViolation,
  kabinetAnimalRepo,
  type ListingMoveHistory,
} from "../src/repos/kabinet-animal-repo";
import { kabinetInvitationAcceptRepo } from "../src/repos/kabinet-invitation-accept-repo";
import { kabinetInvitationRepo } from "../src/repos/kabinet-invitation-repo";
import { kabinetInvitedUsersRepo } from "../src/repos/kabinet-invited-users-repo";
import { kabinetRegistryRepo } from "../src/repos/kabinet-registry-repo";
import { kabinetShelterRepo } from "../src/repos/kabinet-shelter-repo";
import { kabinetSupportRepo, SUPPORT_IDLE_MS } from "../src/repos/kabinet-support-repo";
import {
  afterDeleted,
  recordScan,
  referencedObjectKeys,
  referencedStorageKeys,
  stillUnreferenced,
} from "../src/repos/r2-cleanup-repo";
import { revealRepo } from "../src/repos/reveal-repo";
import { sessionRepo } from "../src/repos/session-repo";
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
  superAdmins,
  supportSessions,
} from "../src/schema/auth";
import { reveals } from "../src/schema/reveals";
import { insertShelterFromScript, recordAnimalsImported } from "../src/script-history";
import {
  makeAdopter,
  makeAnimal,
  makeCity,
  makeDraftAnimal,
  makeReveal,
  makeShelter,
  makeSwipe,
} from "../src/test-utils/fixtures";
import { type SmokeTarget, smokeTarget } from "../src/test-utils/smoke-target";
import { runGeographySmoke } from "./neon-smoke-geography";

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

  // 18. the auth clean-up's one statement (KH-Q9, EM-Q11), with PW-1's limits by role
  // (F-B9, §9 answers 3 and 6: a shelter-side session 30 days idle and 90 at most, the
  // operator's 7 and 30; KABINET_SESSION_LIMITS): two data-modifying CTEs and their counts,
  // and, new with PW-1, a subquery on super_admins inside the delete, through neon-http. Rows
  // past expiry go; a session past a limit goes even with its expiry still ahead (EM-Q11: "Test
  // the case where the cap is passed but the idle expiry is in the future"); one just inside a
  // limit stays, and a shelter-side session past the operator's limits stays. On a disposable
  // branch the counts may include rows copied from production, so they are "at least" and this
  // run's own rows are checked by id.
  const DAY_MS = 86_400_000;
  const { shelterAdmin, operator: operatorLimits } = KABINET_SESSION_LIMITS;
  const granted = randomUUID();
  await db.insert(authUser).values({
    id: granted,
    name: `smoke-granted-${tag}`,
    email: `smoke-granted-${tag}@example.invalid`,
    emailVerified: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(superAdmins).values({ id: randomUUID(), userId: granted, grantedAt: NOW });
  const aged = (userId: string, ago: { created: number; updated: number }) => ({
    ...session(userId),
    createdAt: later(-ago.created),
    updatedAt: later(-ago.updated),
    expiresAt: later(60 * DAY_MS),
  });
  const rows = {
    expired: { ...session(operator), expiresAt: later(-1000) },
    live: { ...session(operator), expiresAt: later(DAY_MS) },
    pastCap: aged(operator, { created: shelterAdmin.absoluteMs + 60_000, updated: 60_000 }),
    underCap: aged(operator, { created: shelterAdmin.absoluteMs - 60_000, updated: 60_000 }),
    pastIdle: aged(operator, { created: DAY_MS, updated: shelterAdmin.idleMs + 60_000 }),
    underIdle: aged(operator, {
      created: shelterAdmin.idleMs,
      updated: shelterAdmin.idleMs - 60_000,
    }),
    opPastIdle: aged(granted, { created: DAY_MS, updated: operatorLimits.idleMs + 60_000 }),
    opUnderIdle: aged(granted, { created: DAY_MS, updated: operatorLimits.idleMs - 60_000 }),
    opPastCap: aged(granted, { created: operatorLimits.absoluteMs + 60_000, updated: 60_000 }),
    opUnderCap: aged(granted, { created: operatorLimits.absoluteMs - 60_000, updated: 60_000 }),
  };
  await db.insert(authSession).values(Object.values(rows));
  const expiredVerification = randomUUID();
  const liveVerification = randomUUID();
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
      verification(expiredVerification, later(-1000)),
      verification(liveVerification, later(900_000)),
    ]);
  const counts = await authExpiryRepo(db).deleteExpired(NOW);
  const sessionIds = Object.values(rows).map((row) => row.id);
  const left = new Set([
    ...(
      await db
        .select({ id: authSession.id })
        .from(authSession)
        .where(inArray(authSession.id, sessionIds))
    ).map((r) => r.id),
    ...(
      await db
        .select({ id: authVerification.id })
        .from(authVerification)
        .where(inArray(authVerification.id, [expiredVerification, liveVerification]))
    ).map((r) => r.id),
  ]);
  const gone = ["expired", "pastCap", "pastIdle", "opPastIdle", "opPastCap"] as const;
  const kept = ["live", "underCap", "underIdle", "opUnderIdle", "opUnderCap"] as const;
  const wrong = [
    ...gone.filter((name) => left.has(rows[name].id)).map((name) => `${name} kept`),
    ...kept.filter((name) => !left.has(rows[name].id)).map((name) => `${name} deleted`),
    ...(left.has(expiredVerification) ? ["expired verification kept"] : []),
    ...(left.has(liveVerification) ? [] : ["live verification deleted"]),
  ];
  check(
    "auth clean-up (expiry, and each holder's limits: shelter-side 30/90, the operator's 7/30, one statement)",
    typeof counts.sessions === "number" &&
      typeof counts.verifications === "number" &&
      counts.sessions >= gone.length &&
      counts.verifications >= 1 &&
      wrong.length === 0,
    `deleted ${counts.verifications} verification(s), ${counts.sessions} session(s); ${wrong.length === 0 ? "every row of this run where it should be" : wrong.join(", ")}`,
  );

  // 19-21: the K2/K3 animal writes HS-T4b names (the listing jsonb
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
          NOW,
          { kind: "not_recorded", because: "confirmation" },
        )
      : { kind: "conflict" as const };
  const staleMove =
    readListing && readListing.kind === "published"
      ? await kabinetAnimals.writeListingIf(
          atShelter.id,
          { ...readListing, confirmedAt: later(3000), undoable: null },
          readListing,
          NOW,
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
  // again on the now-stale read conflicts and records nothing. Since K3-T7 a
  // publish also compare-and-sets on `version` and a non-empty photo list, so
  // it publishes a complete draft of its own with one photo; `createdDraft`
  // stays a photo-less draft for steps 24 and 25.
  const publishable = makeAnimal({
    id: randomUUID() as never,
    shelterId: shelter.id,
    listing: { kind: "draft" },
    photos: [
      { storageKey: `animals/smoke-${tag}/${randomUUID()}`, width: 800, height: 1000, alt: null },
    ],
    version: 0,
  });
  await animalRepo(db).insert(publishable, city.id);
  const publishableRead = await kabinetAnimals.findWithCity(publishable.id);
  const draftListing = publishableRead?.animal.listing ?? { kind: "draft" as const };
  const published = transitionListing(draftListing, { type: "publish", at: later(6000) });
  const publishLine = (animal: {
    id: typeof publishable.id;
    name: string;
  }): ListingMoveHistory => ({
    kind: "recorded",
    row: {
      id: randomUUID(),
      entry: {
        kind: "animal_listing_changed",
        at: later(6000),
        actor: smokeActor,
        animalId: animal.id,
        animalName: animal.name,
        event: { type: "publish" },
        from: "draft",
        to: "published",
      },
    },
  });
  const publishGuard = (version: number) => ({
    kind: "publish" as const,
    expectedVersion: version,
  });
  const recordedMove =
    published.kind === "ok" && publishableRead
      ? await kabinetAnimals.writeListingIf(
          publishable.id,
          published.next,
          draftListing,
          NOW,
          publishLine(publishable),
          publishGuard(publishableRead.animal.version),
        )
      : { kind: "conflict" as const };
  const conflictingMove =
    published.kind === "ok" && publishableRead
      ? await kabinetAnimals.writeListingIf(
          publishable.id,
          published.next,
          draftListing,
          NOW,
          publishLine(publishable),
          publishGuard(publishableRead.animal.version),
        )
      : { kind: "ok" as const };
  const afterRecorded = await kabinetAnimals.findWithCity(publishable.id);
  const moveLines = await animalLines("animal_listing_changed", publishable.id);
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
  const draftAsRead = photoRead?.animal.listing ?? { kind: "draft" as const };
  const unchangedListing = { next: draftAsRead, expected: draftAsRead };
  const photoWrite = photoRead
    ? await kabinetAnimals.writePhotosIf(
        createdDraft.id,
        { next: nextPhotos, expected: photoRead.animal.photos },
        unchangedListing,
        later(7000),
        photosLine(),
      )
    : { kind: "conflict" as const };
  const stalePhotoWrite = photoRead
    ? await kabinetAnimals.writePhotosIf(
        createdDraft.id,
        { next: [smokePhoto(3)], expected: photoRead.animal.photos },
        unchangedListing,
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
          { next: [...heldPhotos].reverse(), expected: heldPhotos },
          unchangedListing,
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
          { next: reorderedPhotos.slice(0, 1), expected: reorderedPhotos },
          unchangedListing,
          later(10000),
          photosLine(),
        )
      : { kind: "conflict" as const };
  const staleReorderWrite = await kabinetAnimals.writePhotosIf(
    createdDraft.id,
    { next: [...heldPhotos].reverse(), expected: heldPhotos },
    unchangedListing,
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
  // Names of their own (R, S: no other step uses them), and each search must
  // find exactly its one shelter, so the step never leans on the list's order.
  const countedName = `Smoke ${tag} R`;
  const uncountedName = `Smoke ${tag} S`;
  const countedBase = makeShelter({
    id: randomUUID() as ShelterId,
    displayName: countedName,
    pendingDonation: {
      link: { url: "https://send.monobank.ua/jar/smoke", provider: "monobank_jar" },
      proposedAt: NOW,
      proposedBy: randomUUID() as ShelterAdminId,
    },
  });
  const uncountedBase = makeShelter({
    id: randomUUID() as ShelterId,
    displayName: uncountedName,
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
  const onlyRow = async (name: string, id: ShelterId) => {
    const { items } = await registry.listPage({
      search: name,
      status: null,
      after: null,
      limit: 5,
    });
    return items.length === 1 && items[0]?.id === id ? items[0] : undefined;
  };
  const counted = await onlyRow(countedName, countedBase.id);
  const uncounted = await onlyRow(uncountedName, uncountedBase.id);
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
    `R: ${counted === undefined ? "not the one row found" : `joined ${counted.admins.joined}, invited ${counted.admins.invited} (adminsOf ${listedJoined}/${listedInvited}), donationPending ${counted.donationPending}`}; S: ${uncounted === undefined ? "not the one row found" : `joined ${uncounted.admins.joined}, invited ${uncounted.admins.invited}, donationPending ${uncounted.donationPending}`}`,
  );

  // 27-31: K3 (PR 4). F-B1's nullable facts and their CHECKs (migration
  // 0012), the draft-only null guard on a form save, the publish
  // compare-and-set (K3-T7) and RH-B7's photo write, each through neon-http.
  const smokePhotoOf = (animalId: string) => ({
    storageKey: `animals/${animalId}/${randomUUID()}`,
    width: 800,
    height: 1000,
    alt: null,
  });
  const editLine = (
    animal: { id: typeof publishable.id; name: string },
    fields: AnimalHistoryRow<"animal_edited">["entry"]["fields"],
    at: Date,
  ): AnimalHistoryRow<"animal_edited"> => ({
    id: randomUUID(),
    entry: {
      kind: "animal_edited",
      at,
      actor: smokeActor,
      animalId: animal.id,
      animalName: animal.name,
      fields,
    },
  });
  const rawRow = async (id: string) =>
    (
      await db
        .select({
          size: animals.size,
          age: animals.age,
          ageAnchorAt: animals.ageAnchorAt,
          descriptionUk: animals.descriptionUk,
          lastConfirmedAt: animals.lastConfirmedAt,
          version: animals.version,
        })
        .from(animals)
        .where(eq(animals.id, id as never))
    )[0];

  // 27. a name-and-species draft goes in through the insert CTE with a null
  // size, age, anchor and description, and reads back through this driver
  // with those nulls; the mapper gives a draft. (One photo, so step 28's
  // publish passes its own compare-and-set and reaches the CHECK.)
  const bareDraftId = randomUUID() as never;
  const bareDraft = makeDraftAnimal({
    id: bareDraftId,
    shelterId: shelter.id,
    name: `Smoke ${tag} bare`,
    photos: [smokePhotoOf(bareDraftId)],
  });
  await kabinetAnimals.insert(bareDraft, city.id, {
    id: randomUUID(),
    entry: {
      kind: "animal_created",
      at: later(12000),
      actor: smokeActor,
      animalId: bareDraft.id,
      animalName: bareDraft.name,
    },
  });
  const bareRead = await kabinetAnimals.findWithCity(bareDraft.id);
  const bareRaw = await rawRow(bareDraft.id);
  check(
    "a name-and-species draft stores null facts and reads back as a draft (F-B1, 0012)",
    bareRead !== null &&
      isDraftAnimal(bareRead.animal) &&
      bareRead.animal.size === null &&
      bareRead.animal.age === null &&
      bareRead.animal.description === null &&
      bareRaw?.size === null &&
      bareRaw.age === null &&
      bareRaw.ageAnchorAt === null &&
      bareRaw.descriptionUk === null,
    `read ${bareRead === null ? "missing" : bareRead.animal.listing.kind}, size ${bareRaw?.size}, age ${bareRaw?.age === null ? "null" : "set"}, anchor ${bareRaw?.ageAnchorAt === null ? "null" : "set"}, description ${bareRaw?.descriptionUk === null ? "null" : "set"}`,
  );

  // 28. animals_listing_facts_check refuses publishing that row: the guarded
  // publish matches (draft, version, one photo), the CHECK throws, and SQLSTATE
  // 23514 is found in neon-http's error chain; nothing is written or recorded.
  const barePublish = transitionListing({ kind: "draft" }, { type: "publish", at: later(13000) });
  let checkRefusal: "23514" | "other error" | "no error" = "no error";
  if (barePublish.kind === "ok" && bareRead) {
    try {
      await kabinetAnimals.writeListingIf(
        bareDraft.id,
        barePublish.next,
        bareRead.animal.listing,
        NOW,
        publishLine(bareDraft),
        publishGuard(bareRead.animal.version),
      );
    } catch (error) {
      checkRefusal = isCheckViolation(error) ? "23514" : "other error";
    }
  }
  const bareAfter = await kabinetAnimals.findWithCity(bareDraft.id);
  const barePublishLines = await animalLines("animal_listing_changed", bareDraft.id);
  check(
    "the listing-facts CHECK refuses publishing an incomplete draft with 23514 (F-B1)",
    checkRefusal === "23514" &&
      bareAfter?.animal.listing.kind === "draft" &&
      barePublishLines === 0,
    `${checkRefusal}, now ${bareAfter?.animal.listing.kind}, ${barePublishLines} animal_listing_changed line(s)`,
  );

  // 29. a save that writes a null (a cleared description) applies only while
  // the row is a draft: on a complete draft it lands; on the published row
  // from step 23, at its current version, it writes nothing.
  const clearableId = randomUUID() as never;
  const clearable = makeAnimal({
    id: clearableId,
    shelterId: shelter.id,
    listing: { kind: "draft" },
  });
  await animalRepo(db).insert(clearable, city.id);
  const clearableRead = await kabinetAnimals.findWithCity(clearable.id);
  const draftClear =
    clearableRead && isDraftAnimal(clearableRead.animal)
      ? await kabinetAnimals.writeEditIf(
          { ...clearableRead.animal, description: null, lastUpdatedAt: later(14000) },
          clearableRead.cityId,
          clearableRead.animal.version,
          editLine(clearable, ["description"], later(14000)),
        )
      : { kind: "conflict" as const };
  const publishedRead = await kabinetAnimals.findWithCity(publishable.id);
  const listedClear =
    publishedRead && publishedRead.animal.listing.kind === "published"
      ? await kabinetAnimals.writeEditIf(
          // The repo is handed a null on a published row, as a handler that
          // read a draft just before the publish would.
          {
            ...publishedRead.animal,
            description: null,
            listing: { kind: "draft" },
            lastUpdatedAt: later(14000),
          },
          publishedRead.cityId,
          publishedRead.animal.version,
          editLine(publishable, ["description"], later(14000)),
        )
      : { kind: "ok" as const };
  const clearedRaw = await rawRow(clearable.id);
  const listedAfterClear = await kabinetAnimals.findWithCity(publishable.id);
  check(
    "a null-writing save lands on a draft and writes nothing on a published row (F-B1)",
    draftClear.kind === "ok" &&
      clearedRaw?.descriptionUk === null &&
      listedClear.kind === "conflict" &&
      listedAfterClear?.animal.listing.kind === "published" &&
      listedAfterClear.animal.description !== null &&
      listedAfterClear.animal.version === publishedRead?.animal.version,
    `draft ${draftClear.kind} (description ${clearedRaw?.descriptionUk === null ? "null" : "kept"}), published ${listedClear.kind} (still ${listedAfterClear?.animal.listing.kind})`,
  );

  // 30. publishing compare-and-sets on the listing, `version` and a non-empty
  // photo list (K3-T7): a stale version writes nothing, the current one
  // publishes; a complete draft with no photo writes nothing.
  const publishRaceId = randomUUID() as never;
  const raced = makeAnimal({
    id: publishRaceId,
    shelterId: shelter.id,
    listing: { kind: "draft" },
    photos: [smokePhotoOf(publishRaceId)],
  });
  await animalRepo(db).insert(raced, city.id);
  const racedRead = await kabinetAnimals.findWithCity(raced.id);
  const racedEdit = racedRead
    ? await kabinetAnimals.writeEditIf(
        { ...racedRead.animal, name: `Smoke ${tag} raced`, lastUpdatedAt: later(15000) },
        racedRead.cityId,
        racedRead.animal.version,
        editLine(raced, ["name"], later(15000)),
      )
    : { kind: "conflict" as const };
  const racedPublish = transitionListing({ kind: "draft" }, { type: "publish", at: later(16000) });
  const stalePublish =
    racedPublish.kind === "ok" && racedRead
      ? await kabinetAnimals.writeListingIf(
          raced.id,
          racedPublish.next,
          racedRead.animal.listing,
          NOW,
          publishLine(raced),
          publishGuard(racedRead.animal.version),
        )
      : { kind: "ok" as const };
  const freshPublish =
    racedPublish.kind === "ok" && racedRead
      ? await kabinetAnimals.writeListingIf(
          raced.id,
          racedPublish.next,
          racedRead.animal.listing,
          NOW,
          publishLine(raced),
          publishGuard(racedRead.animal.version + 1),
        )
      : { kind: "conflict" as const };
  const photolessId = randomUUID() as never;
  const photoless = makeAnimal({
    id: photolessId,
    shelterId: shelter.id,
    listing: { kind: "draft" },
  });
  await animalRepo(db).insert(photoless, city.id);
  const photolessPublish =
    racedPublish.kind === "ok"
      ? await kabinetAnimals.writeListingIf(
          photoless.id,
          racedPublish.next,
          { kind: "draft" },
          NOW,
          publishLine(photoless),
          publishGuard(0),
        )
      : { kind: "ok" as const };
  const racedLines = await animalLines("animal_listing_changed", raced.id);
  const photolessAfter = await kabinetAnimals.findWithCity(photoless.id);
  check(
    "publish compare-and-sets on version and a non-empty photo list (K3-T7)",
    racedEdit.kind === "ok" &&
      stalePublish.kind === "conflict" &&
      freshPublish.kind === "ok" &&
      racedLines === 1 &&
      photolessPublish.kind === "conflict" &&
      photolessAfter?.animal.listing.kind === "draft",
    `edit ${racedEdit.kind}, stale version ${stalePublish.kind}, current version ${freshPublish.kind} (${racedLines} line(s)), no photo ${photolessPublish.kind}`,
  );

  // 31. RH-B7: a photo change on a published row moves `photos`,
  // `listing.confirmedAt` and `last_confirmed_at` together under the photo
  // and listing compare-and-set; a stale listing writes nothing; on a draft
  // (steps 24-25's `createdDraft`) `last_confirmed_at` stays null.
  const visibleRead = await kabinetAnimals.findWithCity(raced.id);
  const photoAt = later(17000);
  const visibleWrite = visibleRead
    ? await kabinetAnimals.writePhotosIf(
        raced.id,
        {
          next: [...visibleRead.animal.photos, smokePhotoOf(raced.id)],
          expected: visibleRead.animal.photos,
        },
        {
          next: listingAfterPhotoChange(visibleRead.animal.listing, photoAt),
          expected: visibleRead.animal.listing,
        },
        photoAt,
        editLine(raced, ["photos"], photoAt),
      )
    : { kind: "conflict" as const };
  const staleListingWrite = visibleRead
    ? await kabinetAnimals.writePhotosIf(
        raced.id,
        // The photo list as it now stands, but the listing as first read.
        {
          next: [smokePhotoOf(raced.id)],
          expected: (await kabinetAnimals.findWithCity(raced.id))?.animal.photos ?? [],
        },
        {
          next: listingAfterPhotoChange(visibleRead.animal.listing, later(18000)),
          expected: visibleRead.animal.listing,
        },
        later(18000),
        editLine(raced, ["photos"], later(18000)),
      )
    : { kind: "ok" as const };
  const visibleAfter = await kabinetAnimals.findWithCity(raced.id);
  const visibleRaw = await rawRow(raced.id);
  const draftRaw = await rawRow(createdDraft.id);
  const confirmedOn = (listing: AnimalListingState | undefined) =>
    listing?.kind === "published" || listing?.kind === "reserved"
      ? listing.confirmedAt.getTime()
      : null;
  check(
    "a photo change on a published row moves the confirmation date with the photos; stale listing writes nothing (RH-B7)",
    visibleWrite.kind === "ok" &&
      staleListingWrite.kind === "conflict" &&
      visibleAfter?.animal.photos.length === 2 &&
      confirmedOn(visibleAfter.animal.listing) === photoAt.getTime() &&
      visibleRaw?.lastConfirmedAt?.getTime() === photoAt.getTime() &&
      visibleRaw.version === visibleRead?.animal.version &&
      draftRaw?.lastConfirmedAt === null,
    `write ${visibleWrite.kind}, stale listing ${staleListingWrite.kind}, ${visibleAfter?.animal.photos.length} photo(s), confirmed ${visibleRaw?.lastConfirmedAt?.toISOString()}, draft last_confirmed_at ${draftRaw?.lastConfirmedAt === null ? "null" : "set"}`,
  );
  // 32-36: K2 (PR 5). The list's keyset, filters and counts, and the listing
  // moves K2's buttons make (confirm and its undo with a stored `undoable`;
  // reserve, release, withdraw with a note, restore, adopt), each through
  // neon-http against the listing as this driver reads it back. On a shelter
  // of their own, so the inventory is exactly this run's.
  const k2Base = makeShelter({ id: randomUUID() as ShelterId, displayName: `Smoke ${tag} K2` });
  const k2Shelter = {
    ...k2Base,
    exactAddress: { ...k2Base.exactAddress, cityId: city.id },
    publicLocation: publicLocationOf(
      k2Base.id,
      { ...k2Base.exactAddress, cityId: city.id },
      policy,
    ),
  };
  await insertShelterFromScript(db, k2Shelter, by);
  const DAY = 24 * 60 * 60 * 1000;
  const k2StaleBefore = later(-31 * DAY);
  const visibleSince = (kind: "published" | "reserved", confirmedAt: Date): AnimalListingState =>
    kind === "published"
      ? { kind, publishedAt: confirmedAt, confirmedAt, undoable: null }
      : { kind, since: confirmedAt, publishedAt: confirmedAt, confirmedAt, undoable: null };
  const k2Animal = async (listing: AnimalListingState, lastUpdatedAt: Date) => {
    const id = randomUUID() as never;
    const animal = makeAnimal({
      id,
      shelterId: k2Shelter.id,
      listing,
      lastUpdatedAt,
      photos: [smokePhotoOf(id)],
    });
    await animalRepo(db).insert(animal, city.id);
    return animal;
  };
  const k2Stale = await k2Animal(visibleSince("published", later(-40 * DAY)), later(-1000));
  // Two rows tied on edit time, so the page boundary falls inside the tie.
  const k2StaleReserved = await k2Animal(visibleSince("reserved", k2StaleBefore), later(-2000));
  const k2Fresh = await k2Animal(visibleSince("published", later(-DAY)), later(-2000));
  const k2Draft = await k2Animal({ kind: "draft" }, later(-3000));
  const k2Withdrawn = await k2Animal(
    { kind: "withdrawn", withdrawnAt: later(-DAY), reason: { code: "other", note: null } },
    later(-4000),
  );
  const k2Inventory = [k2Stale, k2StaleReserved, k2Fresh, k2Draft, k2Withdrawn];
  type K2Filter = Parameters<typeof kabinetAnimals.listPage>[0]["filter"];
  const k2Paged = async (filter: K2Filter) => {
    const rows: { id: string; at: number }[] = [];
    let k2After: Parameters<typeof kabinetAnimals.listPage>[0]["after"] = null;
    for (let page = 0; page < 10; page += 1) {
      const result = await kabinetAnimals.listPage({
        shelterId: k2Shelter.id,
        filter,
        after: k2After,
        limit: 2,
      });
      rows.push(...result.items.map((a) => ({ id: a.id, at: a.lastUpdatedAt.getTime() })));
      k2After = result.next;
      if (k2After === null) break;
    }
    return rows;
  };
  // Order is checked on the edit time, which this driver must page through
  // exactly; the tie's order is the database collation's, so only its
  // completeness is checked.
  const newestFirst = (rows: { at: number }[]) =>
    rows.every((row, i) => i === 0 || (rows[i - 1]?.at ?? Number.POSITIVE_INFINITY) >= row.at);
  const sameIds = (rows: { id: string }[], animals: { id: string }[]) =>
    rows.length === animals.length &&
    new Set(rows.map((row) => row.id)).size === rows.length &&
    animals.every((animal) => rows.some((row) => row.id === animal.id));

  // 32. the K2 keyset `(last_updated_at DESC, id DESC)`, paged two at a time.
  const k2All = await k2Paged({ kind: "all" });
  check(
    "K2 list keyset (last_updated_at, id): every row once, newest edit first, across a tie",
    sameIds(k2All, k2Inventory) && newestFirst(k2All),
    `${k2All.length} of ${k2Inventory.length} row(s) over pages of 2, ${newestFirst(k2All) ? "newest first" : "OUT OF ORDER"}`,
  );

  // 33. a kind filter, the stale cut (boundary row included) agreeing with
  // staleCount, and the chip counts, all read through this driver.
  const k2Published = await k2Paged({ kind: "listing", listing: "published" });
  const k2StaleRows = await k2Paged({ kind: "stale", staleBefore: k2StaleBefore });
  const k2StaleCount = await kabinetAnimals.staleCount(k2Shelter.id, k2StaleBefore);
  const k2Counts = await kabinetAnimals.countsByKind(k2Shelter.id);
  const k2CountsExpected = { draft: 1, published: 2, reserved: 1, adopted: 0, withdrawn: 1 };
  check(
    "K2 filters: a kind, the stale cut equal to staleCount, the chip counts",
    sameIds(k2Published, [k2Stale, k2Fresh]) &&
      sameIds(k2StaleRows, [k2Stale, k2StaleReserved]) &&
      k2StaleCount === 2 &&
      JSON.stringify(k2Counts) === JSON.stringify(k2CountsExpected),
    `published ${k2Published.length}, stale ${k2StaleRows.length} listed / ${k2StaleCount} counted, counts ${JSON.stringify(k2Counts)}`,
  );

  // 34. «Ще шукає» then its undo: the confirm stores `undoable`; the undo is
  // planned on the listing as read back through this driver (Dates inside
  // jsonb included) and compare-and-sets against it, restoring the previous
  // date exactly; the same undo again, on the now-stale read, writes nothing.
  const notRecorded: ListingMoveHistory = { kind: "not_recorded", because: "confirmation" };
  const k2Confirmed = await k2Animal(visibleSince("published", later(-10 * DAY)), later(-5000));
  const beforeConfirm = await kabinetAnimals.findWithCity(k2Confirmed.id);
  const confirmMove = beforeConfirm
    ? transitionListing(beforeConfirm.animal.listing, { type: "confirm", at: later(20000) })
    : null;
  const confirmWrite =
    beforeConfirm && confirmMove?.kind === "ok"
      ? await kabinetAnimals.writeListingIf(
          k2Confirmed.id,
          confirmMove.next,
          beforeConfirm.animal.listing,
          NOW,
          notRecorded,
        )
      : { kind: "conflict" as const };
  const confirmedRead = await kabinetAnimals.findWithCity(k2Confirmed.id);
  const undoMove = confirmedRead
    ? transitionListing(confirmedRead.animal.listing, { type: "undo_confirm", at: later(21000) })
    : null;
  const undoWrite =
    confirmedRead && undoMove?.kind === "ok"
      ? await kabinetAnimals.writeListingIf(
          k2Confirmed.id,
          undoMove.next,
          confirmedRead.animal.listing,
          NOW,
          notRecorded,
        )
      : { kind: "conflict" as const };
  const staleUndo =
    confirmedRead && undoMove?.kind === "ok"
      ? await kabinetAnimals.writeListingIf(
          k2Confirmed.id,
          undoMove.next,
          confirmedRead.animal.listing,
          NOW,
          notRecorded,
        )
      : { kind: "ok" as const };
  const undoneRead = await kabinetAnimals.findWithCity(k2Confirmed.id);
  const undoneRaw = await rawRow(k2Confirmed.id);
  const storedUndo =
    confirmedRead?.animal.listing.kind === "published"
      ? confirmedRead.animal.listing.undoable
      : null;
  check(
    "confirm then undo against the read-back listing (stored undoable), restoring the date exactly",
    confirmWrite.kind === "ok" &&
      storedUndo?.previousConfirmedAt.getTime() === later(-10 * DAY).getTime() &&
      undoWrite.kind === "ok" &&
      staleUndo.kind === "conflict" &&
      confirmedOn(undoneRead?.animal.listing) === later(-10 * DAY).getTime() &&
      undoneRead?.animal.listing.kind === "published" &&
      undoneRead.animal.listing.undoable === null &&
      undoneRaw?.lastConfirmedAt?.getTime() === later(-10 * DAY).getTime(),
    `confirm ${confirmWrite.kind} (undoable ${storedUndo === null ? "missing" : "stored"}), undo ${undoWrite.kind}, again ${staleUndo.kind}, date ${undoneRaw?.lastConfirmedAt?.toISOString()}`,
  );

  // 35. reserve → release → withdraw (a note with Cyrillic and quotes) →
  // back to draft, each a recorded move planned on and compare-and-set
  // against the listing as read back: one line each, and the draft keeps its
  // first_published_at with no confirmation or wait anchor.
  const k2Moving = await k2Animal(visibleSince("published", later(-5 * DAY)), later(-6000));
  const k2Note = `Забрали «додому» - ${tag}`;
  const k2Steps = [
    { type: "reserve", at: later(22000) },
    { type: "release", at: later(23000) },
    { type: "withdraw", at: later(24000), reason: { code: "other", note: k2Note } },
    { type: "restore_to_draft", at: later(25000) },
  ] as const;
  const k2MoveResults: string[] = [];
  for (const step of k2Steps) {
    const read = await kabinetAnimals.findWithCity(k2Moving.id);
    const move = read ? transitionListing(read.animal.listing, step) : null;
    if (!read || move?.kind !== "ok") {
      k2MoveResults.push(`${step.type}: ${move?.kind ?? "missing"}`);
      break;
    }
    const written = await kabinetAnimals.writeListingIf(
      k2Moving.id,
      move.next,
      read.animal.listing,
      NOW,
      {
        kind: "recorded",
        row: {
          id: randomUUID(),
          entry: {
            kind: "animal_listing_changed",
            at: step.at,
            actor: smokeActor,
            animalId: k2Moving.id,
            animalName: k2Moving.name,
            event: listingHistoryEventOf(step),
            from: read.animal.listing.kind,
            to: move.next.kind,
          },
        },
      },
    );
    k2MoveResults.push(`${step.type}: ${written.kind}`);
    // The withdrawal's note must come back byte for byte, or the restore's
    // compare-and-set below would conflict in production.
    if (step.type === "withdraw") {
      const withdrawnRead = await kabinetAnimals.findWithCity(k2Moving.id);
      const note =
        withdrawnRead?.animal.listing.kind === "withdrawn"
          ? withdrawnRead.animal.listing.reason.note
          : null;
      if (note !== k2Note) k2MoveResults.push("note changed in the round trip");
    }
  }
  const k2MovedLines = await (async () =>
    (await shelters.historyOf(k2Shelter.id)).filter(
      (entry) => entry.kind === "animal_listing_changed" && entry.animalId === k2Moving.id,
    ).length)();
  const k2MovedRaw = (
    await db
      .select({
        listingKind: animals.listingKind,
        lastConfirmedAt: animals.lastConfirmedAt,
        waitAnchorAt: animals.waitAnchorAt,
        firstPublishedAt: animals.firstPublishedAt,
      })
      .from(animals)
      .where(eq(animals.id, k2Moving.id))
  )[0];
  check(
    "reserve, release, withdraw with a note, back to draft: recorded moves against read-back listings",
    k2MoveResults.join(", ") === "reserve: ok, release: ok, withdraw: ok, restore_to_draft: ok" &&
      k2MovedLines === 4 &&
      k2MovedRaw?.listingKind === "draft" &&
      k2MovedRaw.lastConfirmedAt === null &&
      k2MovedRaw.waitAnchorAt === null &&
      k2MovedRaw.firstPublishedAt !== null,
    `${k2MoveResults.join(", ")}; ${k2MovedLines} line(s); now ${k2MovedRaw?.listingKind}, first_published_at ${k2MovedRaw?.firstPublishedAt === null ? "CLEARED" : "kept"}`,
  );

  // 36. «Уже вдома» from a reservation: recorded, and the adopted row drops
  // out of every visible-only column (confirmation, wait anchor) and the
  // stale count.
  const k2Adopting = await k2Animal(visibleSince("reserved", later(-60 * DAY)), later(-7000));
  const staleBeforeAdopt = await kabinetAnimals.staleCount(k2Shelter.id, k2StaleBefore);
  const adoptRead = await kabinetAnimals.findWithCity(k2Adopting.id);
  const adoptMove = adoptRead
    ? transitionListing(adoptRead.animal.listing, { type: "adopt", at: later(26000) })
    : null;
  const adoptWrite =
    adoptRead && adoptMove?.kind === "ok"
      ? await kabinetAnimals.writeListingIf(
          k2Adopting.id,
          adoptMove.next,
          adoptRead.animal.listing,
          NOW,
          {
            kind: "recorded",
            row: {
              id: randomUUID(),
              entry: {
                kind: "animal_listing_changed",
                at: later(26000),
                actor: smokeActor,
                animalId: k2Adopting.id,
                animalName: k2Adopting.name,
                event: { type: "adopt" },
                from: "reserved",
                to: "adopted",
              },
            },
          },
        )
      : { kind: "conflict" as const };
  const adoptedRaw = (
    await db
      .select({
        listingKind: animals.listingKind,
        lastConfirmedAt: animals.lastConfirmedAt,
        waitAnchorAt: animals.waitAnchorAt,
      })
      .from(animals)
      .where(eq(animals.id, k2Adopting.id))
  )[0];
  const staleAfterAdopt = await kabinetAnimals.staleCount(k2Shelter.id, k2StaleBefore);
  const adoptLines = (await shelters.historyOf(k2Shelter.id)).filter(
    (entry) => entry.kind === "animal_listing_changed" && entry.animalId === k2Adopting.id,
  ).length;
  check(
    "adopt from reserved: recorded, no confirmation or wait anchor, out of the stale count",
    adoptWrite.kind === "ok" &&
      adoptLines === 1 &&
      adoptedRaw?.listingKind === "adopted" &&
      adoptedRaw.lastConfirmedAt === null &&
      adoptedRaw.waitAnchorAt === null &&
      staleBeforeAdopt === 3 &&
      staleAfterAdopt === 2,
    `${adoptWrite.kind}, ${adoptLines} line(s), now ${adoptedRaw?.listingKind}, stale ${staleBeforeAdopt} → ${staleAfterAdopt}`,
  );

  // 37. `auth:revoke-all`'s one statement (KH-Q12 rotation, the required purge
  // after rotating BETTER_AUTH_SECRET): two data-modifying CTEs that delete
  // every auth_session and auth_verification row, through neon-http, the
  // driver the CLI uses on Neon. Users and memberships stay. On a disposable
  // branch the two tables may also hold rows copied from production; they go
  // too (the branch is thrown away), so the counts are "at least". It runs
  // after every step that writes a session, since it signs out every session
  // the steps above wrote; the steps after it read no session.
  const revokeSession = randomUUID();
  const revokeLink = randomUUID();
  await db.insert(authSession).values({ ...session(operator), id: revokeSession });
  await db.insert(authVerification).values(verification(revokeLink, later(900_000)));
  const membersBefore = (await db.select({ n: count() }).from(authMember))[0]?.n ?? -1;
  const revoked = await authRevokeRepo(db).deleteAll();
  const revokeLeft = await authRevokeRepo(db).countAll();
  const membersAfter = (await db.select({ n: count() }).from(authMember))[0]?.n ?? -1;
  const operatorStays =
    (await db.select({ id: authUser.id }).from(authUser).where(eq(authUser.id, operator)))
      .length === 1;
  check(
    "auth:revoke-all (every session and sign-in link, one statement; users and members stay)",
    typeof revoked.sessions === "number" &&
      typeof revoked.verifications === "number" &&
      revoked.sessions >= 1 &&
      revoked.verifications >= 1 &&
      revokeLeft.sessions === 0 &&
      revokeLeft.verifications === 0 &&
      operatorStays &&
      membersAfter === membersBefore,
    `deleted ${revoked.sessions} session(s), ${revoked.verifications} link(s); left ${revokeLeft.sessions} and ${revokeLeft.verifications}; operator ${operatorStays ? "kept" : "GONE"}, members ${membersBefore} → ${membersAfter}`,
  );

  // 38. the gallery's relaxation counts through neon-http (found in the review
  // of #163): the query read a raw `db.execute()` result as an array, which on
  // this driver is `{ rows }`, so every count was 0 and no no-match screen
  // offered a relaxation. A city, a verified shelter and three cards of this
  // run's own, so the counts don't depend on what the branch copied from
  // production. After 37 is harmless: it reads no session.
  const relaxCity = makeCity({ id: randomUUID() as never });
  await cityRepo(db).insert(relaxCity);
  const relaxBase = makeShelter({ id: randomUUID() as ShelterId, displayName: `Smoke ${tag} G` });
  const relaxAddress = { ...relaxBase.exactAddress, cityId: relaxCity.id };
  await insertShelterFromScript(
    db,
    {
      ...relaxBase,
      exactAddress: relaxAddress,
      publicLocation: publicLocationOf(relaxBase.id, relaxAddress, policy),
    },
    by,
  );
  for (const species of ["cat", "dog", "dog"] as const) {
    await animalRepo(db).insert(
      makeAnimal({ id: randomUUID() as never, shelterId: relaxBase.id, species }),
      relaxCity.id,
    );
  }
  const relaxation = await galleryRepo(db).relaxationCounts({
    filters: {
      ...NO_FILTERS,
      cities: { kind: "oneOf", values: [relaxCity.id] },
      species: { kind: "oneOf", values: ["cat"] },
    },
    now: NOW,
  });
  const withoutSpecies = relaxation.relaxations.find((r) => r.dimension === "species");
  check(
    "gallery relaxation counts (typed select, not a raw execute read)",
    relaxation.current === 1 && withoutSpecies?.additional === 2,
    `current ${relaxation.current}, without species +${withoutSpecies?.additional ?? "none"}, ${relaxation.relaxations.length} suggestion(s)`,
  );

  // 39. fur (DR1 S3): set «long», then cleared to null, through the kabinet
  // edit's own write (`writeEditIf`, as `animalsUpdate` calls it), read back
  // through this driver. (Until the gallery filter restructure removed the
  // fur filter, this also filtered the gallery and the deck by fur,
  // Oleksii's Q2 (a) - that half is gone with the filter itself.) A city, a
  // verified shelter and a published dog of this run's own.
  const furCity = makeCity({ id: randomUUID() as never });
  await cityRepo(db).insert(furCity);
  const furBase = makeShelter({ id: randomUUID() as ShelterId, displayName: `Smoke ${tag} H` });
  const furAddress = { ...furBase.exactAddress, cityId: furCity.id };
  await insertShelterFromScript(
    db,
    {
      ...furBase,
      exactAddress: furAddress,
      publicLocation: publicLocationOf(furBase.id, furAddress, policy),
    },
    by,
  );
  const furDog = makeAnimal({
    id: randomUUID() as never,
    shelterId: furBase.id,
    species: "dog",
    coatLength: null,
  });
  await animalRepo(db).insert(furDog, furCity.id);
  const furEdit = async (coatLength: "long" | null, at: Date) => {
    const read = await kabinetAnimals.findWithCity(furDog.id);
    if (!read) return { kind: "conflict" as const };
    return kabinetAnimals.writeEditIf(
      { ...read.animal, coatLength, lastUpdatedAt: at, version: read.animal.version + 1 },
      read.cityId,
      read.animal.version,
      {
        id: randomUUID(),
        entry: {
          kind: "animal_edited",
          at,
          actor: smokeActor,
          animalId: furDog.id,
          animalName: read.animal.name,
          fields: ["coatLength"],
        },
      },
    );
  };
  const furSet = await furEdit("long", later(27000));
  const furAfterSet = (await kabinetAnimals.findWithCity(furDog.id))?.animal.coatLength;
  const furCleared = await furEdit(null, later(28000));
  const furAfterClear = (await kabinetAnimals.findWithCity(furDog.id))?.animal.coatLength;
  check(
    "fur set «long» then cleared through the kabinet edit write, read back over this driver",
    furSet.kind === "ok" &&
      furAfterSet === "long" &&
      furCleared.kind === "ok" &&
      furAfterClear === null,
    `set ${furSet.kind} → ${furAfterSet ?? "null"}; cleared ${furCleared.kind} → ${furAfterClear === undefined ? "missing" : (furAfterClear ?? "null")}`,
  );

  // 40. the shelter page's list (DR1 S5, DR1-D4): `gallery.list` scoped to one
  // shelter, over this driver. Reads only: step 38's shelter and its three
  // cards are the known shelter, and a fresh UUID is the unknown one. No
  // filters, so the only thing narrowing the list is the scope; the registry
  // the branch copied holds other shelters' animals besides.
  const scopedList = (shelterId: ShelterId) =>
    galleryRepo(db).list({
      filters: NO_FILTERS,
      scope: { kind: "shelter", shelterId },
      sort: "freshest",
      page: 1,
      pageSize: 24,
      now: NOW,
    });
  const ownList = await scopedList(relaxBase.id);
  const ownOnly = ownList.items.every((a) => a.shelterId === relaxBase.id);
  const unknownList = await scopedList(randomUUID() as ShelterId);
  check(
    "gallery list scoped to one shelter: only its own animals, none for an unknown id",
    ownList.items.length === 3 &&
      ownList.totalMatching === 3 &&
      ownList.totalShelters === 1 &&
      ownOnly &&
      unknownList.items.length === 0 &&
      unknownList.totalMatching === 0,
    `known: ${ownList.items.length} item(s), total ${ownList.totalMatching}, shelters ${ownList.totalShelters}, all its own ${ownOnly}; unknown: ${unknownList.items.length} item(s), total ${unknownList.totalMatching}`,
  );

  // 41. S8's `animals.cardsByIds`: `animalRepo.findByIds` (a plain
  // `inArray` select, no new migration) over this driver. A mix of two real
  // ids from this run (`atShelter`, `fostered`, both inserted in step 2) and
  // one random, never-inserted id returns exactly the two real rows - the
  // unknown id is silently absent, not an error, which is what the handler's
  // order-preserving map over `input.animalIds` relies on. An empty array
  // short-circuits in TS before any query, so it has no real-Neon case to add
  // here; it's already covered locally (`animals-cards-by-ids.test.ts`).
  const foundIds = (
    await animalRepo(db).findByIds([atShelter.id, fostered.id, randomUUID() as never])
  )
    .map((a) => a.id)
    .sort();
  check(
    "animals.cardsByIds: findByIds (inArray select) over neon-http",
    foundIds.length === 2 && foundIds.includes(atShelter.id) && foundIds.includes(fostered.id),
    `${foundIds.length} row(s) found for 2 real + 1 unknown id`,
  );

  // 42. GDPR photo retention (PR #200, Tier 1 review, blocker 4): the raw
  // SQL `r2-cleanup-repo.ts` never had a real-Neon run before this.
  // `referencedStorageKeys`'s `jsonb_array_elements` SELECT and
  // `afterDeleted`'s `jsonb_set` UPDATE (with its scalar-OR'd WHERE, never
  // an array binding) both go through `executeRows`, the one place that
  // already handles postgres-js/neon-http's differing raw-result shapes -
  // but the statements themselves, with their real jsonb operators, had
  // only ever executed locally until this step.
  const r2StorageKey = `smoke/${tag}/photo-1`;
  const r2Animal = makeAnimal({
    id: randomUUID() as never,
    shelterId: shelter.id,
    photos: [{ storageKey: r2StorageKey, width: 800, height: 1000, alt: null }] as never,
  });
  await animalRepo(db).insert(r2Animal, city.id);
  const r2Referenced = await referencedStorageKeys(db);
  check(
    "r2-cleanup-repo: referencedStorageKeys (jsonb_array_elements SELECT) over neon-http",
    r2Referenced.has(r2StorageKey),
    `${r2Referenced.size} referenced storage key(s), expected one to include this run's`,
  );
  const r2ObjectKeys = await referencedObjectKeys(db);
  const r2CardKey = variantObjectKey(r2StorageKey, "card");
  check(
    "r2-cleanup-repo: referencedObjectKeys derives the card variant",
    r2ObjectKeys.has(r2CardKey),
    `${r2ObjectKeys.size} referenced object key(s)`,
  );

  const r2OrphanKey = variantObjectKey(`smoke/${tag}/orphan`, "card");
  const scanResult = await recordScan(db, [r2CardKey, r2OrphanKey], NOW);
  check(
    "r2-cleanup-repo: recordScan tracks the orphan, leaves the referenced key alone",
    scanResult.newlyTracked === 1,
    `newlyTracked ${scanResult.newlyTracked}, expected 1`,
  );
  const stillDue = await stillUnreferenced(db, [r2CardKey, r2OrphanKey]);
  check(
    "r2-cleanup-repo: stillUnreferenced re-check excludes the referenced key",
    stillDue.length === 1 && stillDue[0] === r2OrphanKey,
    `${JSON.stringify(stillDue)}`,
  );

  const r2Adopter = makeAdopter({ id: randomUUID() as never });
  await adopterRepo(db).insert(r2Adopter);
  const r2Reveal = makeReveal({
    id: randomUUID() as never,
    adopterId: r2Adopter.id,
    animalId: r2Animal.id,
    shelterId: shelter.id,
    animalSnapshot: {
      name: "Smoke",
      primaryPhoto: { storageKey: r2StorageKey, width: 800, height: 1000, alt: null },
    },
  });
  await revealRepo(db).insert(r2Reveal);
  const deleteResult = await afterDeleted(db, [r2CardKey]);
  check(
    "r2-cleanup-repo: afterDeleted nulls the reveal snapshot's primaryPhoto (jsonb_set UPDATE) over neon-http",
    deleteResult.snapshotsNulled === 1,
    `snapshotsNulled ${deleteResult.snapshotsNulled}, expected 1`,
  );
  const [r2RevealRow] = await db.select().from(reveals).where(eq(reveals.id, r2Reveal.id));
  const r2SnapshotAfter = r2RevealRow?.animalSnapshot as { primaryPhoto: unknown } | undefined;
  check(
    "r2-cleanup-repo: the null is real, read back from Neon, not just the statement's own count",
    r2SnapshotAfter?.primaryPhoto === null,
    `primaryPhoto read back as ${JSON.stringify(r2SnapshotAfter?.primaryPhoto)}`,
  );

  // 42b. Pet card PR 4 widened referencedStorageKeys's UNION to also read
  // shelters.logo - that UNION, and the SHELTER_LOGO_PREFIX branch in
  // referencedObjectKeys, had only ever run against local Postgres before
  // this step (Tier 1 review, PR #220, note 2).
  const r2LogoStorageKey = `shelters/${tag}/logo/1`;
  const r2LogoBase = makeShelter({ id: randomUUID() as ShelterId, displayName: `Smoke ${tag} R2` });
  const r2LogoShelter = {
    ...r2LogoBase,
    exactAddress: { ...r2LogoBase.exactAddress, cityId: city.id },
    publicLocation: publicLocationOf(
      r2LogoBase.id,
      { ...r2LogoBase.exactAddress, cityId: city.id },
      policy,
    ),
    logo: { storageKey: r2LogoStorageKey, width: 160, height: 160 },
  };
  await insertShelterFromScript(db, r2LogoShelter, by);
  const r2LogoReferenced = await referencedStorageKeys(db);
  check(
    "r2-cleanup-repo: referencedStorageKeys's UNION also reads shelters.logo over neon-http",
    r2LogoReferenced.has(r2LogoStorageKey),
    `${r2LogoReferenced.size} referenced storage key(s), expected one to include this shelter's logo`,
  );
  const r2LogoObjectKeys = await referencedObjectKeys(db);
  const r2LogoSmallKey = variantObjectKey(r2LogoStorageKey, "small");
  check(
    "r2-cleanup-repo: referencedObjectKeys derives the logo's small variant, not the photo variants",
    r2LogoObjectKeys.has(r2LogoSmallKey) &&
      !r2LogoObjectKeys.has(variantObjectKey(r2LogoStorageKey, "card")),
    `${r2LogoObjectKeys.size} referenced object key(s)`,
  );

  // 43. The pet card's fields (migration 0017). `temperament_traits` is the
  // schema's first array column: Drizzle sends it as an array literal and
  // parses whatever the driver hands back, which postgres-js and neon-http
  // shape differently, and only a run over this driver shows the round trip
  // holds. Written and cleared through the kabinet edit's own write
  // (`writeEditIf`, as `animalsUpdate` calls it) and read back through
  // `findWithCity`: three presets in order with a custom entry last, a custom
  // colour and a medical note, each with its English; then an empty
  // temperament, a preset colour and no note.
  const cardAnimal = makeAnimal({ id: randomUUID() as never, shelterId: shelter.id });
  await animalRepo(db).insert(cardAnimal, city.id);
  const cardFields = {
    temperament: [
      { kind: "preset", trait: "shy" },
      { kind: "preset", trait: "good_with_cats" },
      { kind: "preset", trait: "calm" },
      {
        kind: "custom",
        text: { uk: "Боїться грози", en: { text: "Afraid of thunderstorms", provenance: "human" } },
      },
    ],
    colour: {
      kind: "custom",
      text: { uk: "Димчасте", en: { text: "Smoky", provenance: "human" } },
    },
    medicalNotes: {
      uk: "Потребує гіпоалергенного корму.",
      en: { text: "Needs hypoallergenic food.", provenance: "human" },
    },
  } satisfies Pick<Animal, "temperament" | "colour" | "medicalNotes">;
  const cardCleared = {
    temperament: [],
    colour: { kind: "preset", colour: "tabby" },
    medicalNotes: null,
  } satisfies Pick<Animal, "temperament" | "colour" | "medicalNotes">;
  const cardEdit = async (
    fields: Pick<Animal, "temperament" | "colour" | "medicalNotes">,
    at: Date,
  ) => {
    const read = await kabinetAnimals.findWithCity(cardAnimal.id);
    if (!read) return { kind: "conflict" as const };
    return kabinetAnimals.writeEditIf(
      { ...read.animal, ...fields, lastUpdatedAt: at, version: read.animal.version + 1 },
      read.cityId,
      read.animal.version,
      {
        id: randomUUID(),
        entry: {
          kind: "animal_edited",
          at,
          actor: smokeActor,
          animalId: cardAnimal.id,
          animalName: read.animal.name,
          fields: ["colour", "temperament", "medicalNotes"],
        },
      },
    );
  };
  const cardFieldsOf = async () => {
    const read = (await kabinetAnimals.findWithCity(cardAnimal.id))?.animal;
    return read === undefined
      ? null
      : { temperament: read.temperament, colour: read.colour, medicalNotes: read.medicalNotes };
  };
  const cardSet = await cardEdit(cardFields, later(29000));
  const cardAfterSet = await cardFieldsOf();
  const cardClear = await cardEdit(cardCleared, later(30000));
  const cardAfterClear = await cardFieldsOf();
  check(
    "pet card fields: temperament_traits (text[]), a custom colour and a medical note set then cleared through writeEditIf, read back over this driver",
    cardSet.kind === "ok" &&
      isDeepStrictEqual(cardAfterSet, cardFields) &&
      cardClear.kind === "ok" &&
      isDeepStrictEqual(cardAfterClear, cardCleared),
    `set ${cardSet.kind} → ${JSON.stringify(cardAfterSet)}; cleared ${cardClear.kind} → ${JSON.stringify(cardAfterClear)}`,
  );

  // 44. Corpus for the sex filter check below (44b). Originally built for
  // the temperament and colour filters too (pet card PR 1b) - removed with
  // those filters by the gallery filter restructure - but the same four
  // animals (two with temperament/colour presets, one with nothing
  // recorded, one with only the shelter's own words) still exercise the sex
  // filter's "unknown" case meaningfully, so the corpus stays as built. A
  // city, a verified shelter and four published animals of this run's own.
  const pcCity = makeCity({ id: randomUUID() as never });
  await cityRepo(db).insert(pcCity);
  const pcBase = makeShelter({ id: randomUUID() as ShelterId, displayName: `Smoke ${tag} T` });
  const pcAddress = { ...pcBase.exactAddress, cityId: pcCity.id };
  await insertShelterFromScript(
    db,
    {
      ...pcBase,
      exactAddress: pcAddress,
      publicLocation: publicLocationOf(pcBase.id, pcAddress, policy),
    },
    by,
  );
  const pcAnimal = (fields: Pick<Animal, "temperament" | "colour" | "sex">) =>
    makeAnimal({ id: randomUUID() as never, shelterId: pcBase.id, ...fields });
  const pcShyCat = pcAnimal({
    temperament: [
      { kind: "preset", trait: "shy" },
      { kind: "preset", trait: "good_with_cats" },
    ],
    colour: { kind: "preset", colour: "cream" },
    sex: "male",
  });
  const pcPlayful = pcAnimal({
    temperament: [{ kind: "preset", trait: "playful" }],
    colour: { kind: "preset", colour: "black" },
    sex: "female",
  });
  const pcBlank = pcAnimal({ temperament: [], colour: null, sex: "unknown" });
  const pcOwnWords = pcAnimal({
    temperament: [{ kind: "custom", text: { uk: "Любить сніг", en: null } }],
    colour: { kind: "custom", text: { uk: "Димчасте", en: null } },
    sex: "unknown",
  });
  for (const animal of [pcShyCat, pcPlayful, pcBlank, pcOwnWords]) {
    await animalRepo(db).insert(animal, pcCity.id);
  }
  const pcName = new Map([
    [pcShyCat.id, "shyCat"],
    [pcPlayful.id, "playful"],
    [pcBlank.id, "blank"],
    [pcOwnWords.id, "ownWords"],
  ]);
  const pcFound = async (only: Partial<FeedFilters>) => {
    const filters: FeedFilters = {
      ...NO_FILTERS,
      cities: { kind: "oneOf", values: [pcCity.id] },
      ...only,
    };
    const names = (items: readonly { id: string }[]) =>
      items
        .map((a) => pcName.get(a.id as never) ?? "other")
        .sort()
        .join(",");
    const gallery = await galleryRepo(db).list({
      filters,
      scope: EVERYONE_SCOPE,
      sort: "freshest",
      page: 1,
      pageSize: 24,
      now: NOW,
    });
    const deck = await feedRepo(db).list({
      filters,
      cursor: null,
      limit: 20,
      adopterId: null,
      now: NOW,
      seenSetPolicy: DEFAULT_SEEN_SET_POLICY,
    });
    return { gallery: names(gallery.items), deck: names(deck.items) };
  };
  const bothAre = (found: { gallery: string; deck: string }, expected: string) =>
    found.gallery === expected && found.deck === expected;

  // 44b. The sex filter, over the same corpus. "unknown" is a real, explicit
  // value here - not an absence - so it is a normal `IN` member, unlike the
  // "custom" and "unrecorded" variants the corpus's own temperament/colour
  // fields carry (step 44's fixtures, no longer filterable, kept only as
  // data that still exercises this filter's "unknown" case meaningfully).
  const males = await pcFound({ sexes: { kind: "oneOf", values: ["male"] } });
  const females = await pcFound({ sexes: { kind: "oneOf", values: ["female"] } });
  const unknownSex = await pcFound({ sexes: { kind: "oneOf", values: ["unknown"] } });
  check(
    "sex filter (IN over sex) in the gallery and the deck, including the explicit 'unknown' value",
    bothAre(males, "shyCat") &&
      bothAre(females, "playful") &&
      bothAre(unknownSex, "blank,ownWords"),
    `male: ${JSON.stringify(males)}; female: ${JSON.stringify(females)}; unknown: ${JSON.stringify(unknownSex)}`,
  );

  // 44c. The filter selectors' counts (`gallery.facetCounts`) over the same
  // corpus: one grouped statement of `COUNT(*) FILTER` columns, nested in a
  // typed select and summed over the city groups - the shape this driver has
  // to map exactly as postgres-js does. With «male» chosen in this city the
  // sex counts ignore that choice (1 male, 1 female, 2 unrecorded); the city
  // count applies it (1); sizes and ages, with both applied, sum to 1.
  const pcFacets = await galleryRepo(db).facetCounts({
    filters: {
      ...NO_FILTERS,
      cities: { kind: "oneOf", values: [pcCity.id] },
      sexes: { kind: "oneOf", values: ["male"] },
    },
    now: NOW,
  });
  const sumOf = (counts: Readonly<Record<string, number>>) =>
    Object.values(counts).reduce((sum, n) => sum + n, 0);
  const pcCityFacet = pcFacets.cities.find((entry) => entry.cityId === pcCity.id)?.count;
  check(
    "gallery facet counts (grouped COUNT FILTER columns, own selection ignored, the rest applied)",
    isDeepStrictEqual(pcFacets.sexes, { male: 1, female: 1, unknown: 2 }) &&
      pcCityFacet === 1 &&
      sumOf(pcFacets.sizes) === 1 &&
      sumOf(pcFacets.ages) === 1,
    `sexes ${JSON.stringify(pcFacets.sexes)}, this city ${pcCityFacet ?? "absent"}, sizes ${JSON.stringify(pcFacets.sizes)}, ages ${JSON.stringify(pcFacets.ages)}`,
  );

  // Pet card PR 2: animals.neighbours. Two of the three cards share one
  // confirmedAt - the scalar-subquery seek (gallery-repo.ts's
  // `seekCondition`) only reads correctly on neon-http if its timestamptz
  // comparison and its `id` tiebreak both behave the same as on postgres-js.
  const nbCity = makeCity({ id: randomUUID() as never });
  await cityRepo(db).insert(nbCity);
  const nbBase = makeShelter({ id: randomUUID() as ShelterId, displayName: "Smoke neighbours" });
  const nbAddress = { ...nbBase.exactAddress, cityId: nbCity.id };
  const nbShelter = {
    ...nbBase,
    exactAddress: nbAddress,
    publicLocation: publicLocationOf(nbBase.id, nbAddress, policy),
  };
  await insertShelterFromScript(db, nbShelter, by);
  const nbListing = (confirmedAt: Date, publishedAt: Date): AnimalListingState => ({
    kind: "published",
    publishedAt,
    confirmedAt,
    undoable: null,
  });
  const nbTied = new Date(NOW.getTime() - 1 * 86_400_000);
  const nbOlder = new Date(NOW.getTime() - 2 * 86_400_000);
  const nbA = makeAnimal({
    id: randomUUID() as never,
    shelterId: nbShelter.id,
    name: "NeighbourA",
    listing: nbListing(nbTied, new Date(NOW.getTime() - 30 * 86_400_000)),
  });
  const nbB = makeAnimal({
    id: randomUUID() as never,
    shelterId: nbShelter.id,
    name: "NeighbourB",
    listing: nbListing(nbTied, new Date(NOW.getTime() - 29 * 86_400_000)),
  });
  const nbC = makeAnimal({
    id: randomUUID() as never,
    shelterId: nbShelter.id,
    name: "NeighbourC",
    listing: nbListing(nbOlder, new Date(NOW.getTime() - 31 * 86_400_000)),
  });
  for (const animal of [nbA, nbB, nbC]) await animalRepo(db).insert(animal, nbCity.id);

  const nbFilters: FeedFilters = { ...NO_FILTERS, cities: { kind: "oneOf", values: [nbCity.id] } };
  const nbTiedPair = [nbA, nbB].sort((a, b) => (a.id < b.id ? -1 : 1));
  const nbExpectedFreshest = [...nbTiedPair, nbC].map((a) => a.id);

  const nbList = await galleryRepo(db).list({
    filters: nbFilters,
    scope: EVERYONE_SCOPE,
    sort: "freshest",
    page: 1,
    pageSize: 10,
    now: NOW,
  });
  const nbListOrder = nbList.items.map((a) => a.id);

  const nbMiddleId = nbExpectedFreshest[1] as string;
  const nbNeighbours = await galleryRepo(db).neighbours({
    animalId: nbMiddleId as never,
    filters: nbFilters,
    scope: EVERYONE_SCOPE,
    sort: "freshest",
    now: NOW,
  });
  check(
    "animals.neighbours: list() order (incl. a tied pair broken by id) and neighbours() walk agree",
    isDeepStrictEqual(nbListOrder, nbExpectedFreshest) &&
      nbNeighbours.prev?.id === nbExpectedFreshest[0] &&
      nbNeighbours.next?.id === nbExpectedFreshest[2],
    `list: ${JSON.stringify(nbListOrder)}; expected: ${JSON.stringify(nbExpectedFreshest)}; neighbours of middle: ${JSON.stringify(nbNeighbours)}`,
  );

  const nbEndNeighbours = await galleryRepo(db).neighbours({
    animalId: nbExpectedFreshest[2] as never,
    filters: nbFilters,
    scope: EVERYONE_SCOPE,
    sort: "freshest",
    now: NOW,
  });
  const nbUnknownNeighbours = await galleryRepo(db).neighbours({
    animalId: randomUUID() as never,
    filters: nbFilters,
    scope: EVERYONE_SCOPE,
    sort: "freshest",
    now: NOW,
  });
  check(
    "animals.neighbours: the last row's next is null, and an unknown id answers null at both ends",
    nbEndNeighbours.next === null &&
      nbUnknownNeighbours.prev === null &&
      nbUnknownNeighbours.next === null,
    `end.next: ${JSON.stringify(nbEndNeighbours.next)}; unknown: ${JSON.stringify(nbUnknownNeighbours)}`,
  );

  // 46-48: S3 (audit F6, F8). Last, because 46 and 47 delete: a lapsed adopter session or an
  // orphaned adopter an earlier step made (or the branch copied) goes too, which nothing after
  // them reads. On a disposable branch the deletes run to 0 in batches, then this run's own
  // rows are checked by id. (`DAY` is K2's, above.)
  const drain = async (run: () => Promise<number>) => {
    let total = 0;
    for (let i = 0; i < 100; i++) {
      const n = await run();
      total += n;
      if (n === 0) break;
    }
    return total;
  };

  // 46. the adopter-session clean-up's batched DELETE (`sessionRepo.deleteLapsed`): `IN (SELECT
  // … LIMIT)` and both limits strictly, through this driver's timestamptz comparison. Exactly at
  // a limit stays (`validateSession` still accepts it).
  const s46Adopter = makeAdopter({ id: randomUUID() as never, createdAt: later(-60 * DAY) });
  await adopterRepo(db).insert(s46Adopter);
  const s46 = {
    pastAbsolute: [later(-30 * DAY - 1), later(-60_000)],
    atAbsolute: [later(-30 * DAY), later(-60_000)],
    pastIdle: [later(-10 * DAY), later(-7 * DAY - 1)],
    atIdle: [later(-10 * DAY), later(-7 * DAY)],
    live: [later(-DAY), later(-60_000)],
  } as const;
  const s46Hash = (label: string) => `${tag}${label}`.padEnd(64, "0").slice(0, 64);
  for (const [label, [createdAt, lastSeenAt]] of Object.entries(s46)) {
    await sessionRepo(db).insert({
      tokenHash: s46Hash(label),
      adopterId: s46Adopter.id,
      createdAt,
      lastSeenAt,
    });
  }
  const s46Deleted = await drain(() => sessionRepo(db).deleteLapsed(NOW));
  const s46Left = new Set<string>();
  for (const label of Object.keys(s46)) {
    if ((await sessionRepo(db).findByHash(s46Hash(label))) !== null) s46Left.add(label);
  }
  check(
    "adopter-session clean-up: past either limit deleted, exactly at a limit and live kept",
    s46Deleted >= 2 && [...s46Left].sort().join(",") === "atAbsolute,atIdle,live",
    `deleted ${s46Deleted} (at least this run's 2); kept of this run's: ${[...s46Left].sort().join(",")}`,
  );

  // 47. the orphaned-adopter DELETE (`adopterRepo.deleteOrphaned`): three correlated NOT EXISTS
  // in a batched `IN (SELECT … LIMIT)`. An old adopter with nothing goes; one with a swipe, one
  // with a reveal and one exactly at the minimum age stay.
  const s47Old = later(-ORPHAN_ADOPTER_MIN_AGE_MS - 1);
  const s47 = {
    orphan: makeAdopter({ id: randomUUID() as never, createdAt: s47Old }),
    swiped: makeAdopter({ id: randomUUID() as never, createdAt: s47Old }),
    revealed: makeAdopter({ id: randomUUID() as never, createdAt: s47Old }),
    young: makeAdopter({ id: randomUUID() as never, createdAt: later(-ORPHAN_ADOPTER_MIN_AGE_MS) }),
  };
  for (const adopter of Object.values(s47)) await adopterRepo(db).insert(adopter);
  const s47City = makeCity({ id: randomUUID() as never });
  await cityRepo(db).insert(s47City);
  const s47Shelter = makeShelter({
    id: randomUUID() as ShelterId,
    displayName: `Smoke ${tag} S3`,
    exactAddress: { ...makeShelter().exactAddress, cityId: s47City.id },
  });
  await shelterRepo(db).insert(s47Shelter);
  const s47Animal = makeAnimal({ id: randomUUID() as never, shelterId: s47Shelter.id });
  await animalRepo(db).insert(s47Animal, s47City.id);
  await swipeRepo(db).record(makeSwipe({ adopterId: s47.swiped.id, animalId: s47Animal.id }));
  await revealRepo(db).insert(
    makeReveal({
      id: randomUUID() as never,
      adopterId: s47.revealed.id,
      animalId: s47Animal.id,
      shelterId: s47Shelter.id,
    }),
  );
  const s47Deleted = await drain(() => adopterRepo(db).deleteOrphaned(NOW));
  const s47Left: string[] = [];
  for (const [label, adopter] of Object.entries(s47)) {
    if ((await adopterRepo(db).findById(adopter.id)) !== null) s47Left.push(label);
  }
  check(
    "orphaned-adopter clean-up: nothing left goes; a swipe, a reveal or too young stays",
    s47Deleted >= 1 && s47Left.sort().join(",") === "revealed,swiped,young",
    `deleted ${s47Deleted} (at least this run's 1); kept of this run's: ${s47Left.sort().join(",")}`,
  );

  // 48. the reveal budget's atomic write (`revealRepo.insertWithinShelterBudget`): on this
  // driver a batch, one HTTP transaction, READ COMMITTED as `createDatabase` sets it, the
  // adopter's row locked by `FOR NO KEY UPDATE`, then an INSERT … SELECT … WHERE guard.
  const [s48Isolation] = await inOneTransaction(db, (tx) => [
    tx
      .select({ level: sql<string>`current_setting('transaction_isolation')` })
      .from(sql`(SELECT 1) AS one`),
  ]);
  check(
    "inOneTransaction runs READ COMMITTED (each statement a fresh snapshot)",
    s48Isolation[0]?.level === "read committed",
    `transaction_isolation: ${s48Isolation[0]?.level ?? "none"}`,
  );

  const s48City = makeCity({ id: randomUUID() as never });
  await cityRepo(db).insert(s48City);
  const s48Spots: { shelterId: ShelterId; animals: AnimalId[] }[] = [];
  for (let i = 0; i < 31; i++) {
    const shelter = makeShelter({
      id: randomUUID() as ShelterId,
      exactAddress: { ...makeShelter().exactAddress, cityId: s48City.id },
    });
    await shelterRepo(db).insert(shelter);
    const animals: AnimalId[] = [];
    for (let a = 0; a < (i === 29 ? 2 : 1); a++) {
      const animal = makeAnimal({ id: randomUUID() as never, shelterId: shelter.id });
      await animalRepo(db).insert(animal, s48City.id);
      animals.push(animal.id);
    }
    s48Spots.push({ shelterId: shelter.id, animals });
  }
  const s48Budget = { since: later(-DAY), maxShelters: 30 };
  const s48RevealOf = (adopterId: AdopterId, spot: number, animal = 0) =>
    makeReveal({
      id: randomUUID() as never,
      adopterId,
      shelterId: s48Spots[spot]?.shelterId as ShelterId,
      animalId: s48Spots[spot]?.animals[animal] as AnimalId,
      revealedAt: NOW,
    });
  const s48AdopterAt29 = async () => {
    const adopter = makeAdopter({ id: randomUUID() as never, createdAt: NOW });
    await adopterRepo(db).insert(adopter);
    for (let i = 0; i < 29; i++) await revealRepo(db).insert(s48RevealOf(adopter.id, i));
    return adopter.id;
  };
  const s48Distinct = async (adopterId: AdopterId) => {
    const [row] = await db
      .select({ n: countDistinct(reveals.shelterId) })
      .from(reveals)
      .where(eq(reveals.adopterId, adopterId));
    return row?.n ?? 0;
  };

  const s48One = await s48AdopterAt29();
  const write = async (reveal: ContactReveal) =>
    (await revealRepo(db).insertWithinShelterBudget(reveal, s48Budget)).kind;
  const s48Sequence = [
    await write(s48RevealOf(s48One, 29)),
    await write(s48RevealOf(s48One, 30)),
    await write(s48RevealOf(s48One, 29, 1)),
    await write(s48RevealOf(s48One, 29, 0)),
  ];
  check(
    "reveal budget, one at a time: 30th inserted, 31st refused, free re-reveal, no duplicate",
    isDeepStrictEqual(s48Sequence, [
      "inserted",
      "over_budget",
      "inserted",
      "animal_already_revealed",
    ]) && (await s48Distinct(s48One)) === 30,
    `${JSON.stringify(s48Sequence)}; distinct shelters ${await s48Distinct(s48One)}`,
  );

  // Two at once at 29, by another adopter: one HTTP request each, which may or may not overlap
  // on the server (not a forced interleaving; that is the local suite's job). Either way exactly
  // one may write.
  const s48Two = await s48AdopterAt29();
  const s48Pair = await Promise.all([
    write(s48RevealOf(s48Two, 29)),
    write(s48RevealOf(s48Two, 30)),
  ]);
  check(
    "reveal budget, two new shelters at once at 29: exactly one written",
    [...s48Pair].sort().join(",") === "inserted,over_budget" && (await s48Distinct(s48Two)) === 30,
    `${JSON.stringify(s48Pair)}; distinct shelters ${await s48Distinct(s48Two)}`,
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
  const database = createDatabase(url);
  const outcomes = [...(await runSmoke(database)), ...(await runGeographySmoke(database))];
  for (const o of outcomes) console.log(`${o.ok ? "PASS" : "FAIL"}  ${o.name}: ${o.detail}`);
  const failed = outcomes.filter((o) => !o.ok).length;
  console.log(`${outcomes.length - failed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
