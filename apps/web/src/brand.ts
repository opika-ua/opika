/**
 * The product's name, in one place. App-level config, not `packages/i18n`/domain/contracts:
 * it is the same in every locale (CLAUDE.md, "the name is final: keep it out of the domain").
 */
export const WORDMARK = "Opika";

/** The Cyrillic spelling people also search for; WebSite `alternateName` (Google site names). */
export const WORDMARK_CYRILLIC = "Опіка";

/**
 * The fixed public domain for `metadataBase` and canonicals. A literal, never `VERCEL_URL`
 * (owner, 2026-10-26): a canonical must name the real domain on every deploy, preview included.
 */
export const SITE_ORIGIN = "https://opika.org.ua";

/**
 * The subject only. The root `title.default` uses it as-is (Next never templates a segment's own
 * default); `/tvaryny` sets it as an explicit `title`, which Next does template.
 */
export const SITE_TITLE = "Собаки й коти з притулків України";

/** The separator is an en dash (owner, 2026-10-26), pinned by `no-em-en-dash.test.ts`. */
export const TITLE_TEMPLATE = `%s – ${WORDMARK}`;

/** `openGraph.title` is never auto-templated by Next, unlike the HTML `<title>` tag. */
export function titled(subject: string): string {
  return TITLE_TEMPLATE.replace("%s", subject);
}
