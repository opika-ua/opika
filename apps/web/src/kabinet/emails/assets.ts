import { SITE_ORIGIN } from "../../brand";

/**
 * The emails' static files, served from the app's own `public/email/` (owner, 2026-11-20: deployed
 * with the app, no upload step). Each name carries a version suffix and a published file never
 * changes: a new look is a new name, so a mail already sent keeps the image it was sent with.
 */
export const EMAIL_ASSET_PATH = "/email/";

/** The header lockup on its cream plate, PNG @2x; width and height are its CSS pixels. */
export const EMAIL_LOGO = {
  file: "logo@2x-v1.png",
  width: 192,
  height: 64,
  markWidth: 160,
} as const;

/** Where a mail's images resolve: the live site, or a local folder for the preview. */
export type EmailAssetBase = string;

export const LIVE_ASSET_BASE: EmailAssetBase = new URL(EMAIL_ASSET_PATH, SITE_ORIGIN).toString();

export const assetUrl = (base: EmailAssetBase, file: string): string =>
  new URL(encodeURIComponent(file).replaceAll("%40", "@"), base).toString();
