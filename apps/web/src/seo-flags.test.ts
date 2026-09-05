import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertDemoDiscoverabilityInvariant } from "./seo-flags";

/**
 * D-3's tests import `./app/layout` for its `metadata.robots`, and that
 * module's top-level `fonts.ts` import calls `next/font/google`/`local` —
 * calls Next's own build step transforms away, which Vitest never runs.
 * Without this, the call itself throws (`Literata is not a function`)
 * before any test body runs; the shape returned only needs to satisfy
 * `RootLayout`'s JSX (`.variable`), which this test never renders anyway.
 */
vi.mock("next/font/google", () => ({
  Literata: () => ({ variable: "--font-literata" }),
  Commissioner: () => ({ variable: "--font-commissioner" }),
}));
vi.mock("next/font/local", () => ({
  default: () => ({ variable: "--font-e-ukraine" }),
}));

/**
 * `vi.doMock` registers a factory that stays active for the rest of this
 * file — `vi.resetModules()` alone clears the module cache, not the
 * registered mock. Tests run in file order, so the very first describe
 * block below ("SITE_IS_PUBLICLY_DISCOVERABLE — single source ...") is the
 * one that leaks forward: whichever of its `doMock("./seo-flags", ...)`
 * calls ran last (its factory stubs the assertion function as a no-op)
 * silently answers every later dynamic import of `./seo-flags` in this
 * file, including from describe blocks that never called `doMock`
 * themselves — it is the block ABOVE the affected tests that leaks, not
 * below. Found by the one invariant test that expects a throw going red
 * (the stub is a no-op, so it never throws) while the three
 * `not.toThrow()` tests stayed green for the wrong reason — they imported
 * the same stub, and a no-op never throws either.
 */
afterEach(() => {
  vi.doUnmock("./seo-flags");
});

/**
 * D-1/D-3: proves `next.config.ts`'s `headers()` and the root layout's
 * `robots` metadata both derive their noindex behaviour from
 * `SITE_IS_PUBLICLY_DISCOVERABLE` specifically — not merely from "some flag
 * in this module" — rather than each hand-maintaining its own copy of the
 * same decision. `vi.doMock` replaces the one module both consumers import
 * from; if either consumer stopped reading it, that consumer's assertion
 * below would fail to move with the mock while the other one still did,
 * which is exactly the drift this test exists to catch.
 *
 * `app/robots.ts` is asserted separately, once, outside this describe block
 * — D-3 made it unconditional (always `allow: "/"`), specifically so a
 * crawler can reach the header and the metadata this test does cover. It no
 * longer reads the flag at all, so it has nothing to vary here.
 *
 * The three cases deliberately do NOT vary both constants in lockstep. Two
 * cases that only ever move opposite each other (`SITE=false,REGISTRY=true`
 * then `SITE=true,REGISTRY=false`) cannot tell a correct consumer from one
 * that reads `!REGISTRY_HAS_NO_REAL_SHELTERS` instead — both would produce
 * identical output in either case, and the STOP this file exists to guard
 * against was exactly that the two facts had been treated as
 * interchangeable. The `REGISTRY=false,SITE=false` case is where they
 * diverge — the launch-gate window itself — and is the one case that
 * actually distinguishes which constant a consumer reads.
 *
 * Doesn't cover the demo banner or the `firstRun.promise` swap yet — D-2
 * hasn't built either. Add them here, keyed on
 * `REGISTRY_HAS_NO_REAL_SHELTERS`, when it does.
 */
