"use client";

import { isRealPhotoKey, nearestVariant, r2PublicUrl } from "@opika/db/image-pipeline";
import type { ImageLoaderProps } from "next/image";

/**
 * Configured globally via `next.config.ts`'s `images.loaderFile`, not passed
 * as a per-instance `loader` prop — a function prop crossing from a Server
 * Component (`AnimalCard`, `apps/web/src/app/tvaryny/page.tsx`'s tree) into
 * `next/image`'s own client boundary fails at request time ("Functions
 * cannot be passed directly to Client Components"), confirmed by an actual
 * 500 on every request when this was tried as a prop first. `loaderFile`
 * sidesteps it: Next's own bundler wires this in, so no Server Component
 * ever needs to import or reference it. `"use client"` here is why the R2
 * base URL below has to be `NEXT_PUBLIC_`-prefixed, not a stylistic choice —
 * `SwipeCard.tsx` is a Client Component and mounts/unmounts real `<Image>`s
 * client-side as the deck advances, so this function genuinely runs in the
 * browser sometimes, not only during SSR.
 *
 * `AnimalPhoto.storageKey` (`packages/domain/src/animals/photo.ts`) is an
 * object key, not a URL. H1 makes that real for actual uploaded photos:
 * `isRealPhotoKey` (`packages/db/src/image-pipeline`) recognises the
 * `animals/` namespace `animalPhotoStorageKey` writes into, and only those
 * keys get routed through R2's CDN URL construction. Everything else falls
 * through to the same root-relative normalization this file always did —
 * `packages/db/src/seed.ts`'s fictional corpus still stores literal
 * `"seed-photos/dog-1.jpg"` (no leading slash — checked against the actual
 * seed data before writing `isRealPhotoKey`, not assumed), so local dev and
 * the harness keep working with zero R2 credentials, exactly as before this
 * phase.
 *
 * The leading-slash normalization below is not defensive noise: `loaderFile`
 * is global, so this runs for *every* `next/image` in the app, not only the
 * animal-photo components. Every other way a src reaches `next/image` is
 * already root-relative — a statically imported asset
 * (`/_next/static/media/…`), or the idiomatic `src="/icon.svg"` for a file
 * under `public/`. Prefixing those a second time yields `//icon.svg`, which
 * is protocol-relative: the browser resolves it to a *host* named
 * `icon.svg` and requests it off-site.
 *
 * `http(s)://` and `data:` sources pass through untouched, for the same
 * "global, not just these two cards" reason.
 *
 * `quality` is ignored for real keys, deliberately: R2 variants are
 * pre-generated at upload time (`generateVariants`, fixed WebP quality 82),
 * not transformed on request — there is no per-request quality knob to
 * honour.
 */
const ABSOLUTE_URL = /^https?:\/\//i;

export default function opikaImageLoader({ src, width }: ImageLoaderProps): string {
  if (ABSOLUTE_URL.test(src) || src.startsWith("data:")) return src;

  if (isRealPhotoKey(src)) {
    const publicBaseUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
    if (!publicBaseUrl) {
      // Same "throw, don't silently degrade" posture as requireEnv
      // (apps/web/src/api/env.ts) — a real storage key with nowhere to
      // resolve to is a broken deploy, not a case to paper over with
      // something a real shelter's photo would silently vanish behind.
      throw new Error("Missing required environment variable: NEXT_PUBLIC_R2_PUBLIC_BASE_URL");
    }
    return r2PublicUrl(publicBaseUrl, src, nearestVariant(width));
  }

  return src.startsWith("/") ? src : `/${src}`;
}
