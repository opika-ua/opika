/**
 * The «Притулок схвалено» banner's dismissal (owner, 2026-11-18): a kabinet-only cookie holding the
 * shelter's id, so it is the dismissal of that shelter's banner and no other. HttpOnly: only the
 * server reads it, to render the list without the banner.
 */
export const APPROVED_DISMISSED_COOKIE = "kabinet.approved_dismissed";

/** A year: the banner has no reason to come back. */
const MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export const approvedDismissedCookieOptions = (production: boolean) =>
  ({
    httpOnly: true,
    sameSite: "lax",
    secure: production,
    path: "/kabinet",
    maxAge: MAX_AGE_SECONDS,
  }) as const;

/** Whether this browser closed the banner for this shelter. */
export const approvedDismissedFor = (shelterId: string, cookieValue: string | undefined): boolean =>
  cookieValue === shelterId;
