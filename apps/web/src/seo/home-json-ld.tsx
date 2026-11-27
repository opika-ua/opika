import { SITE_IS_PUBLICLY_DISCOVERABLE } from "../seo-flags";
import { JsonLd } from "./json-ld";
import { organizationJsonLd, webSiteJsonLd } from "./json-ld-builders";

/**
 * Home page only (the gallery, at `/`): Google reads the site name from WebSite there and
 * recommends Organization on the home page, not site-wide, which also keeps it off every page's HTML.
 */
export function HomeJsonLd({
  discoverable = SITE_IS_PUBLICLY_DISCOVERABLE,
}: {
  discoverable?: boolean;
}) {
  return (
    <>
      <JsonLd data={webSiteJsonLd()} discoverable={discoverable} />
      <JsonLd data={organizationJsonLd()} discoverable={discoverable} />
    </>
  );
}
