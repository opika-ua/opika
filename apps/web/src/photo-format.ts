import { isRealPhotoKey, r2PublicUrl, SHELTER_LOGO_KEY_PATTERN } from "@opika/db/image-pipeline";

/**
 * Whether an animal photo is served as AVIF (with a WebP fallback). Build-time flag: a photo uploaded
 * before AVIF has no such object until the backfill, and a `<source>` that 404s shows a broken image
 * rather than falling back. Logos stay WebP only. Not in `image-loader.ts`: Server Components call it.
 */
export function servesAvif(src: string): boolean {
  return (
    process.env.NEXT_PUBLIC_R2_AVIF === "1" &&
    isRealPhotoKey(src) &&
    !SHELTER_LOGO_KEY_PATTERN.test(src)
  );
}

/**
 * A shelter logo's one URL, or null for anything else. The ladder starts at 176 and a logo's
 * largest variant is 160, so every width the srcset offered was `large.webp` again; this is it.
 */
export function logoPhotoUrl(src: string): string | null {
  if (!SHELTER_LOGO_KEY_PATTERN.test(src)) return null;
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  if (!base)
    throw new Error("Missing required environment variable: NEXT_PUBLIC_R2_PUBLIC_BASE_URL");
  return r2PublicUrl(base, src, "large", "webp");
}
