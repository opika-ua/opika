import { SITE_ORIGIN, WORDMARK, WORDMARK_CYRILLIC } from "../brand";
import { GALLERY_PATH } from "../features/chrome/gallery-path";
import { LOGO_ICON } from "../pwa";

export type JsonLdObject = Readonly<Record<string, unknown>>;

export type Crumb = { readonly name: string; readonly path: string };

/** Absolute URL for a site path; JSON-LD consumers reject relative URLs. */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_ORIGIN).toString();
}

/** Only profiles the owner has supplied the exact URL for (2026-11-18); never a guessed one. */
export const ORGANIZATION_SAME_AS = ["https://www.instagram.com/opika.ua/"] as const;

/** Google reads the site name from this on the home page (the gallery, at `/`). */
export function webSiteJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: WORDMARK,
    alternateName: [WORDMARK_CYRILLIC, new URL(SITE_ORIGIN).host],
    url: absoluteUrl("/"),
  };
}

export function organizationJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: WORDMARK,
    url: absoluteUrl("/"),
    logo: absoluteUrl(LOGO_ICON.src),
    sameAs: [...ORGANIZATION_SAME_AS],
  };
}

/** Positions are 1-based and follow the array order, as schema.org requires. */
export function breadcrumbListJsonLd(crumbs: readonly Crumb[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

/** A city's landing page as a breadcrumb level: its name as the page headings print it, and its path. */
export type CityCrumb = { readonly name: string; readonly path: string };

/**
 * The trail gallery > city > animal. The city level is left out when the caller has no city page
 * for it (a city with no indexable animal has none), so no item ever points at a 404.
 */
export function galleryTrail(
  galleryName: string,
  city: CityCrumb | null,
  animal: { readonly id: string; readonly name: string } | null,
): readonly Crumb[] {
  return [
    { name: galleryName, path: GALLERY_PATH },
    ...(city ? [city] : []),
    ...(animal ? [{ name: animal.name, path: `/tvaryny/${animal.id}` }] : []),
  ];
}

export function animalBreadcrumbs(
  galleryName: string,
  animal: { readonly id: string; readonly name: string },
  city: CityCrumb | null = null,
): JsonLdObject {
  return breadcrumbListJsonLd(galleryTrail(galleryName, city, animal));
}

export function cityBreadcrumbs(galleryName: string, city: CityCrumb): JsonLdObject {
  return breadcrumbListJsonLd(galleryTrail(galleryName, city, null));
}

export function shelterBreadcrumbs(
  galleryName: string,
  shelter: { readonly id: string; readonly displayName: string },
): JsonLdObject {
  return breadcrumbListJsonLd([
    { name: galleryName, path: GALLERY_PATH },
    { name: shelter.displayName, path: `/prytulky/${shelter.id}` },
  ]);
}

/** `<` escaped so a name containing `</script>` cannot end the script element early. */
export function serializeJsonLd(data: JsonLdObject): string {
  return JSON.stringify(data).replace(/</g, () => "\\u003c");
}
