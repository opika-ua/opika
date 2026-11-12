import { randomUUID } from "node:crypto";
import {
  type AnimalListingState,
  type CityId,
  confirmationReminderCutoff,
  earlyListingCutoff,
  earlyListingOf,
  earlyListingRemaining,
  type ModeratorId,
  type Shelter,
  type ShelterVerification,
} from "@opika/domain";
import { eq, inArray } from "drizzle-orm";
import type { Database } from "../src/client";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { kabinetInvitationRepo } from "../src/repos/kabinet-invitation-repo";
import { kabinetShelterRepo } from "../src/repos/kabinet-shelter-repo";
import { notificationRecipientsRepo } from "../src/repos/notification-recipients-repo";
import { MAX_SEND_ATTEMPTS, notificationSendsRepo } from "../src/repos/notification-sends-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { animals } from "../src/schema/animals";
import { authMember, authOrganization, authUser, superAdmins } from "../src/schema/auth";
import { cities } from "../src/schema/cities";
import { notificationSends } from "../src/schema/notification-sends";
import { shelterHistory } from "../src/schema/shelter-history";
import { shelters } from "../src/schema/shelters";
import { makeAnimal, makeCity, makeShelter } from "../src/test-utils/index";

type Outcome = { name: string; ok: boolean; detail: string };

const DAY = 86_400_000;

/**
 * The reads behind notification emails (`notificationRecipientsRepo`) on Neon's driver, run with
 * fixtures: who counts as an operator, tenant isolation of a shelter's members, a user and a
 * history line by id, the early-listing candidates, and that nobody whose grant or membership is
 * gone is returned. Fixture rows are deleted in a `finally`, so a failed check leaves nothing
 * behind. Run on a fresh child branch, never production; checks look only at fixture ids and
 * addresses, so rows already on the branch do not matter.
 */
