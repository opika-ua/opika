import { randomUUID } from "node:crypto";
import type { CityId, Shelter, ShelterId } from "@opika/domain";
import { eq, sql } from "drizzle-orm";
import type { Database } from "../src/client";
import { executeRows } from "../src/raw-rows";
import { cityRepo } from "../src/repos/city-repo";
import { funnelRepo } from "../src/repos/funnel-repo";
import { registrationFactsRepo } from "../src/repos/registration-facts-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { authUser } from "../src/schema/auth";
import { registrationEmailTokens } from "../src/schema/registration-email-tokens";
import { shelters } from "../src/schema/shelters";
import { makeCity, makeShelter } from "../src/test-utils/index";
import { outcomeOf } from "./neon-smoke-verified-data";

type Outcome = { name: string; ok: boolean; detail: string };

const NOW = new Date();

/**
 * Migration 0028 on Neon's driver: the self-registration CHECKs, the registrant's uniqueness, the
 * registration facts' left join, the funnel's once-per-step insert (a partial-index conflict target
 * with RETURNING) and its counts, the cascades, and the two backfills over whatever the branch
 * copied from production. Rows stay on the child branch, which is thrown away.
 */
export async function runSelfRegistrationSmoke(db: Database): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });

  // The backfills, read before this smoke writes anything: no older row may keep the old shape.
  const [unstaged] = await executeRows<{ n: number }>(
    db,
    sql`SELECT count(*)::int AS n FROM shelters WHERE verification_status = 'rejected' AND NOT (verification ? 'stage')`,
  );
  check("0028 backfill: every rejection has a stage", unstaged?.n === 0, `${unstaged?.n} without`);
  const [bareRenames] = await executeRows<{ n: number }>(
    db,
    sql`SELECT count(*)::int AS n FROM shelter_history WHERE kind = 'display_name_changed' AND (entry ? 'moderatorId' OR NOT (entry ? 'actor'))`,
  );
  check(
    "0028 backfill: every rename line names an actor",
    bareRenames?.n === 0,
    `${bareRenames?.n} in the old shape`,
  );
  const [sources] = await executeRows<{ operator: number; other: number }>(
    db,
    sql`SELECT count(*) FILTER (WHERE registration_source = 'operator')::int AS operator, count(*) FILTER (WHERE registration_source <> 'operator')::int AS other FROM shelters`,
  );
  check(
    "0028: every existing shelter reads as operator-created",
    sources?.other === 0,
    `${sources?.operator} operator, ${sources?.other} other`,
  );

  const city = makeCity({ id: randomUUID() as CityId, slug: `smoke-${randomUUID()}` as never });
  await cityRepo(db).insertMissing([city]);
  const user = async (emailVerified: boolean) => {
    const id = randomUUID();
    await db.insert(authUser).values({
      id,
      name: "Смоук",
      email: `smoke-${id}@example.org`,
      emailVerified,
      createdAt: NOW,
      updatedAt: NOW,
    });
    return id;
  };
  const application = async (registrantUserId: string | null): Promise<ShelterId> => {
    const fixture = makeShelter({
      displayName: `Смоук заявка ${randomUUID().slice(0, 6)}`,
      publicLocation: { precision: "city", cityId: city.id, district: null },
      verification: {
        status: "application",
        appliedAt: NOW,
        evidence: {
          items: [{ kind: "public_link", url: "https://www.instagram.com/smoke_lapa/" }],
          submittedAt: NOW,
        },
      },
    });
    // As the form leaves it: no legal entity, no address (and so no point).
    const shelter: Shelter = { ...fixture, legalEntity: null, exactAddress: null };
    await shelterRepo(db).insert(shelter);
    if (registrantUserId !== null) {
      await db.update(shelters).set({ registrantUserId }).where(eq(shelters.id, shelter.id));
    }
    return shelter.id;
  };

  const confirmedUser = await user(true);
  const unconfirmedUser = await user(false);
  const confirmed = await application(confirmedUser);
  const unconfirmed = await application(unconfirmedUser);

  const [row] = await db.select().from(shelters).where(eq(shelters.id, confirmed));
  check(
    "an application is stored self-registered, without legal data",
    row?.registrationSource === "self_registration" &&
      row.appliedAt?.getTime() === NOW.getTime() &&
      row.legalEntity === null,
    `${row?.registrationSource}, applied ${row?.appliedAt?.toISOString()}`,
  );

  const notSelf = await outcomeOf(async () => {
    await db
      .update(shelters)
      .set({ registrationSource: "operator", appliedAt: null })
      .where(eq(shelters.id, confirmed));
  });
  check(
    "CHECK: an application must be self-registered",
    notSelf === "shelters_application_is_self_registered",
    notSelf,
  );
  const earlyRefusal = await outcomeOf(async () => {
    await db.update(shelters).set({ applicationRejectedAt: NOW }).where(eq(shelters.id, confirmed));
  });
  check(
    "CHECK: a refusal date needs a rejected status",
    earlyRefusal === "shelters_application_rejected_at_check",
    earlyRefusal,
  );
  const twice = await outcomeOf(async () => {
    await application(confirmedUser);
  });
  check("one registrant, one shelter", twice === "error 23505", twice);

  const facts = registrationFactsRepo(db);
  const [factsConfirmed, factsUnconfirmed] = [
    await facts.of(confirmed),
    await facts.of(unconfirmed),
  ];
  check(
    "registration facts read the registrant's email over the join",
    factsConfirmed?.source === "self_registration" &&
      factsConfirmed.email === "confirmed" &&
      factsUnconfirmed?.source === "self_registration" &&
      factsUnconfirmed.email === "unconfirmed",
    `${JSON.stringify(factsConfirmed)} / ${JSON.stringify(factsUnconfirmed)}`,
  );

  const funnel = funnelRepo(db);
  const first = await funnel.record("registered", unconfirmed, NOW);
  const second = await funnel.record("registered", unconfirmed, NOW);
  check(
    "funnel: a step is recorded once per shelter",
    first === "recorded" && second === "already_recorded",
    `${first}, then ${second}`,
  );
  const before = (await funnel.countsSince(NOW)).registered;
  await db.delete(shelters).where(eq(shelters.id, unconfirmed));
  const after = (await funnel.countsSince(NOW)).registered;
  check(
    "funnel: counts survive the application's deletion",
    before >= 1 && after === before,
    `${before} before, ${after} after`,
  );

  await db.insert(registrationEmailTokens).values({
    tokenHash: randomUUID(),
    userId: unconfirmedUser,
    purpose: "confirm_email",
    expiresAt: NOW,
  });
  await db.delete(authUser).where(eq(authUser.id, unconfirmedUser));
  const [tokensLeft] = await executeRows<{ n: number }>(
    db,
    sql`SELECT count(*)::int AS n FROM registration_email_tokens WHERE user_id = ${unconfirmedUser}`,
  );
  check(
    "an erased user takes their email tokens along",
    tokensLeft?.n === 0,
    `${tokensLeft?.n} left`,
  );

  // Leaves no self-registered row behind, so a second run reads the backfill checks the same.
  await db.delete(shelters).where(eq(shelters.cityId, city.id));
  await db.delete(authUser).where(eq(authUser.id, confirmedUser));

  return out;
}
