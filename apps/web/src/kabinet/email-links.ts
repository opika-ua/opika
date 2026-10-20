/**
 * Where the two emailed links land, matching docs/h2-invite-confirm-shapes.md
 * (feat/h2-invite-confirm); change them here if those routes move. The
 * sign-in confirm page's GET shows one button and only its POST consumes the
 * token; the invite page's GET likewise shows one button, and only its POST
 * sends a fresh magic link to the invited address (EM-Q3). Neither invite
 * step is itself a sign-in (IN-Q3).
 */
export const SIGN_IN_LINK = { path: "/kabinet/vkhid/pidtverdzhennia", param: "token" } as const;
export const INVITE_LINK = { path: "/kabinet/vkhid", param: "zaproshennia" } as const;

/** An absolute link on `base` (no trailing slash needed) carrying `value` in the link's one parameter. */
export function linkTo(
  base: string,
  target: { path: string; param: string },
  value: string,
): string {
  const url = new URL(target.path, `${base.replace(/\/+$/, "")}/`);
  url.searchParams.set(target.param, value);
  return url.toString();
}

/**
 * The reset link (PW-1, §4.1): the new-password page, whose GET looks nothing
 * up and only shows the form; its POST goes to Better Auth's `/reset-password`,
 * which consumes the token.
 */
export const RESET_LINK = { path: "/kabinet/vkhid/novyi-parol", param: "token" } as const;
