"use server";

import type { RegistrationTokenPurpose } from "@opika/db/repos";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { RegistrationLinkState } from "./email-link-route";
import { servedRegistrationLinkOutcome } from "./email-link-runtime";

/**
 * The button's POST on the email-link pages: the token from the form body, the request's own
 * Origin, through `registrationLinkOutcome`. A refused Origin acts on nothing and shows the
 * expired card, as a token that no longer works would.
 */
async function submit(
  purpose: RegistrationTokenPurpose,
  form: FormData,
): Promise<RegistrationLinkState> {
  const origin = (await headers()).get("origin");
  const outcome = await servedRegistrationLinkOutcome(purpose, { method: "POST", origin, form });
  if (outcome.kind === "not_found") notFound();
  return outcome.kind === "page" ? outcome.state : { kind: "expired" };
}

// One action per link, not a bound purpose: a bound argument comes back from the browser.
export async function submitConfirmEmailLink(
  _previous: RegistrationLinkState,
  form: FormData,
): Promise<RegistrationLinkState> {
  return submit("confirm_email", form);
}

export async function submitNotMeLink(
  _previous: RegistrationLinkState,
  form: FormData,
): Promise<RegistrationLinkState> {
  return submit("not_me", form);
}
