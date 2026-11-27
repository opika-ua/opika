import type { Metadata } from "next";
import { expect } from "vitest";
import { SITE_ORIGIN } from "../brand";

/** The page's `og:url` is its canonical, absolute and on the site's own origin. */
export function expectOgUrlIsCanonical(metadata: Metadata, canonicalPath: string): void {
  expect(metadata.alternates?.canonical).toBe(canonicalPath);
  const url = String(metadata.openGraph?.url);
  expect(url).toBe(new URL(canonicalPath, SITE_ORIGIN).href);
  expect(new URL(url).origin).toBe(SITE_ORIGIN);
}
