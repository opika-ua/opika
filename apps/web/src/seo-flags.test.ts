import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertDemoDiscoverabilityInvariant, verificationSuffix } from "./seo-flags";

/**
 * D-3's and D-2's tests both import `./app/layout` (for `metadata.robots`
 * and `metadata.description` respectively), and that module's top-level
 * `fonts.ts` import calls `next/font/google`/`local` — calls Next's own
 * build step transforms away, which Vitest never runs. Without this, the
 * call itself throws (`Literata is not a function`) before any test body
 * runs; the shape returned only needs to satisfy `RootLayout`'s JSX
 * (`.variable`), which these tests never render anyway.
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
 * The `firstRun.promise` swap is covered by its own describe block further
 * down this file, keyed on `REGISTRY_HAS_NO_REAL_SHELTERS`; the deck's demo
 * banner and the detail page's badge suppression are covered where they
 * render (`DeckScreen.test.tsx`, `animal-detail.harness.ts`) rather than
 * here, since neither's markup is reachable from this file's imports.
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
 * Found 2026-09-10 (Oleksii, not a test): `AnimalCard.tsx` and
 * `SwipeCard.tsx` both rendered a verified shelter's "· перевірений" suffix
 * unconditionally, with no reference to `REGISTRY_HAS_NO_REAL_SHELTERS`
 * anywhere — the one badge that got its own gate right
 * (`AnimalDetailScreen.tsx`'s `shelterVerifiedYears`) did so per-component,
 * not from a shared place, so the next two surfaces inherited nothing from
 * that fix. `verificationSuffix` is the shared gate both cards now call.
 *
 * Tested via the explicit second parameter, not `vi.doMock` — the function
 * closes over its own module instance's `REGISTRY_HAS_NO_REAL_SHELTERS`
 * binding, so a mocked module namespace's override never reaches it once
 * the function itself is copied across via `...importOriginal()`. Same
 * limitation `assertDemoDiscoverabilityInvariant`'s own doc comment already
 * documents; the parameter default exists for exactly this reason.
 */
