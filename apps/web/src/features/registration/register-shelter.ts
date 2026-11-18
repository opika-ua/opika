"use server";

import type { RegistrationResult } from "@opika/contracts";

/**
 * The registration form's server action (spec §13.1, plan Agent 1), typed in Phase 0. Agent 1
 * implements it: `RegistrationInputSchema`, the honeypot and the signed fill time, the per-IP and
 * per-address limits, one atomic write (`inOneTransaction`: user, password, organization,
 * membership, the shelter in `application`, the `public_link` evidence, `shelter_registered`)
 * through `packages/db/src/repos/self-registration-repo.ts` (the guard in
 * `no-self-serve-yet.test.ts` names it), the funnel's `registered`, the confirmation email, then
 * `{ kind: "registered", next }` for a full page load. Never `redirect()` into /kabinet (#509);
 * without JavaScript, a 303. Unreachable while `SELF_REGISTRATION_ENABLED` is off: nothing renders
 * the form.
 */
export async function registerShelter(
  _previous: RegistrationResult | null,
  _form: FormData,
): Promise<RegistrationResult> {
  return { kind: "failed" };
}
