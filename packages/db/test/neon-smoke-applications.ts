import { randomUUID } from "node:crypto";
import {
  type CityId,
  type ModeratorId,
  type Shelter,
  type ShelterHistoryEntry,
  type ShelterId,
  transition,
} from "@opika/domain";
import { eq, sql } from "drizzle-orm";
import type { Database } from "../src/client";
import { animalRepo } from "../src/repos/animal-repo";
import { applicationsRepo } from "../src/repos/applications-repo";
import { cityRepo } from "../src/repos/city-repo";
import { kabinetShelterRepo } from "../src/repos/kabinet-shelter-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { animals } from "../src/schema/animals";
import { authUser } from "../src/schema/auth";
import { shelters } from "../src/schema/shelters";
import { makeAnimal, makeCity, makeDraftAnimal, makeShelter } from "../src/test-utils/index";

type Outcome = { name: string; ok: boolean; detail: string };

const NOW = new Date();
const MOD = randomUUID() as ModeratorId;

/**
 * The operator queue on Neon's driver: the decision as one CTE statement (UPDATE … RETURNING,
 * the served-animals UPDATE, the history INSERT … SELECT), a lost second decision, and the list
 * reads' `::int` counts and `jsonb_typeof` null test. Rows stay on the child branch.
 */
export async function runApplicationsSmoke(db: Database): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });
  const repo = applicationsRepo(db);

  const city = makeCity({ id: randomUUID() as CityId, slug: `smoke-${randomUUID()}` as never });
  await cityRepo(db).insertMissing([city]);
  const at = { precision: "city", cityId: city.id, district: null } as const;

  const application = async (): Promise<ShelterId> => {
    const userId = randomUUID();
    await db.insert(authUser).values({
      id: userId,
      name: "Смоук",
      email: `smoke-${userId}@example.org`,
      emailVerified: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const fixture = makeShelter({
      displayName: `Смоук черга ${randomUUID().slice(0, 6)}`,
      publicLocation: at,
      verification: {
        status: "application",
        appliedAt: NOW,
        evidence: {
          items: [{ kind: "public_link", url: "https://www.instagram.com/smoke_queue/" }],
          submittedAt: NOW,
        },
      },
    });
    const shelter: Shelter = { ...fixture, legalEntity: null, premises: { kind: "not_recorded" } };
    await shelterRepo(db).insert(shelter);
    await db.update(shelters).set({ registrantUserId: userId }).where(eq(shelters.id, shelter.id));
    return shelter.id;
  };

  const accepted = await application();
  const rejected = await application();
  const draft = makeDraftAnimal({ shelterId: accepted });
  await animalRepo(db).insert(draft, city.id);
  await animalRepo(db).insert(makeDraftAnimal({ shelterId: accepted }), city.id);
  const [original] = await db
    .select({ photos: animals.photos })
    .from(animals)
    .where(eq(animals.id, draft.id));
  if (original === undefined) throw new Error("no draft");
  await db
    .update(animals)
    .set({ photos: sql`'[{}, {}, {}]'::jsonb` })
    .where(eq(animals.id, draft.id));
  // A listed animal, so the accept's served step has a row to stamp.
  const listed = makeAnimal({ shelterId: accepted });
  await animalRepo(db).insert(listed, city.id);
  await db.update(animals).set({ everServedAt: null }).where(eq(animals.id, listed.id));

  const pending = await repo.pending();
  const mine = pending.find((row) => row.shelterId === accepted);
  check(
    "queue: an application with its registrant and draft counts as numbers",
    mine?.registrant?.emailVerified === true &&
      typeof mine.drafts.animals === "number" &&
      mine.drafts.animals === 2 &&
      mine.drafts.photos === 3,
    JSON.stringify(mine?.drafts ?? null),
  );
  // Keyless photo elements left behind crash the R2 clean-up on a reused branch's next run.
  await db.update(animals).set({ photos: original.photos }).where(eq(animals.id, draft.id));

  const plan = async (shelterId: ShelterId, kind: "accept" | "reject") => {
    const shelter = await shelterRepo(db).findById(shelterId);
    if (shelter === null) throw new Error("no shelter");
    const event =
      kind === "accept"
        ? ({ type: "accept_application", at: NOW, moderatorId: MOD } as const)
        : ({
            type: "reject",
            at: NOW,
            moderatorId: MOD,
            reason: { code: "not_animal_welfare", note: null },
          } as const);
    const result = transition(shelter.verification, event);
    if (result.kind !== "ok") throw new Error(result.kind);
    const entries: { id: string; entry: ShelterHistoryEntry }[] = [
      {
        id: randomUUID(),
        entry: { kind: "verification", event, from: "application", to: result.next.status },
      },
    ];
    if (kind === "accept") {
      entries.push({
        id: randomUUID(),
        entry: { kind: "early_listing_allowed", at: NOW, moderatorId: MOD, period: 1, note: null },
      });
    }
    return {
      shelterId,
      expectedVersion: shelter.version,
      decision:
        kind === "accept"
          ? { kind: "accept" as const, verification: result.next, earlyListingSince: NOW }
          : { kind: "reject" as const, verification: result.next, rejectedAt: NOW },
      entries,
      now: NOW,
    };
  };

  const acceptPlan = await plan(accepted, "accept");
  const first = await repo.decide(acceptPlan);
  const [afterAccept] = await db.select().from(shelters).where(eq(shelters.id, accepted));
  const [servedRow] = await db.select().from(animals).where(eq(animals.id, listed.id));
  const history = await kabinetShelterRepo(db).historyOf(accepted);
  check(
    "accept: one statement moves to pending, starts early listing, writes both history lines",
    first === "ok" &&
      afterAccept?.verificationStatus === "pending" &&
      afterAccept.earlyListingSince?.getTime() === NOW.getTime() &&
      afterAccept.applicationRejectedAt === null &&
      history.length === 2,
    `${first}, ${afterAccept?.verificationStatus}, ${history.length} lines`,
  );
  check(
    "accept: the shelter's listed animal is stamped as served",
    servedRow?.everServedAt?.getTime() === NOW.getTime(),
    String(servedRow?.everServedAt?.toISOString() ?? null),
  );

  const again = await repo.decide(acceptPlan);
  check(
    "a second decision on the same version writes nothing",
    again === "lost" && (await kabinetShelterRepo(db).historyOf(accepted)).length === 2,
    again,
  );

  const rejectResult = await repo.decide(await plan(rejected, "reject"));
  const [afterReject] = await db.select().from(shelters).where(eq(shelters.id, rejected));
  check(
    "reject: the rejection date starts the clean-up clock",
    rejectResult === "ok" &&
      afterReject?.verificationStatus === "rejected" &&
      afterReject.applicationRejectedAt?.getTime() === NOW.getTime() &&
      afterReject.earlyListingSince === null,
    `${rejectResult}, ${afterReject?.applicationRejectedAt?.toISOString()}`,
  );

  check(
    "accepted applications still shown early are listed",
    (await repo.earlyListed()).some((row) => row.shelterId === accepted),
    "earlyListed",
  );

  // A JSON null in pending_donation must read as no proposal, like SQL NULL.
  const jsonNull = makeShelter({ displayName: "Смоук json null", publicLocation: at });
  await shelterRepo(db).insert(jsonNull);
  await db
    .update(shelters)
    .set({ pendingDonation: sql`'null'::jsonb` as never })
    .where(eq(shelters.id, jsonNull.id));
  const proposing = makeShelter({
    displayName: "Смоук збір",
    publicLocation: at,
    pendingDonation: {
      link: { url: "https://send.monobank.ua/jar/smoke", provider: "monobank_jar" },
      proposedAt: NOW,
      proposedBy: null,
    },
  });
  await shelterRepo(db).insert(proposing);
  const donations = await repo.pendingDonations();
  check(
    "pending donations: a proposal is listed, a JSON null is not",
    donations.some((row) => row.shelterId === proposing.id) &&
      !donations.some((row) => row.shelterId === jsonNull.id),
    `${donations.length} listed`,
  );

  check(
    "duplicate sources read on this driver",
    (await repo.duplicateSources()).some((row) => row.shelterId === accepted),
    "duplicateSources",
  );
  return out;
}