export async function runNotificationRecipientsSmoke(db: Database): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });
  const repo = notificationRecipientsRepo(db);
  const now = new Date();
  const tag = randomUUID();
  const email = (label: string) => `smoke-${tag}-${label}@example.invalid`;
  const evidence = { items: [], submittedAt: now };
  const moderator = randomUUID() as ModeratorId;
  const verificationOf = (status: string) =>
    (status === "pending"
      ? { status, submittedAt: now, evidence }
      : status === "under_review"
        ? { status, startedAt: now, reviewerId: moderator, evidence }
        : status === "rejected"
          ? {
              status,
              rejectedAt: now,
              rejectedBy: moderator,
              reason: { code: "insufficient_evidence", note: null },
              evidence,
            }
          : {
              status,
              verifiedAt: now,
              verifiedBy: moderator,
              evidence,
            }) as unknown as ShelterVerification;

  const city = makeCity({ id: randomUUID() as CityId, slug: `smoke-${randomUUID()}` as never });
  const userIds: string[] = [];
  const shelterIds: string[] = [];
  const organizationIds: string[] = [];
  const historyId = `smoke-${tag}-history`;
  const sendKeys: string[] = [];

  const user = async (label: string) => {
    const id = randomUUID();
    userIds.push(id);
    await db.insert(authUser).values({
      id,
      name: "Смоук",
      email: email(label),
      emailVerified: false,
      image: null,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  };
  const shelter = async (label: string, overrides: Partial<Shelter> = {}) => {
    const row = makeShelter({
      displayName: `Смоук сповіщення ${label} ${tag.slice(0, 6)}`,
      publicLocation: {
        cityId: city.id,
        district: null,
        precision: "fuzzed_address",
        approximate: { center: { lat: 50.4, lng: 30.5 }, precisionMetres: 1000 } as never,
      },
      ...overrides,
    } as never);
    shelterIds.push(row.id);
    await shelterRepo(db).insert(row);
    return row;
  };
  const member = async (shelterId: string, userId: string) => {
    const organizationId = await kabinetInvitationRepo(db).ensureOrganization(
      shelterId as never,
      { organizationId: randomUUID() },
      now,
    );
    if (!organizationIds.includes(organizationId)) organizationIds.push(organizationId);
    const id = randomUUID();
    await db
      .insert(authMember)
      .values({ id, organizationId, userId, role: "admin", createdAt: now });
    return id;
  };
  const addressesOf = (rows: { email: string }[]) => rows.map((row) => row.email);
  const ours = (addresses: string[]) => addresses.filter((a) => a.includes(tag)).sort();

  try {
    await cityRepo(db).insertMissing([city]);

    const active = await user("operator-active");
    const revoked = await user("operator-revoked");
    const grants = [
      { id: randomUUID(), userId: active, grantedAt: now, revokedAt: null },
      { id: randomUUID(), userId: revoked, grantedAt: now, revokedAt: now },
    ];
    await db.insert(superAdmins).values(grants);
    const operators = ours(addressesOf(await repo.operators()));
    check(
      "notify: operators returns the active grant's address and not the revoked one's",
      operators.length === 1 && operators[0] === email("operator-active"),
      `fixture addresses returned: ${operators.length}`,
    );

    const shelterA = await shelter("A");
    const shelterB = await shelter("B");
    const memberA = await user("member-a");
    const memberB = await user("member-b");
    const memberARow = await member(shelterA.id, memberA);
    await member(shelterB.id, memberB);
    const adminsA = await repo.shelterAdmins(shelterA.id);
    const adminsB = await repo.shelterAdmins(shelterB.id);
    check(
      "notify: shelterAdmins for shelter A returns only A's member, and B's only B's",
      adminsA.length === 1 &&
        adminsA[0]?.userId === memberA &&
        adminsA[0]?.email === email("member-a") &&
        adminsB.length === 1 &&
        adminsB[0]?.userId === memberB,
      `A ${adminsA.length} member(s), B ${adminsB.length} member(s)`,
    );

    const found = await repo.userById(memberA);
    const unknown = await repo.userById(randomUUID());
    check(
      "notify: userById returns the address for a fixture user and null for an unknown id",
      found?.email === email("member-a") && found.userId === memberA && unknown === null,
      `found ${found?.email === email("member-a")}, unknown ${unknown}`,
    );

    const lineAt = new Date(now.getTime() - 1000);
    await db.insert(shelterHistory).values({
      id: historyId,
      shelterId: shelterA.id,
      kind: "early_listing_allowed",
      at: lineAt,
      entry: {
        kind: "early_listing_allowed",
        at: lineAt,
        moderatorId: moderator,
        period: 1,
        note: null,
      },
    });
    const line = await repo.historyEntry(historyId);
    const missing = await repo.historyEntry(`smoke-${tag}-missing`);
    check(
      "notify: historyEntry returns the fixture line with its shelter and a Date, and null for an unknown id",
      line?.shelterId === shelterA.id &&
        line.entry.kind === "early_listing_allowed" &&
        line.entry.at instanceof Date &&
        line.entry.at.getTime() === lineAt.getTime() &&
        missing === null,
      `shelter ${line?.shelterId === shelterA.id}, at ${line?.entry && "at" in line.entry ? line.entry.at.toISOString() : "none"}`,
    );

    const since = (days: number) => new Date(now.getTime() - days * DAY);
    const due = await shelter("due-53", {
      verification: verificationOf("pending"),
      earlyListingSince: since(53),
    });
    const far = await shelter("far-10", {
      verification: verificationOf("pending"),
      earlyListingSince: since(10),
    });
    const expired = await shelter("expired-61", {
      verification: verificationOf("pending"),
      earlyListingSince: since(61),
    });
    const verified = await shelter("verified-53", {
      verification: verificationOf("verified"),
      earlyListingSince: since(53),
    });
    const paused = await shelter("paused-53", {
      verification: verificationOf("paused"),
      earlyListingSince: since(53),
    });
    const suspended = await shelter("suspended-53", {
      verification: verificationOf("suspended"),
      earlyListingSince: since(53),
    });
    const candidates = await repo.earlyListingRunning(now);
    const ids = candidates.map((c) => c.id as string);
    const mine = [due.id, far.id].filter((id) => ids.includes(id));
    const reminding = candidates
      .filter((c) => c.id === due.id || c.id === far.id)
      .map(
        (c) =>
          [
            c.id,
            earlyListingRemaining(c.verification, earlyListingOf(c.earlyListingSince), now),
          ] as const,
      )
      .filter(([, remaining]) => remaining.kind === "running" && remaining.remind)
      .map(([id]) => id);
    check(
      "notify: earlyListingRunning returns the pending 53-day and 10-day shelters (53 first) but not the 61-day one or a verified, paused or suspended one; only the 53-day one is due (7 days or fewer)",
      mine.join() === [due.id, far.id].join() &&
        ![expired.id, verified.id, paused.id, suspended.id].some((id) => ids.includes(id)) &&
        reminding.join() === [due.id].join(),
      `fixture shelters returned ${mine.length} of 2, excluded ones returned ${[expired.id, verified.id, paused.id, suspended.id].filter((id) => ids.includes(id)).length}, due ${reminding.length}`,
    );

    const reviewing = await shelter("review-20", {
      verification: verificationOf("under_review"),
      earlyListingSince: since(20),
    });
    const rejected = await shelter("rejected-20", {
      verification: verificationOf("rejected"),
      earlyListingSince: since(20),
    });
    const atCutoff = await shelter("cutoff-60", {
      verification: verificationOf("pending"),
      earlyListingSince: earlyListingCutoff(now),
    });
    const justInside = await shelter("inside-60", {
      verification: verificationOf("pending"),
      earlyListingSince: new Date(earlyListingCutoff(now).getTime() + 1),
    });
    const second = await repo.earlyListingRunning(now);
    const secondIds = second.map((c) => c.id as string);
    check(
      "notify: earlyListingRunning returns an under_review shelter and not a rejected one",
      secondIds.includes(reviewing.id) && !secondIds.includes(rejected.id),
      `under_review returned ${secondIds.includes(reviewing.id)}, rejected returned ${secondIds.includes(rejected.id)}`,
    );
    check(
      "notify: earlyListingRunning excludes a shelter whose early_listing_since is exactly the 60-day cut-off and includes one a millisecond inside it",
      !secondIds.includes(atCutoff.id) && secondIds.includes(justInside.id),
      `at the cut-off returned ${secondIds.includes(atCutoff.id)}, 1 ms inside returned ${secondIds.includes(justInside.id)}`,
    );

    const noOrganization = await repo.shelterAdmins(due.id);
    check(
      "notify: shelterAdmins for a shelter with organization_id NULL returns an empty list",
      noOrganization.length === 0,
      `${noOrganization.length} member(s)`,
    );

    const dueRow = second.find((c) => c.id === due.id);
    check(
      "notify: a returned shelter has early_listing_since as a Date and its verification parsed (status, submittedAt as a Date)",
      dueRow !== undefined &&
        dueRow.earlyListingSince instanceof Date &&
        dueRow.earlyListingSince.getTime() === since(53).getTime() &&
        dueRow.verification.status === "pending" &&
        "submittedAt" in dueRow.verification &&
        dueRow.verification.submittedAt instanceof Date,
      `since ${dueRow?.earlyListingSince?.constructor.name}, status ${dueRow?.verification.status}`,
    );

    const decidedId = `smoke-${tag}-decided`;
    const decidedLink = {
      url: `https://send.monobank.ua/jar/smoke-${tag}`,
      provider: "monobank_jar",
    } as const;
    await db.insert(shelterHistory).values({
      id: decidedId,
      shelterId: shelterA.id,
      kind: "donation_decided",
      at: lineAt,
      entry: {
        kind: "donation_decided",
        at: lineAt,
        moderatorId: moderator,
        decision: "approved",
        link: decidedLink,
        previousLive: null,
      },
    });
    const decided = await repo.historyEntry(decidedId);
    check(
      "notify: a donation_decided history entry comes back from jsonb with its link object and a Date",
      decided?.entry.kind === "donation_decided" &&
        decided.entry.link.url === decidedLink.url &&
        decided.entry.link.provider === "monobank_jar" &&
        decided.entry.at instanceof Date,
      `kind ${decided?.entry.kind}, link ${decided?.entry.kind === "donation_decided" ? decided.entry.link.provider : "none"}`,
    );

    const sendsRepo = notificationSendsRepo(db);
    const countKey = (label: string) => `smoke:${tag}:count-${label}`;
    // Kinds unique to this run, so the counts are exact whatever else is on the branch.
    const kindA = `smoke-${tag}-a`;
    const kindB = `smoke-${tag}-b`;
    sendKeys.push(
      countKey("a-now"),
      countKey("a-old"),
      countKey("a-retry"),
      countKey("b-now"),
      countKey("close"),
    );
    const hourAgo = new Date(now.getTime() - 3_600_000);
    const base = { shelterId: null, recipientUserId: null };
    await sendsRepo.claim(now, { ...base, dedupKey: countKey("a-now"), kind: kindA });
    await sendsRepo.claim(new Date(now.getTime() - 3 * DAY), {
      ...base,
      dedupKey: countKey("a-old"),
      kind: kindA,
    });
    await sendsRepo.claim(now, { ...base, dedupKey: countKey("b-now"), kind: kindB });
    // A row from 3 days ago that failed and was retried today: one send today.
    await sendsRepo.claim(new Date(now.getTime() - 3 * DAY), {
      ...base,
      dedupKey: countKey("a-retry"),
      kind: kindA,
    });
    await sendsRepo.mark(now, countKey("a-retry"), "failed");
    await sendsRepo.reclaim(now, countKey("a-retry"));
    const countA = await sendsRepo.countSendsSince(hourAgo, [kindA]);
    const countB = await sendsRepo.countSendsSince(hourAgo, [kindB]);
    const countBoth = await sendsRepo.countSendsSince(hourAgo, [kindA, kindB]);
    const countNone = await sendsRepo.countSendsSince(hourAgo, []);
    check(
      "notify: countSendsSince counts exactly today's sends of the given kinds (A 2: one created today and one 3-day-old row retried today; B 1; both 3; none 0); a 3-day-old row not retried is not counted",
      countA === 2 && countB === 1 && countBoth === 3 && countNone === 0,
      `A ${countA}, B ${countB}, both ${countBoth}, none ${countNone}`,
    );

    await sendsRepo.claim(now, { ...base, dedupKey: countKey("close"), kind: kindA });
    const closed = await sendsRepo.closeFailed(now, countKey("close"));
    const closedAgain = await sendsRepo.closeFailed(now, countKey("close"));
    const [closedRow] = await db
      .select()
      .from(notificationSends)
      .where(eq(notificationSends.dedupKey, countKey("close")));
    const offered = (await sendsRepo.retryable(now)).some((r) => r.dedupKey === countKey("close"));
    const reclaimed = await sendsRepo.reclaim(now, countKey("close"));
    check(
      "notify: closeFailed ends a claimed row as failed with attempts at the cap in one statement; it is not retryable or reclaimable, and a second call changes nothing",
      closed &&
        !closedAgain &&
        closedRow?.status === "failed" &&
        closedRow.attempts === MAX_SEND_ATTEMPTS &&
        !offered &&
        !reclaimed,
      `closed ${closed}, again ${closedAgain}, ${closedRow?.status} attempts ${closedRow?.attempts}, offered ${offered}, reclaimed ${reclaimed}`,
    );

    const adminsBoth = await repo.shelterAdminsOf([shelterA.id, shelterB.id]);
    const adminsOnlyB = await repo.shelterAdminsOf([shelterB.id]);
    check(
      "notify: shelterAdminsOf returns each shelter's own member in one query (A's with A, B's with B), only B's when asked for B, and nothing for no ids",
      adminsBoth.length === 2 &&
        adminsBoth.some((row) => row.shelterId === shelterA.id && row.userId === memberA) &&
        adminsBoth.some((row) => row.shelterId === shelterB.id && row.userId === memberB) &&
        adminsOnlyB.length === 1 &&
        adminsOnlyB[0]?.userId === memberB &&
        (await repo.shelterAdminsOf([])).length === 0,
      `both ${adminsBoth.length}, only B ${adminsOnlyB.length}`,
    );

    const staleAt = confirmationReminderCutoff(now);
    const publishedAt = (confirmedAt: Date) =>
      ({ kind: "published", publishedAt: confirmedAt, confirmedAt, undoable: null }) as const;
    const card = async (s2: Shelter, listing: AnimalListingState) =>
      animalRepo(db).insert(makeAnimal({ shelterId: s2.id, listing } as never), city.id as never);
    const reminded = await shelter("fr-due", { verification: verificationOf("verified") });
    const remindedOff = await shelter("fr-off", {
      verification: verificationOf("verified"),
      freshnessReminderOffAt: now,
    });
    const remindedPending = await shelter("fr-pending", {
      verification: verificationOf("pending"),
    });
    const remindedPaused = await shelter("fr-paused", { verification: verificationOf("paused") });
    const remindedEarly = await shelter("fr-early", {
      verification: verificationOf("pending"),
      earlyListingSince: since(10),
    });
    // At the 14-day cut-off exactly: counted. One millisecond fresher, a draft and an adopted card: not.
    await card(reminded, publishedAt(staleAt));
    await card(reminded, publishedAt(new Date(staleAt.getTime() + 1)));
    await card(reminded, { kind: "draft" });
    await card(reminded, { kind: "adopted", adoptedAt: since(30) });
    for (const other of [remindedOff, remindedPending, remindedPaused, remindedEarly]) {
      await card(other, publishedAt(since(30)));
    }
    const dueRows = await repo.freshnessReminderDue(now);
    const dueIds = dueRows.map((row) => row.shelterId as string);
    const dueMine = dueRows.find((row) => row.shelterId === reminded.id);
    check(
      "notify: freshnessReminderDue counts a card at exactly the 14-day cut-off and not a fresher one, a draft or an adopted one; a switched-off, pending-without-early-listing and paused shelter are left out, a shelter in a running early-listing period is in",
      dueMine?.staleCards === 1 &&
        dueIds.includes(remindedEarly.id) &&
        ![remindedOff.id, remindedPending.id, remindedPaused.id].some((id) => dueIds.includes(id)),
      `counted ${dueMine?.staleCards}, early in ${dueIds.includes(remindedEarly.id)}`,
    );
    const narrowed = await repo.freshnessReminderDue(now, { onlyShelter: reminded.id });
    check(
      "notify: freshnessReminderDue narrowed to one shelter returns only that shelter",
      narrowed.length === 1 && narrowed[0]?.shelterId === reminded.id,
      `${narrowed.length} row(s)`,
    );

    const moderatorId = randomUUID() as ModeratorId;
    const toggle = (offAt: Date | null, expectedVersion: number, id: string) =>
      kabinetShelterRepo(db).applyAudited({
        shelterId: reminded.id,
        expectedVersion,
        change: { kind: "freshness_reminder", offAt },
        entry: { kind: "freshness_reminder_changed", at: now, moderatorId, off: offAt !== null },
        historyId: id,
        now,
      });
    const switchedOff = await toggle(now, 0, `smoke-${tag}-off`);
    const stale = await toggle(null, 0, `smoke-${tag}-stale`);
    const afterOff = await shelterRepo(db).findById(reminded.id);
    const droppedOut = (await repo.freshnessReminderDue(now)).every(
      (row) => row.shelterId !== reminded.id,
    );
    const switchedOn = await toggle(null, 1, `smoke-${tag}-on`);
    const afterOn = await shelterRepo(db).findById(reminded.id);
    const lines = (await kabinetShelterRepo(db).historyOf(reminded.id)).filter(
      (entry) => entry.kind === "freshness_reminder_changed",
    );
    check(
      "notify: the reminder switch writes the timestamp with its history line in one statement, a stale version is a conflict with no line, the shelter then drops out of freshnessReminderDue, and switching on clears the column",
      switchedOff.kind === "ok" &&
        stale.kind === "conflict" &&
        afterOff?.freshnessReminderOffAt?.getTime() === now.getTime() &&
        droppedOut &&
        switchedOn.kind === "ok" &&
        afterOn?.freshnessReminderOffAt === null &&
        lines.length === 2,
      `off ${switchedOff.kind}, stale ${stale.kind}, dropped out ${droppedOut}, on ${switchedOn.kind}, ${lines.length} line(s)`,
    );

    const taken = [countKey("a-now"), countKey("b-now")];
    const claimed = await sendsRepo.claimedKeys([...taken, countKey("never-claimed")]);
    check(
      "notify: claimedKeys returns exactly the keys that have a row, whatever their status, and an empty set for no keys",
      claimed.size === 2 &&
        taken.every((key) => claimed.has(key)) &&
        !claimed.has(countKey("never-claimed")) &&
        (await sendsRepo.claimedKeys([])).size === 0,
      `${claimed.size} of 2 found`,
    );

    // The one shared batch budget: first attempts of the batch kinds today, plus every retry made today.
    const batchKind = `smoke-${tag}-batch`;
    const retriedKind = `smoke-${tag}-retried`;
    const batchKey = (label: string) => `smoke:${tag}:batch-${label}`;
    sendKeys.push(batchKey("a"), batchKey("b"), batchKey("old"), batchKey("retried"));
    const batchBefore = await sendsRepo.countBatchSendsSince(hourAgo, [batchKind]);
    await sendsRepo.claim(now, { ...base, dedupKey: batchKey("a"), kind: batchKind });
    await sendsRepo.claim(now, { ...base, dedupKey: batchKey("b"), kind: batchKind });
    await sendsRepo.claim(new Date(now.getTime() - 3 * DAY), {
      ...base,
      dedupKey: batchKey("old"),
      kind: batchKind,
    });
    await sendsRepo.claim(new Date(now.getTime() - 3 * DAY), {
      ...base,
      dedupKey: batchKey("retried"),
      kind: retriedKind,
    });
    await sendsRepo.mark(now, batchKey("retried"), "failed");
    await sendsRepo.reclaim(now, batchKey("retried"));
    const batchAfter = await sendsRepo.countBatchSendsSince(hourAgo, [batchKind]);
    check(
      "notify: countBatchSendsSince adds today's batch-kind rows (2) and a retry made today of a 3-day-old row (1), and not a 3-day-old batch row that was not retried",
      batchAfter - batchBefore === 3,
      `before ${batchBefore}, after ${batchAfter}`,
    );

    const lastKind = "freshnessReminder";
    const lastKey = (label: string) => `smoke:${tag}:last-${label}`;
    sendKeys.push(lastKey("old"), lastKey("new"), lastKey("other"));
    await sendsRepo.claim(new Date(now.getTime() - 10 * DAY), {
      shelterId: shelterA.id,
      recipientUserId: null,
      dedupKey: lastKey("old"),
      kind: lastKind,
    });
    await sendsRepo.claim(new Date(now.getTime() - 3 * DAY), {
      shelterId: shelterA.id,
      recipientUserId: null,
      dedupKey: lastKey("new"),
      kind: lastKind,
    });
    await sendsRepo.claim(now, {
      shelterId: shelterB.id,
      recipientUserId: null,
      dedupKey: lastKey("other"),
      kind: "approved",
    });
    const lastSent = await sendsRepo.lastSentAtByShelter(lastKind, [shelterA.id, shelterB.id]);
    check(
      "notify: lastSentAtByShelter returns each shelter's newest row of the kind (A's 3-day-old, not its 10-day-old), leaves out a shelter with a row of another kind only, and is empty for no shelters",
      lastSent.size === 1 &&
        lastSent.get(shelterA.id)?.getTime() === now.getTime() - 3 * DAY &&
        (await sendsRepo.lastSentAtByShelter(lastKind, [])).size === 0,
      `${lastSent.size} shelter(s), A ${lastSent.get(shelterA.id)?.toISOString()}`,
    );

    // The Monday peak, as the SQL sees it: the cap and the batch budget are both spent while a
    // retry is waiting and a weekly reminder is due, so every gate reads "room: none".
    const peakShelter = await shelter("peak", { verification: verificationOf("verified") });
    await card(peakShelter, publishedAt(since(30)));
    const peakEvent = `smoke-${tag}-peak-event`;
    const peakRetry = `smoke:${tag}:peak-retry`;
    sendKeys.push(`smoke:${tag}:peak-1`, `smoke:${tag}:peak-2`, `smoke:${tag}:peak-3`, peakRetry);
    for (const n of [1, 2, 3]) {
      await sendsRepo.claim(now, {
        ...base,
        dedupKey: `smoke:${tag}:peak-${n}`,
        kind: peakEvent,
      });
    }
    await sendsRepo.claim(now, { ...base, dedupKey: peakRetry, kind: "smoke-peak-retry" });
    await sendsRepo.mark(now, peakRetry, "failed");
    const eventCap = 3;
    const eventLeft = Math.max(
      0,
      eventCap - (await sendsRepo.countSendsSince(hourAgo, [peakEvent])),
    );
    // The day's budget is exactly what the batch rows above spent (`batchAfter`): none left, and
    // one more unit of budget would leave exactly one, so the count is the number that matters.
    const budgetUsed = await sendsRepo.countBatchSendsSince(hourAgo, [batchKind]);
    const batchLeft = Math.max(0, batchAfter - budgetUsed);
    const oneMoreLeft = Math.max(0, batchAfter + 1 - budgetUsed);
    const retryWaiting = (await sendsRepo.retryable(now)).some((row) => row.dedupKey === peakRetry);
    const reminderDue = (await repo.freshnessReminderDue(now)).some(
      (row) => row.shelterId === peakShelter.id,
    );
    check(
      "notify: Monday peak - with the event cap spent (3 of 3) and the batch budget spent, a failed retry waiting and a weekly reminder due, the cap and the budget both read no room left",
      eventLeft === 0 && batchLeft === 0 && oneMoreLeft === 1 && retryWaiting && reminderDue,
      `event room ${eventLeft}, batch room ${batchLeft}, retry waiting ${retryWaiting}, reminder due ${reminderDue}`,
    );

    await db.delete(authMember).where(eq(authMember.id, memberARow));
    await db.delete(superAdmins).where(eq(superAdmins.id, grants[0]?.id ?? ""));
    const operatorsAfter = ours(addressesOf(await repo.operators()));
    const adminsAfter = await repo.shelterAdmins(shelterA.id);
    check(
      "notify: with the grant and the membership deleted, operators and shelterAdmins return no address for those users, and the other shelter's member is unaffected",
      operatorsAfter.length === 0 &&
        adminsAfter.length === 0 &&
        (await repo.shelterAdmins(shelterB.id)).length === 1,
      `operators ${operatorsAfter.length}, shelter A members ${adminsAfter.length}`,
    );
  } finally {
    // Delete failures must not hide a failed check above, so this runs whatever happened.
    await db.delete(shelterHistory).where(eq(shelterHistory.id, historyId));
    if (sendKeys.length > 0) {
      await db.delete(notificationSends).where(inArray(notificationSends.dedupKey, sendKeys));
    }
    if (userIds.length > 0) {
      await db.delete(superAdmins).where(inArray(superAdmins.userId, userIds));
    }
    if (shelterIds.length > 0) {
      await db.delete(animals).where(inArray(animals.shelterId, shelterIds as never));
      await db.delete(shelterHistory).where(inArray(shelterHistory.shelterId, shelterIds as never));
      await db.delete(shelters).where(inArray(shelters.id, shelterIds as never));
    }
    if (organizationIds.length > 0) {
      await db.delete(authMember).where(inArray(authMember.organizationId, organizationIds));
      await db.delete(authOrganization).where(inArray(authOrganization.id, organizationIds));
    }
    if (userIds.length > 0) await db.delete(authUser).where(inArray(authUser.id, userIds));
    await db.delete(cities).where(eq(cities.id, city.id));
  }

  return out;
}
