import { OG_CONTENT_TYPE, OG_SIZE, siteOgImage } from "../seo/og-image";

export const alt = "";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return siteOgImage();
}
