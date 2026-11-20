/**
 * The error codes the kabinet's password endpoints answer with, shared by the
 * server (`auth.ts`'s hooks, Better Auth itself) and the browser forms that
 * turn each into one of Oleksii's sentences. No imports, so a client component
 * can read it without pulling in server code (the common list above all,
 * `common-passwords.ts`).
 *
 * The two length codes are Better Auth's own, so its second-line refusal and
 * ours read the same; the other two are ours (§9 answer 2).
 */
export const PASSWORD_REFUSAL_CODES = {
  too_short: "PASSWORD_TOO_SHORT",
  too_long: "PASSWORD_TOO_LONG",
  contains_personal: "PASSWORD_CONTAINS_PERSONAL",
  common: "PASSWORD_COMMON",
} as const;

export type PasswordRefusal = keyof typeof PASSWORD_REFUSAL_CODES;

/** Better Auth's codes the forms also tell apart (`@better-auth/core`'s BASE_ERROR_CODES). */
export const AUTH_ERROR_CODES = {
  /** Every sign-in failure, whatever its cause (§5): one code, one sentence. */
  invalidCredentials: "INVALID_EMAIL_OR_PASSWORD",
  /** A reset link that is unknown, used, expired, or names someone who may not reset. */
  invalidToken: "INVALID_TOKEN",
  /** «Змінити пароль» with a wrong current password. */
  invalidPassword: "INVALID_PASSWORD",
  /** «Змінити пароль» for an admin who has never set a password. */
  noCredential: "CREDENTIAL_ACCOUNT_NOT_FOUND",
} as const;

/** The per-address sign-in delay's code; its body carries `retryAfterMinutes` (§4.3). */
export const SIGN_IN_DELAYED_CODE = "SIGN_IN_DELAYED";

/**
 * A refusal because the limiter store could not be asked (owner, 2026-11-20: sign-in stays fail
 * closed, with an honest error). The same body for every address and IP; it says no wait time.
 */
export const LIMITER_UNAVAILABLE_CODE = "RATE_LIMITER_UNAVAILABLE";

/** The password refusal a code names, or null for any other code. */
export function passwordRefusalOf(code: unknown): PasswordRefusal | null {
  for (const [refusal, value] of Object.entries(PASSWORD_REFUSAL_CODES)) {
    if (value === code) return refusal as PasswordRefusal;
  }
  return null;
}

/**
 * The magic-link request refused by its limiter, over the limit or with the store down (owner,
 * 2026-11-20): the card says «Зараз не вдалося надіслати лист…» instead of «sent». Decided before
 * any account is read, so the answer is the same for every address.
 */
export const SIGN_IN_LINK_NOT_SENT_CODE = "SIGN_IN_LINK_NOT_SENT";
