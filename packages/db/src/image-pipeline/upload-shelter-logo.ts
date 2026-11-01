import type { ImageStorageClient } from "./r2-client";
import { LOGO_VARIANT_NAMES, type LogoVariantName, variantObjectKey } from "./variants";

/**
 * Puts one logo's two variants under its storage key - the logo's own
 * `storePhotoVariants` (pet card PR 3b), separate because the variant set
 * differs (`LOGO_VARIANT_NAMES`, not `IMAGE_VARIANT_NAMES`); the shape of the
 * loop is otherwise identical.
 */
export async function storeLogoVariants(
  storage: ImageStorageClient,
  storageKey: string,
  variants: Record<LogoVariantName, Buffer>,
): Promise<void> {
  for (const name of LOGO_VARIANT_NAMES) {
    await storage.put(variantObjectKey(storageKey, name), variants[name], "image/webp");
  }
}
