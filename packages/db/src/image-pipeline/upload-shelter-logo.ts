import type { ImageStorageClient } from "./r2-client";
import { LOGO_VARIANT_NAMES, type LogoVariantName, variantObjectKey } from "./variants";

/**
 * Puts one logo's two variants under its storage key (pet card PR 3b): the logo's counterpart of
 * `storePhoto`, with its own variant set and no kept source, since a logo is never cropped.
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
