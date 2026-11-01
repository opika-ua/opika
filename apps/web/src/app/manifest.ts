import type { MetadataRoute } from "next";
import { PAGE_COLOR, PWA_ICONS, PWA_NAMES } from "../pwa";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PWA_NAMES.name,
    short_name: PWA_NAMES.shortName,
    start_url: "/tvaryny",
    scope: "/",
    display: "standalone",
    lang: "uk",
    theme_color: PAGE_COLOR,
    background_color: PAGE_COLOR,
    icons: PWA_ICONS.map((icon) => ({ ...icon })),
  };
}
