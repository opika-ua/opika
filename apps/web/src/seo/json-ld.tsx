import { SITE_IS_PUBLICLY_DISCOVERABLE } from "../seo-flags";
import { type JsonLdObject, serializeJsonLd } from "./json-ld-builders";

/**
 * Renders nothing while the site is not publicly discoverable, so pre-launch
 * pages carry no structured data. `discoverable` is a parameter for tests only.
 */
export function JsonLd({
  data,
  discoverable = SITE_IS_PUBLICLY_DISCOVERABLE,
}: {
  data: JsonLdObject;
  discoverable?: boolean;
}) {
  if (!discoverable) return null;
  return (
    <script type="application/ld+json" suppressHydrationWarning>
      {serializeJsonLd(data)}
    </script>
  );
}
