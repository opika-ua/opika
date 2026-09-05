/**
 * Two facts, not one — `NOINDEX_EVERYTHING` (#43) originally collapsed
 * these into a single flag, unreviewed, on the reasoning that flipping it
 * later would be "one change, not two to keep in sync". `docs/build-
 * plan.md`'s "Before any route is indexed" launch-gate paragraph — which
 * reserves a real state where the two facts disagree, a shelter verified
 * and reachable by direct link before the site is meant to be publicly
 * discoverable at all — was written one PR later (#44) and did not exist
 * yet to be checked against. One flag cannot express "registry has real
 * data" and "not yet indexable" as different facts, so keeping a single
 * boolean would have forced that later paragraph to either delete the
 * window it describes (bad) or mis-name itself (worse). Two facts that
 * happen to be true at the same time today are not one fact — see
 * `docs/standing-constraints.md`.
 */

/**
 * Does the registry currently hold zero real shelters. Drives the demo
 * banner, the `firstRun.promise` swap, and (once built) suppression of the
 * `shelterVerifiedYears` badge — everything that would otherwise assert
 * something true about a fictional shelter to a visitor.
 *
 * This is a fact about *data*, not about *reach*. It goes `false` the
 * moment the demo corpus is wiped and the first real shelter is onboarded —
 * which per Phase D's D-7 happens before the site is necessarily meant to
 * be publicly discoverable. See `SITE_IS_PUBLICLY_DISCOVERABLE` below for
 * that separate fact, and `assertDemoDiscoverabilityInvariant`'s doc
 * comment for the one relationship the two constants are allowed to have.
 *
 * Has no product consumer yet — D-2 (the banner, the promise swap, the
 * badge suppression) is in this same phase and not yet built; today this
 * constant is read only by the invariant above and by its own test. Not
 * scaffolding ahead of the current phase (`CLAUDE.md`'s phase-discipline
 * rule) — D-1 exists specifically to give D-2 a name to read.
 */
export const REGISTRY_HAS_NO_REAL_SHELTERS = true;

/**
 * Is this deploy meant to be found by a search engine or crawled at all.
 * Drives `next.config.ts`'s `X-Robots-Tag` header and `app/robots.ts`'s
 * disallow rule — and, once D-3 lands, the root-layout `robots` metadata
 * that replaces `robots.ts`'s current `Disallow: /` (the "removal trap":
 * `Disallow: /` stops a crawler fetching pages at all, so it never sees a
 * `noindex` meta tag or the `X-Robots-Tag` header — a URL already indexed
 * before this flag flips stays indexed, since de-indexing needs the
 * crawler to *visit* the page and read the exclusion, not merely be told
 * not to. Which is why D-3 exists rather than just flipping this flag).
 *
 * Independent of `REGISTRY_HAS_NO_REAL_SHELTERS`: a verified real shelter
 * can exist in the database, reachable by direct link, while this is still
 * `false` — `docs/build-plan.md`'s launch-gate paragraph reserves exactly
 * that window on purpose. Flipping this to `true` is the actual launch
 * gate, not a flag to flip casually. See `docs/build-plan.md`'s launch-gate
 * list.
 *
 * `/tvaryny/gortaty` does NOT read this flag — its own `noindex` metadata
 * (`app/tvaryny/gortaty/page.tsx`) is permanent regardless of launch state,
 * because it is a non-canonical sibling of `/tvaryny`'s SEO surface, not a
 * demo-data concern. See that file's own comment.
 */
export const SITE_IS_PUBLICLY_DISCOVERABLE = false;

/**
 * The one relationship these two constants are allowed to have: the
 * registry can never simultaneously hold no real shelters AND be publicly
 * discoverable. That combination would let a search engine index a corpus
 * of fictional animals from fictional shelters — indexing demo data — which
 * is the one outcome no launch-gate window may ever produce, unlike the
 * reverse (real shelters present, not yet discoverable), which
 * `docs/build-plan.md`'s launch-gate paragraph explicitly permits.
 *
 * One-way on purpose: real shelters present while the site is not yet
 * discoverable is legal (the launch-gate window). No real shelters and
 * fully discoverable is not — there would be nothing true to discover.
 *
 * Called from `instrumentation.ts`'s `register()`, which is the one place
 * in this app an eager boot-time check runs without making `next build`
 * require it — see that file's own comment for why.
 *
 * Takes both facts as parameters, defaulted to the real constants, rather
 * than reading the module bindings directly inside the body: `vi.doMock`
 * builds a *different* module namespace for the mocked import, but this
 * function (imported unchanged alongside it, e.g. via `importOriginal`)
 * still runs its own original module instance's body — mocking the
 * exported names doesn't rewrite what that instance's code reads.
 * Confirmed by trying exactly that and getting a false pass. Parameters
 * make every combination directly callable, no module mocking required.
 */
export function assertDemoDiscoverabilityInvariant(
  registryHasNoRealShelters: boolean = REGISTRY_HAS_NO_REAL_SHELTERS,
  siteIsPubliclyDiscoverable: boolean = SITE_IS_PUBLICLY_DISCOVERABLE,
): void {
  if (registryHasNoRealShelters && siteIsPubliclyDiscoverable) {
    throw new Error(
      "Invariant violated: REGISTRY_HAS_NO_REAL_SHELTERS and SITE_IS_PUBLICLY_DISCOVERABLE " +
        "are both true (apps/web/src/seo-flags.ts). The registry would be publicly " +
        "discoverable while holding no real shelters — indexing fictional data. See " +
        "docs/build-plan.md's 'Before any route is indexed' launch-gate paragraph.",
    );
  }
}
