/**
 * The seed's reserved id range for shelters: every seeded (fictional) shelter
 * id starts with this block. Nothing else aims at it: onboarding derives ids
 * from a hash, which lands in it by chance one time in 2^32. `location:verify`
 * relies on it to tell a demo shelter from a real one (RG-Q11), so the seed
 * builds its ids from this constant rather than a literal of its own.
 */
export const SEED_SHELTER_ID_PREFIX = "51000000";

export const isSeedShelterId = (id: string): boolean => id.startsWith(`${SEED_SHELTER_ID_PREFIX}-`);

/**
 * The key the seed's test-only location policy runs on. Shared for the same
 * reason as the prefix: `location:verify` recomputes seeded locations with
 * it, and a drifted copy would turn every demo row into a mismatch.
 */
export const SEED_LOCATION_POLICY_KEY = "seed";