describe("SITE_IS_PUBLICLY_DISCOVERABLE — single source for noindex behaviour", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("sends X-Robots-Tag and noindex metadata when the flag is false", async () => {
    vi.doMock("./seo-flags", () => ({
      SITE_IS_PUBLICLY_DISCOVERABLE: false,
      REGISTRY_HAS_NO_REAL_SHELTERS: true,
      assertDemoDiscoverabilityInvariant: vi.fn(),
    }));

    const { metadata } = await import("./app/layout");
    const nextConfig = (await import("../next.config")).default;

    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(await nextConfig.headers?.()).toEqual([
      { source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ]);
  });

  it("stays noindex at the launch-gate window — real shelters present, still not discoverable", async () => {
    vi.doMock("./seo-flags", () => ({
      SITE_IS_PUBLICLY_DISCOVERABLE: false,
      REGISTRY_HAS_NO_REAL_SHELTERS: false,
      assertDemoDiscoverabilityInvariant: vi.fn(),
    }));

    const { metadata } = await import("./app/layout");
    const nextConfig = (await import("../next.config")).default;

    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(await nextConfig.headers?.()).toEqual([
      { source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ]);
  });

  it("sends indexable metadata and no header when the flag is true", async () => {
    vi.doMock("./seo-flags", () => ({
      SITE_IS_PUBLICLY_DISCOVERABLE: true,
      REGISTRY_HAS_NO_REAL_SHELTERS: false,
      assertDemoDiscoverabilityInvariant: vi.fn(),
    }));

    const { metadata } = await import("./app/layout");
    const nextConfig = (await import("../next.config")).default;

    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(await nextConfig.headers?.()).toEqual([]);
  });
});

/**
 * D-3: `app/robots.ts` no longer reads `SITE_IS_PUBLICLY_DISCOVERABLE` at
 * all — it always allows crawling, unconditionally, so that a crawler can
 * actually reach the `X-Robots-Tag` header and `robots` metadata the
 * describe block above covers. No flag to vary, so a single assertion
 * (not a per-flag-value case) is the correct amount of test here.
 */
describe("app/robots.ts — always allows crawling", () => {
  it("always allows — reads no flag at all", async () => {
    const robots = (await import("./app/robots")).default;
    expect(robots().rules).toEqual({ userAgent: "*", allow: "/" });
  });
});

/**
 * The one relationship the two constants are allowed to have: the registry
 * can never simultaneously hold no real shelters AND be publicly
 * discoverable. The reverse (real shelters present, not yet discoverable)
 * is `docs/build-plan.md`'s launch-gate window and must NOT throw.
 *
 * These test only that the function throws — not that a thrown error in
 * `instrumentation.ts`'s `register()` actually prevents a Next.js instance
 * from serving requests. It's the neighbouring `validateEnv()` call's own
 * documented behaviour that a throw there becomes per-request 500s rather
 * than a hard boot refusal (`apps/web/src/api/env.ts`); this function's
 * real-world guarantee is the same as that one's, not stronger. The actual
 * gate this test suite provides is catching the forbidden combination in
 * CI, on the real constants, before either reaches a deploy.
 *
 * Imports `assertDemoDiscoverabilityInvariant` statically (top of file),
 * not via `await import("./seo-flags")` like the describe block above —
 * a dynamic import here would resolve to whatever the previous block's
 * `vi.doMock` last registered if that file-level `afterEach` were ever
 * weakened, and the mocked factory stubs this very function as a no-op.
 * A no-op never throws, so the throw-expecting test below would go red as
 * a false alarm, while the three `not.toThrow()` tests — including
 * "defaults to the real constants", the actual day-to-day CI gate — would
 * stay green for the wrong reason: the exact failure mode this suite
 * exists to catch would itself go undetected. The static import is bound
 * before any `doMock` call runs, so it is immune to that leak regardless
 * of the afterEach.
 */
describe("assertDemoDiscoverabilityInvariant", () => {
  it("throws when no real shelters exist AND the site is publicly discoverable", () => {
    expect(() => assertDemoDiscoverabilityInvariant(true, true)).toThrowError(
      /REGISTRY_HAS_NO_REAL_SHELTERS.*SITE_IS_PUBLICLY_DISCOVERABLE/s,
    );
  });

  it("permits real shelters present while not yet discoverable — the launch-gate window", () => {
    expect(() => assertDemoDiscoverabilityInvariant(false, false)).not.toThrow();
  });

  it("permits the fully-launched state — real shelters, publicly discoverable", () => {
    expect(() => assertDemoDiscoverabilityInvariant(false, true)).not.toThrow();
  });

  it("defaults to the real constants — permits today's actual state, no real shelters and not discoverable", () => {
    expect(() => assertDemoDiscoverabilityInvariant()).not.toThrow();
  });
});

/**
 * `/tvaryny/gortaty` must stay noindex regardless of either constant — its
 * reason is permanent SEO ownership (`/tvaryny` is the canonical surface),
 * not demo-data honesty. Exercises all four combinations so a future edit
 * that makes this route read either flag is caught immediately, rather than
 * discovered when the site is publicly discoverable and the deck starts
 * competing with the gallery for the same search traffic.
 */
describe("/tvaryny/gortaty noindex — independent of both seo-flags constants", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it.each([
    [true, false],
    [true, true],
    [false, false],
    [false, true],
  ])(
    "stays noindex when REGISTRY_HAS_NO_REAL_SHELTERS=%s and SITE_IS_PUBLICLY_DISCOVERABLE=%s",
    async (registryHasNoRealShelters, siteIsPubliclyDiscoverable) => {
      vi.doMock("./seo-flags", () => ({
        REGISTRY_HAS_NO_REAL_SHELTERS: registryHasNoRealShelters,
        SITE_IS_PUBLICLY_DISCOVERABLE: siteIsPubliclyDiscoverable,
        assertDemoDiscoverabilityInvariant: vi.fn(),
      }));

      const { metadata } = await import("./app/tvaryny/gortaty/page");
      expect(metadata.robots).toEqual({ index: false, follow: false });
    },
  );
});
