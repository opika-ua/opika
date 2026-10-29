import type { Metadata } from "next";
import { RateLimitedScreen } from "../../../features/chrome/RateLimitedScreen";

/**
 * The branded screen as a plain static page, which `../route.ts` fetches and re-serves with a 429.
 * A page cannot choose its own status, so it is never the thing the proxy rewrites to. Reached
 * directly it answers 200; nothing links here.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function RateLimitedPage() {
  return <RateLimitedScreen />;
}
