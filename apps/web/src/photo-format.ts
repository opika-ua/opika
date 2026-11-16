import { isRealPhotoKey, SHELTER_LOGO_KEY_PATTERN } from "@opika/db/image-pipeline";

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
