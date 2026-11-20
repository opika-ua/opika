---
name: opika-seo
description: Use for page titles, meta descriptions, canonical URLs, Open Graph, JSON-LD structured data, sitemap, robots, noindex or the pre-launch discoverability flags in Opika.
---

# Opika SEO

The code is the source of truth: read it before changing anything.

- **Titles:** `titled(subject)` and `TITLE_TEMPLATE` in `apps/web/src/brand.ts`: `Subject – Brand` with an
  en dash (U+2013), pinned by `no-em-en-dash.test.ts`. Set `title` in each page's `metadata` (Next applies
  the template); `openGraph.title` is never auto-templated, so use `titled()` there. `SITE_ORIGIN` is in
  `brand.ts`: derive `metadataBase` and canonicals from it, never a literal domain. Every title ends
  in « – Opika», one separator site-wide (owner, 2026-11-20): handoff B2 titles come from
  `uk.seo.titleWithSite` (`{title} – {site}`) through `fitTitle` (`seo-text.ts`), which drops the
  suffix past 60 characters. Never «|».
- **Descriptions:** 120 to 160 characters, unique per page, in approved Ukrainian (skill `opika-copy`).
  Add Open Graph and Twitter fields and a canonical per page.
- **Preview image:** a page that sets its own `openGraph` replaces the root's wholesale, the file-based
  `app/opengraph-image.tsx` included. Build page metadata with `seoMetadata()` (`seo/page-metadata.ts`),
  which names the site card in `og:image` and `twitter:image`; pass `"segment"` only when the route
  segment has its own `opengraph-image.tsx` (the animal page). `og-image.harness.ts` checks every
  public page type: add a new indexable route there.
- **JSON-LD:** only through the builders in `apps/web/src/seo/json-ld-builders.ts` and the `json-ld.tsx`
  component (`serializeJsonLd` escapes). Add a builder with a test rather than an inline object. Breadcrumb
  helpers exist for animal and shelter pages.
- **Sitemap:** `app/sitemap.ts` over `seo/sitemap-entries.ts` (50,000 URL limit). A new indexable route type
  gets entries and a test; noindex routes (`/dev/ui`, kabinet, error pages) never appear.
- **Error and not-found pages** also export their own `robots: { index: false, follow: false }` metadata (for example `app/tvaryny/[animalId]/not-found.tsx`), not only the `X-Robots-Tag` header.
- **Robots:** `app/robots.ts` always allows crawling; noindex is carried by the `X-Robots-Tag` header and the
  root `robots` metadata. Do not disallow crawling, it would hide the noindex.
- **Pre-launch flags:** `apps/web/src/seo-flags.ts` keeps "registry holds no real shelters" and "site is
  publicly discoverable" as two separate facts. Never merge them into one flag (standing constraints).
- Title tests sit next to the page (`metadata.test.ts`) and in `test/harness/page-titles.harness.ts`.
  The plugin skill `searchfit-seo:technical-seo` is for a pre-launch audit.
