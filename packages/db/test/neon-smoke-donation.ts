import { randomUUID } from "node:crypto";
import {
  type CityId,
  type DonationLink,
  type ModeratorId,
  type ShelterVerification,
  transition,
} from "@opika/domain";
import { eq, sql } from "drizzle-orm";
import type { Database } from "../src/client";
import { cityRepo } from "../src/repos/city-repo";
import { kabinetShelterRepo } from "../src/repos/kabinet-shelter-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { shelters } from "../src/schema/shelters";
import { makeCity, makeShelter } from "../src/test-utils/index";

type Outcome = { name: string; ok: boolean; detail: string };

const NOW = new Date();

/**
 * The donation link's two writes, through neon-http: a suspension that takes the live link away
 * and parks it as the proposal in the same statement as the verification change, and the
 * operator's removal that clears both columns. What is read back is the raw column, not the
 * mapped shelter: an absent link must be SQL NULL (the list's `donationPending` flag and the
 * public gate both read it), never a JSON null. Fixtures are two fresh shelters; rows stay on the
 * child branch, which is thrown away.
 */
export async function runDonationSmoke(db: Database): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });

  const moderator = randomUUID() as ModeratorId;
  const live: DonationLink = {
    url: `https://send.monobank.ua/jar/smoke-${randomUUID()}`,
    provider: "monobank_jar",
  };
  const evidence = { items: [], submittedAt: NOW };
  const verified: ShelterVerification = {
    status: "verified",
    verifiedAt: NOW,
    verifiedBy: moderator,
    evidence,
  };
  const city = makeCity({ id: randomUUID() as CityId, slug: `smoke-${randomUUID()}` as never });
  await cityRepo(db).insertMissing([city]);
  const seed = async (label: string) => {
    const shelter = makeShelter({
      displayName: `Смоук збір ${label} ${randomUUID().slice(0, 6)}`,
      verification: verified,
      donation: live,
      pendingDonation: null,
      earlyListingSince: null,
      publicLocation: {
        cityId: city.id,
        district: null,
        precision: "fuzzed_address",
        approximate: { center: { lat: 50.4, lng: 30.5 }, precisionMetres: 1000 } as never,
      },
    });
    await shelterRepo(db).insert(shelter);
    return shelter;
  };
  const raw = async (id: string) => {
    const [row] = await db
      .select({
        donationNull: sql<boolean>`${shelters.donation} IS NULL`,
        pendingNull: sql<boolean>`${shelters.pendingDonation} IS NULL`,
        status: shelters.verificationStatus,
        version: shelters.version,
      })
      .from(shelters)
      .where(eq(shelters.id, id as never));
    return row;
  };
  const repo = kabinetShelterRepo(db);

  // 1. Suspension demotes the live link inside the verification write.
  const suspendee = await seed("призупинення");
  const suspend = transition(verified, {
    type: "suspend",
    at: NOW,
    moderatorId: moderator,
    reason: { code: "complaint_upheld", note: "Смоук" },
  });
  const suspended =
    suspend.kind === "ok"
      ? await repo.applyAuditedMany({
          shelterId: suspendee.id,
          expectedVersion: 0,
          changes: [
            { kind: "verification", verification: suspend.next },
            {
              kind: "donation_state",
              donation: null,
              pendingDonation: { link: live, proposedAt: NOW, proposedBy: null },
            },
          ],
          entries: [
            {
              id: randomUUID(),
              entry: {
                kind: "verification",
                event: {
                  type: "suspend",
                  at: NOW,
                  moderatorId: moderator,
                  reason: { code: "complaint_upheld", note: "Смоук" },
                },
                from: "verified",
                to: "suspended",
              },
            },
            {
              id: randomUUID(),
              entry: {
                kind: "donation_suspended",
                at: NOW,
                moderatorId: moderator,
                previousLive: live,
                outcome: "moved_to_pending",
              },
            },
          ],
          now: NOW,
        })
      : ({ kind: "conflict" } as const);
  const afterSuspend = await shelterRepo(db).findById(suspendee.id);
  const suspendRaw = await raw(suspendee.id);
  const suspendHistory = (
    await repo.historyPage({ shelterId: suspendee.id, after: null, limit: 10 })
  ).items;
  check(
    "donation, suspension: one statement sets suspended, takes the live link away (SQL NULL) and parks it as the proposal, with both history lines",
    suspended.kind === "ok" &&
      suspendRaw?.status === "suspended" &&
      suspendRaw.donationNull === true &&
      suspendRaw.pendingNull === false &&
      Number(suspendRaw.version) === 1 &&
      afterSuspend?.donation === null &&
      afterSuspend.pendingDonation?.link.url === live.url &&
      afterSuspend.pendingDonation.proposedBy === null &&
      suspendHistory
        .map((entry) => entry.kind)
        .sort()
        .join() === "donation_suspended,verification",
    `${suspended.kind}; status ${suspendRaw?.status}, live null ${suspendRaw?.donationNull}, pending null ${suspendRaw?.pendingNull}, version ${suspendRaw?.version}, history ${suspendHistory.map((e) => e.kind).join("+")}`,
  );

  // 2. The operator's removal clears the live link and the proposal; a stale version writes nothing.
  const removee = await seed("прибирання");
  const waiting = {
    link: { url: `${live.url}-new`, provider: "monobank_jar" as const },
    proposedAt: NOW,
    proposedBy: randomUUID() as never,
  };
  await repo.applyAudited({
    shelterId: removee.id,
    expectedVersion: 0,
    change: { kind: "pending_donation", pendingDonation: waiting },
    entry: {
      kind: "donation_proposed",
      at: NOW,
      actor: { kind: "shelter_admin", shelterAdminId: waiting.proposedBy },
      link: waiting.link,
    },
    historyId: randomUUID(),
    now: NOW,
  });
  const removal = {
    changes: [{ kind: "donation_state", donation: null, pendingDonation: null }] as const,
    entries: [
      {
        id: randomUUID(),
        entry: {
          kind: "donation_removed",
          at: NOW,
          moderatorId: moderator,
          previousLive: live,
          clearedPending: true,
          reason: { code: "cannot_confirm", note: "Смоук" },
        },
      },
    ],
    now: NOW,
  } as const;
  const stale = await repo.applyAuditedMany({
    shelterId: removee.id,
    expectedVersion: 0,
    ...removal,
  });
  const removed = await repo.applyAuditedMany({
    shelterId: removee.id,
    expectedVersion: 1,
    ...removal,
  });
  const removedRaw = await raw(removee.id);
  const removedHistory = (await repo.historyPage({ shelterId: removee.id, after: null, limit: 10 }))
    .items;
  check(
    "donation, removal: clears the live link and the proposal to SQL NULL in one versioned write; a stale version conflicts and records nothing",
    stale.kind === "conflict" &&
      removed.kind === "ok" &&
      removedRaw?.donationNull === true &&
      removedRaw.pendingNull === true &&
      Number(removedRaw.version) === 2 &&
      removedHistory.filter((entry) => entry.kind === "donation_removed").length === 1,
    `stale ${stale.kind}, removed ${removed.kind}; live null ${removedRaw?.donationNull}, pending null ${removedRaw?.pendingNull}, version ${removedRaw?.version}, removal lines ${removedHistory.filter((e) => e.kind === "donation_removed").length}`,
  );
  return out;
}
