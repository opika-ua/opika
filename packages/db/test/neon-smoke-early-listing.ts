import { randomUUID } from "node:crypto";
import {
  type CityId,
  EARLY_LISTING_DAYS,
  EVERYONE_SCOPE,
  type ModeratorId,
  NO_FILTERS,
  type ShelterVerification,
} from "@opika/domain";
import { and, inArray } from "drizzle-orm";
import type { Database } from "../src/client";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { buildFeedPredicate } from "../src/repos/feed-predicate";
import { galleryRepo } from "../src/repos/gallery-repo";
import { kabinetShelterRepo } from "../src/repos/kabinet-shelter-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { animals } from "../src/schema/animals";
import { makeAnimal, makeCity, makeShelter } from "../src/test-utils/index";

type Outcome = { name: string; ok: boolean; detail: string };

const NOW = new Date();
const DAY = 86_400_000;

/**
 * Listing before verification: the read-time predicate (`listedShelterCondition`) and the
 * verification CASE that keeps or clears `early_listing_since`, through neon-http. Fixtures: a
 * pending shelter with a permission running, one whose period ran out, in one fresh city, each
 * with a published animal. Rows stay on the child branch, which is thrown away; use a fresh one.
 */
export async function runEarlyListingSmoke(db: Database): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });

  const city = makeCity({ id: randomUUID() as CityId, slug: `smoke-${randomUUID()}` as never });
  await cityRepo(db).insertMissing([city]);
  const moderator = randomUUID() as ModeratorId;
  const pending: ShelterVerification = {
    status: "pending",
    submittedAt: NOW,
    evidence: { items: [], submittedAt: NOW },
  };
  const seed = async (label: string, since: Date) => {
    const shelter = makeShelter({
      displayName: `Смоук на перевірці ${label} ${city.id.slice(0, 6)}`,
      verification: pending,
      earlyListingSince: since,
      publicLocation: {
        cityId: city.id,
        district: null,
        precision: "fuzzed_address",
        approximate: { center: { lat: 50.4, lng: 30.5 }, precisionMetres: 1000 } as never,
      },
    });
    await shelterRepo(db).insert(shelter);
    const animal = makeAnimal({ shelterId: shelter.id, name: `Смоук ${label}` });
    await animalRepo(db).insert(animal, city.id);
    return { shelter, animal };
  };
  const running = await seed("діє", new Date(NOW.getTime() - 10 * DAY));
  const lapsed = await seed("минув", new Date(NOW.getTime() - (EARLY_LISTING_DAYS + 1) * DAY));

  const page = await galleryRepo(db).listCards({
    filters: { ...NO_FILTERS, cities: { kind: "oneOf", values: [city.id] } },
    scope: EVERYONE_SCOPE,
    sort: "freshest",
    page: 1,
    pageSize: 24,
    now: NOW,
  });
  check(
    "early listing, any-listed basis: a running permission lists the animal with the label; a lapsed one does not",
    page.totalMatching === 1 &&
      page.items[0]?.animal.id === running.animal.id &&
      page.items[0]?.shelter.verification === "listed_before_verification" &&
      page.items.every((item) => item.animal.id !== lapsed.animal.id),
    `${page.totalMatching} listed, label ${page.items[0]?.shelter.verification}`,
  );

  // The sitemap is windowed to the freshest rows of the whole branch, so a bare "not in it" can
  // pass on a large branch only because the fixture fell outside the window. Scope both bases to
  // the fixtures themselves (their shelters), unwindowed, and decide on those.
  const fixtureIds = [running.animal.id, lapsed.animal.id];
  const idsUnder = async (basis: "any_listed" | "verified_only") =>
    (
      await db
        .select({ id: animals.id })
        .from(animals)
        .where(
          and(
            ...buildFeedPredicate(NO_FILTERS, NOW, basis),
            inArray(animals.shelterId, [running.shelter.id, lapsed.shelter.id]),
          ),
        )
    ).map((row) => row.id);
  const anyListed = await idsUnder("any_listed");
  check(
    "early listing, any-listed basis, unwindowed and scoped to the fixtures: only the running permission's animal is in the set",
    anyListed.length === 1 && anyListed[0] === running.animal.id,
    `${anyListed.length} of ${fixtureIds.length} fixture animals`,
  );
  const verifiedOnly = await idsUnder("verified_only");
  check(
    "early listing, verified-only basis, unwindowed and scoped to the fixtures: neither is in the set",
    verifiedOnly.length === 0,
    `${verifiedOnly.length} of ${fixtureIds.length} fixture animals`,
  );
  const sitemap = await galleryRepo(db).sitemapRows({ now: NOW });
  check(
    "early listing, sitemap rows: neither fixture appears (the two checks above are what keep this from passing vacuously)",
    sitemap.every((row) => row.id !== running.animal.id && row.id !== lapsed.animal.id),
    `${sitemap.length} sitemap rows`,
  );

  const repo = kabinetShelterRepo(db);
  const sinceOf = async () =>
    (await shelterRepo(db).findById(running.shelter.id))?.earlyListingSince;
  const underReview: ShelterVerification = {
    status: "under_review",
    startedAt: NOW,
    reviewerId: moderator,
    evidence: pending.evidence,
  };
  const move = (verification: ShelterVerification, expectedVersion: number) =>
    repo.applyAudited({
      shelterId: running.shelter.id,
      expectedVersion,
      change: { kind: "verification", verification },
      entry: {
        kind: "verification",
        event: { type: "start_review", at: NOW, reviewerId: moderator },
        from: "pending",
        to: verification.status,
      },
      historyId: randomUUID(),
      now: NOW,
    });
  const review = await move(underReview, 0);
  const keptSince = await sinceOf();
  check(
    "early listing, repo CASE: start_review keeps early_listing_since",
    review.kind === "ok" && keptSince !== null && keptSince !== undefined,
    `since ${keptSince?.toISOString() ?? "null"}`,
  );

  const rejected: ShelterVerification = {
    status: "rejected",
    rejectedAt: NOW,
    rejectedBy: moderator,
    reason: { code: "spam", note: null },
    evidence: pending.evidence,
  };
  const reject = await move(rejected, 1);
  const clearedSince = await sinceOf();
  check(
    "early listing, repo CASE: a reject clears early_listing_since in the same statement",
    reject.kind === "ok" && clearedSince === null,
    `since ${clearedSince?.toISOString() ?? "null"}`,
  );
  return out;
}
