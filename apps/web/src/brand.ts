/**
 * The product's name, in one place (moved here from `features/chrome/SiteHeader.tsx`, which
 * re-exports it, so server code can read it without loading a component). It is deliberately
 * not in `packages/i18n`'s catalogues or in `packages/domain`/`packages/contracts`: CLAUDE.md's
 * "the name is not final" rule puts a brand string in app-level config, and it is identical in
 * every locale, so it is not a translation unit. One constant, one file to change if the name
 * changes. Read by the header's wordmark and by the password policy, which refuses a password
 * containing the site's name (`kabinet/password-checks.ts`).
 */
export const WORDMARK = "Opika";

/**
 * The fixed public domain, for `metadataBase` (`app/layout.tsx`) and every page's
 * `alternates.canonical`. A literal, never `VERCEL_URL`/`VERCEL_PROJECT_PRODUCTION_URL`
 * (owner, PR B SEO review, 2026-10-26) - the same reasoning `PRODUCTION_ORIGIN`
 * (`kabinet/production-sign-in.ts`) already applies to the auth origin, but as a
 * build-time constant rather than an env var: a canonical URL has to point at the real
 * public domain on every deploy, preview included, not at whatever hostname served the
 * request.
 */
export const SITE_ORIGIN = "https://opika.org.ua";

/**
 * The subject only - no brand suffix. `app/layout.tsx`'s root `title.default` uses it
 * as-is (Next never runs a segment's own `template` against its own `default`, so the
 * root's fallback title - reached by any route with no explicit title of its own,
 * which today means the two error boundaries, both `not-found.tsx` files, and
 * `/tvaryny/gortaty` (owner: no title change there) - renders subject-only, brand-less;
 * a minor, accepted gap, and every one of those routes is noindex anyway). `/tvaryny`
 * (`app/tvaryny/
 * page.tsx`) sets this as its own explicit `title`, which Next *does* run through the
 * template, producing the real brand-suffixed title. `titled()` below does the same
 * job manually for the one place that bypasses the template entirely: `openGraph.title`,
 * which Next never auto-templates when it's set explicitly.
 */
export const SITE_TITLE = "Собаки й коти з притулків України";

/**
 * `%s` is Next's title-template slot. The separator is an en dash (U+2013) – an instance
 * of the repo's own dash rule (owner, PR B SEO review, 2026-10-26, verbatim: "The title
 * separator is « – » (U+2013)... No «-» or «—»."), not an exception to it: en dash is
 * the general clause separator (`docs/standing-constraints.md`'s "Dash characters" rule,
 * #208). What's specific to this one location is that it's pinned by a dedicated test –
 * `apps/web/src/no-em-en-dash.test.ts` checks for exactly this character here, not its
 * absence – rather than resting on the written rule alone, the way a comment does.
 */
export const TITLE_TEMPLATE = `%s – ${WORDMARK}`;

/** `openGraph.title` is never auto-templated by Next, unlike the HTML `<title>` tag. */
export function titled(subject: string): string {
  return TITLE_TEMPLATE.replace("%s", subject);
}
