import { describe, expect, it } from "vitest";
import { metadata } from "./page";

/**
 * `/tvaryny`'s own `metadata` export (PR B, the SEO review of page titles) owns only
 * `title` and `alternates.canonical` - no `description`, no `openGraph`. Found on
 * review: a child's `openGraph` replaces the root layout's whole object rather than
 * merging into it, so setting one here was silently dropping the root's `siteName`/
 * `locale` from every gallery link preview. The root layout's own description/openGraph
 * (`app/layout.tsx`, `seo-flags.test.ts` covers its D-2 ternary) is what actually
 * answers both once this page leaves them unset, and inheriting it is exactly the
 * point - one definition of the non-demo link-preview sentence, not two that can drift.
 */
describe("/tvaryny's own metadata", () => {
  it("title is the subject alone - the root template appends the brand", () => {
    expect(metadata.title).toBe("Собаки й коти з притулків України");
  });

  it("canonical is always the bare path, regardless of any filter/sort/page query", () => {
    expect(metadata.alternates?.canonical).toBe("/tvaryny");
  });

  it("sets no description or openGraph of its own - the root layout's apply by inheritance", () => {
    expect(metadata.description).toBeUndefined();
    expect(metadata.openGraph).toBeUndefined();
  });
});
