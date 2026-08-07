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
 */
export default function opikaImageLoader({ src }: ImageLoaderProps): string {
  return src.startsWith("/") ? src : `/${src}`;
}
