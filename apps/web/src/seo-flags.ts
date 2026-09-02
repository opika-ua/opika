/**
 * Single switch for "is this deploy indexable at all."
 *
 * This corpus is fictional shelters and fictional animals — see
 * `CLAUDE.md`'s "No real shelter data in the repository" rule. Nothing here
 * may reach a search index before real shelters are onboarded, so every
 * route is blocked: `next.config.ts`'s `headers()` sets `X-Robots-Tag` site-
 * wide, and `app/robots.ts` disallows everything, both reading this one
 * value rather than each hand-maintaining their own list.
 *
 * Flipping this to `false` — or replacing it with per-route logic once some
 * routes have real data and others don't — is a launch-gate item, not a
 * flag to flip casually. See `docs/build-plan.md`'s launch-gate list.
 */
export const NOINDEX_EVERYTHING = true;
