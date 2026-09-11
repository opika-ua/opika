import type { apiErrors } from "@opika/contracts";
import type { Database } from "@opika/db";
import { revealRepo } from "@opika/db/repos";
import type { AdopterId, ShelterId } from "@opika/domain";
import type { ORPCErrorConstructorMap } from "@orpc/server";

/**
 * Narrower than `AnimalsRevealErrors` (`handlers/reveal.ts`) on purpose:
 * this module only ever throws one of these codes, and importing the
 * handler's own type here would point the dependency the wrong way
 * (`handlers/reveal.ts` already imports *this* file). See animals.ts's own
 * comment for why any of this exists at all (O-20).
 */
type RevealRateLimitErrors = ORPCErrorConstructorMap<{
  RATE_LIMITED: typeof apiErrors.RATE_LIMITED;
}>;

/**
 * Reveal rate limit policy.
 *
 * Shelter contact details are the scrapeable asset. The reveal limit must
 * survive across serverless instances, so it is persisted in Postgres
 * rather than held in memory.
 *
 * Deliberately its own file, not part of `rate-limit.ts`: this one imports
 * `@opika/db/repos`, a Postgres driver dependency. `rate-limit.ts` is also
 * imported from `apps/web/src/proxy.ts`, a separate deployment unit
 * from the route handlers — pulling a DB driver into that bundle would be
 * wrong regardless of what any specific runtime does or doesn't support.
 * Single responsibility here removes the question rather than resolving it.
 *
 * **Correction, 2026-09-10 — the budget counts distinct shelters, not
 * reveal actions.** Contacts are per shelter, not per animal: a device
 * right-swiping 40 cards across 6 shelters was burning 40 units to see 6
 * phone numbers, which is the counter measuring the wrong thing rather than
 * the budget being genuinely tight. `maxReveals` therefore now bounds
 * `COUNT(DISTINCT shelter_id)` over the window, and re-revealing a shelter
 * the device has already seen in that window costs nothing — see
 * `checkRevealRateLimit`'s own free-re-reveal short-circuit below. This is
 * also what makes an *accidental repeat* drag on an already-revealed shelter
 * safe once gesture parity ships (a deck right-drag doing exactly what
 * «Написати» does): that specific case now costs nothing. It does **not**
 * make every accidental drag free — an accidental drag on a shelter never
 * revealed before still spends a unit and still irreversibly discloses the
 * shelter's exact address and contact, same as an accidental button tap
 * always did.
 */
const REVEAL_RATE_LIMIT = {
  maxReveals: 30,
  windowSeconds: 24 * 3600, // 24 hours
};

/**
 * Check whether revealing `shelterId` would exceed the adopter's reveal
 * rate limit, and throw if so.
 *
 * Free re-reveal: if this shelter is already among the adopter's distinct
 * shelter contacts revealed within the window, this returns without
 * touching the budget at all — checked first, via an indexed existence
 * query, so the common case (a repeat reveal) never runs the distinct-count
 * query below it. ⚠ "Indexed" is not the same claim as "cheap under load":
 * `reveals_shelter_id_idx` is shelter-only, so a first-time reveal of a
 * *popular* shelter still filters the adopter out of a wide row set rather
 * than seeking directly to this adopter's own rows — measured, not assumed,
 * at real corpus scale, and a `(adopter_id, shelter_id, revealed_at)`
 * composite index did not change the query plan Postgres chose. Left as-is:
 * this project runs at near-zero traffic today (`docs/observations.md`'s
 * O-9), and a real fix needs the query plan actually asserted
 * (`packages/db/test/feed-explain.test.ts` is the existing pattern for
 * that), not a speculative index.
 *
 * Counts distinct shelters in the last `windowSeconds` via the reveal
 * repository, keeping the Drizzle query builder inside `packages/db` where
 * it belongs (standing check: repository boundary).
 *
 * Throws RATE_LIMITED if the limit is exceeded.
 */
export async function checkRevealRateLimit(
  db: Database,
  adopterId: AdopterId,
  shelterId: ShelterId,
  now: Date,
  errors: RevealRateLimitErrors,
): Promise<void> {
  const cutoff = new Date(now.getTime() - REVEAL_RATE_LIMIT.windowSeconds * 1000);
  const reveals = revealRepo(db);

  const alreadyRevealed = await reveals.hasRevealedShelterRecently(adopterId, shelterId, cutoff);
  if (alreadyRevealed) return;

  const distinctShelterCount = await reveals.countDistinctSheltersRecentByAdopter(
    adopterId,
    cutoff,
  );

  if (distinctShelterCount >= REVEAL_RATE_LIMIT.maxReveals) {
    throw errors.RATE_LIMITED();
  }
}
