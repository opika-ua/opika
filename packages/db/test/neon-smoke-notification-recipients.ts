import { randomUUID } from "node:crypto";
import {
  type CityId,
  earlyListingCutoff,
  earlyListingOf,
  earlyListingRemaining,
  type ModeratorId,
  type Shelter,
  type ShelterVerification,
} from "@opika/domain";
import { eq, inArray } from "drizzle-orm";
import type { Database } from "../src/client";
import { cityRepo } from "../src/repos/city-repo";
import { kabinetInvitationRepo } from "../src/repos/kabinet-invitation-repo";
import { notificationRecipientsRepo } from "../src/repos/notification-recipients-repo";
import { notificationSendsRepo } from "../src/repos/notification-sends-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { authMember, authOrganization, authUser, superAdmins } from "../src/schema/auth";
import { cities } from "../src/schema/cities";
import { notificationSends } from "../src/schema/notification-sends";
import { shelterHistory } from "../src/schema/shelter-history";
import { shelters } from "../src/schema/shelters";
import { makeCity, makeShelter } from "../src/test-utils/index";

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
    sendKeys.push(countKey("now"), countKey("old"), countKey("other"));
    const hourAgo = new Date(now.getTime() - 3_600_000);
    const base = { shelterId: null, recipientUserId: null };
    await sendsRepo.claim(now, { ...base, dedupKey: countKey("now"), kind: "approved" });
    await sendsRepo.claim(new Date(now.getTime() - 3 * DAY), {
      ...base,
      dedupKey: countKey("old"),
      kind: "approved",
    });
    await sendsRepo.claim(now, { ...base, dedupKey: countKey("other"), kind: "smoke-other" });
    const counted = await sendsRepo.countCreatedSince(hourAgo, ["approved"]);
    const countedBoth = await sendsRepo.countCreatedSince(hourAgo, ["approved", "smoke-other"]);
    const none = await sendsRepo.countCreatedSince(hourAgo, []);
    check(
      "notify: countCreatedSince counts the fixture rows of the given kinds created since the instant (a 3-day-old row and another kind are not counted)",
      countedBoth - counted === 1 && counted >= 1 && none === 0,
      `approved ${counted}, with the other kind ${countedBoth}, no kinds ${none}`,
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
