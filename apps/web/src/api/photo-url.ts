/**
 * Turns a stored photo key into a URL the browser can actually fetch.
 *
 * `AnimalPhoto.storageKey` (`packages/domain/src/animals/photo.ts`) is an
 * object key, not a URL — CLAUDE.md's stack table says images end up on
 * Cloudflare R2 behind a CDN, but that pipeline is M7's, not built yet.
 * Until then, `storageKey` values point at files under `apps/web/public`
 * (Next serves that directory at the site root), so a root-relative path is
 * the whole function. M7 replaces this with real R2/CDN URL construction —
 * same signature, different body — not a call-site change in `AnimalCard`
 * or `SwipeCard`.
 */
export function photoUrl(storageKey: string): string {
  return `/${storageKey}`;
}
