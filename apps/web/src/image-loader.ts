"use client";

import type { ImageLoaderProps } from "next/image";

/**
 * Configured globally via `next.config.ts`'s `images.loaderFile`, not passed
 * as a per-instance `loader` prop — a function prop crossing from a Server
 * Component (`AnimalCard`, `apps/web/src/app/tvaryny/page.tsx`'s tree) into
 * `next/image`'s own client boundary fails at request time ("Functions
 * cannot be passed directly to Client Components"), confirmed by an actual
 * 500 on every request when this was tried as a prop first. `loaderFile`
 * sidesteps it: Next's own bundler wires this in, so no Server Component
 * ever needs to import or reference it.
 *
 * `AnimalPhoto.storageKey` (`packages/domain/src/animals/photo.ts`) is an
 * object key, not a URL — CLAUDE.md's stack table says images end up on
 * Cloudflare R2 behind a CDN, but that pipeline is M7/H1's, not built yet.
 * Until then, `storageKey` values point at files under `apps/web/public`
 * (Next serves that directory at the site root), so a root-relative path is
 * the whole function. Ignores `width`/`quality` — this stub has no real
 * variants to serve at different sizes; H1 is where both halves become
 * real.
 *
 * The leading-slash check is not defensive noise: `loaderFile` is global, so
 * this runs for *every* `next/image` in the app, not only the two card
 * components that hand it a bare storage key. Every other way a src reaches
 * `next/image` is already root-relative — a statically imported asset
 * (`/_next/static/media/…`), or the idiomatic `src="/icon.svg"` for a file
 * under `public/`. Prefixing those a second time yields `//icon.svg`, which
 * is protocol-relative: the browser resolves it to a *host* named
 * `icon.svg` and requests it off-site. That fails as a silently broken
 * image with nothing in typecheck, lint or the build to catch it, and the
 * first person to add an `<Image>` outside these two cards would have hit
 * it. Not "unlikely" — see `docs/standing-constraints.md`.
 *
 * `http(s)://` and `data:` sources pass through untouched, for the same
 * "global, not just these two cards" reason — and because H1's entire job is
 * to make this function return a real CDN URL (`https://cdn.…`) instead of a
 * root-relative one. Without this guard, the stub would prefix H1's own
 * output and break the thing it exists to become.
 */
const ABSOLUTE_URL = /^https?:\/\//i;

export default function opikaImageLoader({ src }: ImageLoaderProps): string {
  if (ABSOLUTE_URL.test(src) || src.startsWith("data:")) return src;
  return src.startsWith("/") ? src : `/${src}`;
}
