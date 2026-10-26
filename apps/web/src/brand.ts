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
 * The site's `<title>` and its link-preview headline, next to the name they are built from
 * (audit 2026-10-22, G6): they were typed in `app/layout.tsx`, outside the catalogue and
 * outside this file, so a rename would have missed them. `%s` is Next's title template slot.
 */
export const SITE_TITLE = `${WORDMARK} - тварини з притулків Київщини`;
export const TITLE_TEMPLATE = `%s - ${WORDMARK}`;
