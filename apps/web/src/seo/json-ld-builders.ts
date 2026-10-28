import { SITE_ORIGIN, WORDMARK } from "../brand";

export type JsonLdObject = Readonly<Record<string, unknown>>;

export type Crumb = { readonly name: string; readonly path: string };

/** Absolute URL for a site path; JSON-LD consumers reject relative URLs. */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_ORIGIN).toString();
}

export function organizationJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: WORDMARK,
    url: absoluteUrl("/"),
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

export function animalBreadcrumbs(
  galleryName: string,
  animal: { readonly id: string; readonly name: string },
): JsonLdObject {
  return breadcrumbListJsonLd([
    { name: galleryName, path: "/tvaryny" },
    { name: animal.name, path: `/tvaryny/${animal.id}` },
  ]);
}

export function shelterBreadcrumbs(
  galleryName: string,
  shelter: { readonly id: string; readonly displayName: string },
): JsonLdObject {
  return breadcrumbListJsonLd([
    { name: galleryName, path: "/tvaryny" },
    { name: shelter.displayName, path: `/prytulky/${shelter.id}` },
  ]);
}

/** `<` escaped so a name containing `</script>` cannot end the script element early. */
export function serializeJsonLd(data: JsonLdObject): string {
  return JSON.stringify(data).replace(/</g, () => "\\u003c");
}