describe("verificationSuffix", () => {
  it("suppresses the suffix for a verified shelter while the registry holds no real shelters", () => {
    expect(verificationSuffix("verified", true)).toBeNull();
  });

  it("suppresses for an unverified shelter regardless of the demo flag", () => {
    expect(verificationSuffix("unverified", true)).toBeNull();
    expect(verificationSuffix("unverified", false)).toBeNull();
  });

  it("shows the suffix for a verified shelter once real shelters exist", () => {
    expect(verificationSuffix("verified", false)).toBe(" · перевірений");
  });

  it("defaults to the real constant — suppresses today's actual state, no real shelters", () => {
    expect(verificationSuffix("verified")).toBeNull();
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

/**
 * Transcribed from `uk.ts`, not imported from it — the describe blocks below
 * assert `metadata.description`/`openGraph.description` against these, and
 * comparing against the same constant the code renders would pass against
 * any value that constant happens to hold, including an accidentally-deleted
 * one.
 */
const DEMO_BANNER_NOTICE =
  "У реєстрі поки немає справжніх притулків — усі картки тут демонстраційні.";
const REAL_PROMISE =
  "Тварини з перевірених притулків Київщини. Перегляньте список і подивіться, кого шукає дім.";

/**
 * D-2: a shared link's preview must not claim verified shelters exist while
 * the registry holds none — this is the root layout's **default**, which
 * every route inherits unless it overrides its own `description`.
 * `/tvaryny/[animalId]` does (own describe block further down); `/prytulkam`
 * and `/pro` do too, deliberately NOT with this swap (see their own describe
 * blocks below — Option B, 2026-09-06, `docs/observations.md`). Varied
 * independently of `SITE_IS_PUBLICLY_DISCOVERABLE` — same discipline as the
 * describe block above — so this doesn't pass for a consumer that actually
 * reads the wrong flag.
 */
describe("REGISTRY_HAS_NO_REAL_SHELTERS — root layout's default description swap (D-2)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("uses the demo banner notice while the registry holds no real shelters", async () => {
    vi.doMock("./seo-flags", () => ({
      SITE_IS_PUBLICLY_DISCOVERABLE: false,
      REGISTRY_HAS_NO_REAL_SHELTERS: true,
      assertDemoDiscoverabilityInvariant: vi.fn(),
    }));

    const { metadata } = await import("./app/layout");

    expect(metadata.description).toBe(DEMO_BANNER_NOTICE);
    expect(metadata.openGraph?.description).toBe(DEMO_BANNER_NOTICE);
  });

  it("uses the real promise at the launch-gate window — real shelters, still not discoverable", async () => {
    vi.doMock("./seo-flags", () => ({
      SITE_IS_PUBLICLY_DISCOVERABLE: false,
      REGISTRY_HAS_NO_REAL_SHELTERS: false,
      assertDemoDiscoverabilityInvariant: vi.fn(),
    }));

    const { metadata } = await import("./app/layout");

    expect(metadata.description).toBe(REAL_PROMISE);
    expect(metadata.openGraph?.description).toBe(REAL_PROMISE);
  });

  it("uses the real promise once fully launched", async () => {
    vi.doMock("./seo-flags", () => ({
      SITE_IS_PUBLICLY_DISCOVERABLE: true,
      REGISTRY_HAS_NO_REAL_SHELTERS: false,
      assertDemoDiscoverabilityInvariant: vi.fn(),
    }));

    const { metadata } = await import("./app/layout");

    expect(metadata.description).toBe(REAL_PROMISE);
    expect(metadata.openGraph?.description).toBe(REAL_PROMISE);
  });
});

/**
 * Option B, 2026-09-06 (`docs/observations.md`): `/prytulkam` is the link
 * Oleksii sends to shelters directly — its own `description`/
 * `openGraph.description` is `uk.forShelters.whatThisIs`, its existing §1
 * sentence, and this page's `metadata` object does not read either
 * seo-flags constant at all. `vi.doMock` here is therefore a no-op today
 * (this page imports no such thing) rather than a demonstration that this
 * override "wins" over the root layout's default — that part is Next's
 * metadata-resolution behaviour (a child's own `description` replaces the
 * parent's, verified separately by building and reading the served HTML,
 * not by this unit test). What `it.each` actually guards: if a future edit
 * ever makes this page read `REGISTRY_HAS_NO_REAL_SHELTERS` after all, the
 * mock stops being a no-op and this test starts noticing.
 */
describe("/prytulkam — description is its own opening sentence, never the demo swap", () => {
  it.each([true, false])(
    "uses uk.forShelters.whatThisIs when REGISTRY_HAS_NO_REAL_SHELTERS=%s",
    async (registryHasNoRealShelters) => {
      vi.resetModules();
      vi.doMock("./seo-flags", () => ({
        SITE_IS_PUBLICLY_DISCOVERABLE: false,
        REGISTRY_HAS_NO_REAL_SHELTERS: registryHasNoRealShelters,
        assertDemoDiscoverabilityInvariant: vi.fn(),
      }));

      const { metadata } = await import("./app/prytulkam/page");

      const whatThisIs =
        "Opika — реєстр тварин із перевірених притулків Київщини, де кожен ваш підопічний отримує власну сторінку.";
      expect(metadata.description).toBe(whatThisIs);
      expect(metadata.openGraph?.description).toBe(whatThisIs);
      expect(metadata.description).not.toBe(DEMO_BANNER_NOTICE);
    },
  );
});

/**
 * Same reasoning as `/prytulkam` above, for `/pro` — its own `uk.about.intro`,
 * and the same caveat about what the `it.each` parameterisation does and
 * does not prove today.
 */
describe("/pro — description is its own opening sentence, never the demo swap", () => {
  it.each([true, false])(
    "uses uk.about.intro when REGISTRY_HAS_NO_REAL_SHELTERS=%s",
    async (registryHasNoRealShelters) => {
      vi.resetModules();
      vi.doMock("./seo-flags", () => ({
        SITE_IS_PUBLICLY_DISCOVERABLE: false,
        REGISTRY_HAS_NO_REAL_SHELTERS: registryHasNoRealShelters,
        assertDemoDiscoverabilityInvariant: vi.fn(),
      }));

      const { metadata } = await import("./app/pro/page");

      const intro =
        "Opika — реєстр тварин притулків Київщини, який я роблю сам, поза роботою. Немає команди, немає інвестора — є одна людина, яка вважає, що знайти дім для тварини не повинно залежати від того, чи вміє притулок вести застарілий Excel-файл.";
      expect(metadata.description).toBe(intro);
      expect(metadata.openGraph?.description).toBe(intro);
      expect(metadata.description).not.toBe(DEMO_BANNER_NOTICE);
    },
  );
});

/**
 * D-2, corrected: the root layout's swap does not reach
 * `/tvaryny/[animalId]` at all — Next does not merge a route's own
 * `generateMetadata` with the root layout's, it overrides it, and this
 * route builds its own `description`/`openGraph.description` from the
 * animal's age/size. Without its own demo swap this route would preview a
 * fictional animal's age and size with no demo-data disclosure — exactly
 * the shared-link surface `/prytulkam` tells shelters they can paste into
 * Telegram, so the one route this disclosure matters on most.
 *
 * `anonymousRouterClient` is mocked rather than hitting a real database —
 * this test is about the swap in `generateMetadata`, which `animals.byId`'s
 * own integration coverage elsewhere does not touch.
 */
describe("REGISTRY_HAS_NO_REAL_SHELTERS — /tvaryny/[animalId] link-preview description swap (D-2)", () => {
  const fakeAnimal = {
    id: "a0000000-0000-4000-8000-000000000001",
    name: "Мурчик",
    ageBucket: "adult",
    size: "medium",
    photos: [],
  };

  beforeEach(() => {
    vi.resetModules();
    vi.doMock("./api/server-client", () => ({
      anonymousRouterClient: () => ({
        animals: { byId: async () => fakeAnimal },
      }),
    }));
  });

  afterEach(() => {
    vi.doUnmock("./api/server-client");
  });

  it("uses the demo promise while the registry holds no real shelters", async () => {
    vi.doMock("./seo-flags", () => ({
      SITE_IS_PUBLICLY_DISCOVERABLE: false,
      REGISTRY_HAS_NO_REAL_SHELTERS: true,
      assertDemoDiscoverabilityInvariant: vi.fn(),
    }));

    const { generateMetadata } = await import("./app/tvaryny/[animalId]/page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ animalId: fakeAnimal.id }),
    });

    expect(metadata.description).toBe(DEMO_BANNER_NOTICE);
    expect(metadata.openGraph?.description).toBe(DEMO_BANNER_NOTICE);
  });

  it("uses the animal's own age/size at the launch-gate window — real shelters, still not discoverable", async () => {
    // Deliberately does NOT vary both flags in lockstep with the case above
    // — `(SITE=false, REGISTRY=false)` here vs. `(SITE=false, REGISTRY=true)`
    // above. Two cases that only ever move opposite each other cannot tell a
    // correct consumer (reads `REGISTRY_HAS_NO_REAL_SHELTERS`) from one that
    // actually reads `!SITE_IS_PUBLICLY_DISCOVERABLE` instead — both flags
    // are `false`-ish together in both of this file's other cases, so this
    // is the one case that actually distinguishes which constant the route
    // reads. Same discipline as the layout describe block further up this
    // file.
    vi.doMock("./seo-flags", () => ({
      SITE_IS_PUBLICLY_DISCOVERABLE: false,
      REGISTRY_HAS_NO_REAL_SHELTERS: false,
      assertDemoDiscoverabilityInvariant: vi.fn(),
    }));

    const { generateMetadata } = await import("./app/tvaryny/[animalId]/page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ animalId: fakeAnimal.id }),
    });

    // Transcribed from `uk.ts`'s cardMeta section, not derived via
    // `ageBucketLabel`/`sizeLabel` — same reasoning as above.
    expect(metadata.description).toBe("дорослий · середня");
    expect(metadata.openGraph?.description).toBe("дорослий · середня");
  });

  it("uses the animal's own age/size once fully launched", async () => {
    vi.doMock("./seo-flags", () => ({
      SITE_IS_PUBLICLY_DISCOVERABLE: true,
      REGISTRY_HAS_NO_REAL_SHELTERS: false,
      assertDemoDiscoverabilityInvariant: vi.fn(),
    }));

    const { generateMetadata } = await import("./app/tvaryny/[animalId]/page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ animalId: fakeAnimal.id }),
    });

    expect(metadata.description).toBe("дорослий · середня");
    expect(metadata.openGraph?.description).toBe("дорослий · середня");
  });
});
