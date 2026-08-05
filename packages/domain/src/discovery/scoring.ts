import { type FeedFilters, matchesSelection } from "../adopters/feed-filters.js";
import { ageBucketOf } from "../animals/age.js";
import type { Animal } from "../animals/animal.js";
import type { Freshness, FreshnessKind } from "./freshness.js";

export type ScoringPolicy = {
  /** Relative pull of each component. Need not sum to 1; the result is normalised. */
  componentWeights: { freshness: number; completeness: number; preference: number };
  freshnessScore: Record<FreshnessKind, number>;
  completenessScore: { hasPhotos: number; hasDescription: number; vaccinationKnown: number };
};

/**
 * Weights, not thresholds, but the same reasoning as the freshness policy:
 * these are the first thing to change once there is a real feed to look at, and
 * a tunable number buried in an expression is a number nobody finds again.
 *
 * Freshness carries the most weight because de-ranking listings the shelter has
 * stopped confirming is the honesty property the product is built on, not a
 * nicety.
 */
export const DEFAULT_SCORING_POLICY: ScoringPolicy = {
  componentWeights: { freshness: 0.5, completeness: 0.3, preference: 0.2 },
  freshnessScore: { fresh: 1, aging: 0.6, stale: 0.15 },
  completenessScore: { hasPhotos: 0.5, hasDescription: 0.25, vaccinationKnown: 0.25 },
};

const completenessOf = (animal: Animal, policy: ScoringPolicy): number => {
  const { hasPhotos, hasDescription, vaccinationKnown } = policy.completenessScore;
  const total = hasPhotos + hasDescription + vaccinationKnown;
  if (total === 0) return 0;

  const earned =
    (animal.photos.length > 0 ? hasPhotos : 0) +
    (animal.description.uk.length > 0 ? hasDescription : 0) +
    (animal.vaccination.state === "unknown" ? 0 : vaccinationKnown);

  return earned / total;
};

/**
 * The fraction of *constrained* dimensions the animal satisfies. Dimensions set
 * to "any" are excluded from both sides, so widening a filter cannot lower a
 * score.
 *
 * City is absent deliberately: it lives on the shelter, not the animal, and is
 * applied as a hard constraint in the query rather than as a ranking signal.
 */
const preferenceOf = (animal: Animal, filters: FeedFilters, now: Date): number => {
  // null marks a dimension the adopter left open, which is excluded from the
  // ratio entirely rather than counted as a free match.
  const checks: readonly (boolean | null)[] = [
    filters.species.kind === "any" ? null : matchesSelection(filters.species, animal.species),
    filters.sizes.kind === "any" ? null : matchesSelection(filters.sizes, animal.size),
    filters.ages.kind === "any"
      ? null
      : matchesSelection(filters.ages, ageBucketOf(animal.age, now)),
  ];

  const constrained = checks.filter((check) => check !== null);
  if (constrained.length === 0) return 1;

  return constrained.filter(Boolean).length / constrained.length;
};

/**
 * Ranks a listing in [0, 1]. Pure and deterministic: the same inputs always
 * produce the same number, which is what makes a feed reproducible during
 * debugging and a ranking change reviewable.
 *
 * `now` is a parameter because the age component derives a bucket from a birth
 * date, and a function that reads the clock is a function whose output cannot
 * be asserted.
 *
 * `filters` are hard constraints applied in the query, so today every candidate
 * matches and the preference component is constant. That is deliberate rather
 * than vestigial: it means offering close matches from just outside an
 * adopter's filters later is a change to the query, not to this function.
 * Do not remove it as dead code.
 */
export const scoreAnimal = (
  animal: Animal,
  filters: FeedFilters,
  freshness: Freshness,
  now: Date,
  policy: ScoringPolicy,
): number => {
  const { componentWeights } = policy;
  const totalWeight =
    componentWeights.freshness + componentWeights.completeness + componentWeights.preference;
  if (totalWeight === 0) return 0;

  const weighted =
    policy.freshnessScore[freshness.kind] * componentWeights.freshness +
    completenessOf(animal, policy) * componentWeights.completeness +
    preferenceOf(animal, filters, now) * componentWeights.preference;

  return weighted / totalWeight;
};
