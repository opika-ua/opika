/**
 * Self-registration's rollout switch (§11.9): `SELF_REGISTRATION_ENABLED=1` turns on the form on
 * /prytulkam, its entry points and every registration route. Anything else, unset included, is
 * off, so production stays as it is until Oleksii flips it after the real-phone rehearsal.
 * Server-side only: the page renders the section or not, and no client bundle reads it.
 */
export const SELF_REGISTRATION_FLAG = "SELF_REGISTRATION_ENABLED";

export const isSelfRegistrationEnabled = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean => env[SELF_REGISTRATION_FLAG] === "1";
