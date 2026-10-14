import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { kabinetAuthAvailability } from "../../kabinet/auth-route";

/**
 * Every `/kabinet` page, behind the same condition as its API (Oleksii, Q0:
 * "screens PR first, behind the 503"). When sign-in is unavailable (always in
 * production until the invite PR adds an email provider, and in development
 * without `BETTER_AUTH_*`), `/api/auth/*` and `/api/kabinet/*` answer 503, and
 * these pages answer 404: a page that says "not available" would need
 * Ukrainian copy for a state no shelter is ever sent to, and a 404 claims
 * nothing about a feature that isn't live. The layout's 404 covers pages
 * that touch nothing, but it renders concurrently with its page and cannot
 * stop one: a page that touches auth or the database calls
 * `kabinetAuthOrNotFound()` itself, and joins `available-auth.test.ts`.
 *
 * Never indexed, whatever `SITE_IS_PUBLICLY_DISCOVERABLE` says: the cabinet is
 * not content.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** The availability is read per request: it depends on runtime env, never on the build. */
export const dynamic = "force-dynamic";

export default function KabinetLayout({ children }: { children: ReactNode }) {
  if (kabinetAuthAvailability(process.env).kind === "unavailable") notFound();
  return <div className="min-h-dvh bg-rg-page">{children}</div>;
}
