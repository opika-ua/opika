"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { stripKabinetQuery } from "./analytics-url";

/**
 * Vercel Analytics and Speed Insights, as the root layout mounts them: cookieless, a no-op
 * without JS (aggregate page views, and Core Web Vitals from real devices). A client component
 * because `beforeSend` is a function, which a server layout can't hand across the boundary.
 * Both get the same `beforeSend`, so no kabinet page's query string (a sign-in token, the
 * operator's search text) ever reaches either (Oleksii's decisions, verbatim in `analytics-url.ts`).
 */
export function SiteAnalytics() {
  return (
    <>
      <Analytics beforeSend={stripKabinetQuery} />
      <SpeedInsights beforeSend={stripKabinetQuery} />
    </>
  );
}
