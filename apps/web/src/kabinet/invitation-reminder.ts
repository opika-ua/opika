import type { EmailSendOutcome, InvitationReminder } from "@opika/contracts";
import { uk } from "@opika/i18n";

/**
 * The reminder the operator gets after an invitation email goes out
 * (IN-E13, Oleksii, verbatim: "after a successful invite send, the procedure
 * result and later the operator UI show a reminder to tell the shelter
 * personally"). Why it exists (IN-E6): the delivery test's invite landed in
 * Gmail's Promotions tab, so the email alone may never be seen.
 *
 * Any `sent` counts as successful here, `blockCheck: "unknown"` included
 * (default taken, inbox IN-E13): the email did go, and an unchecked send is
 * the one most in need of a personal word. `blocked` and `failed` get none:
 * nothing reached the provider to point anyone at.
 *
 * `{sender}` is the configured From address, never typed into the copy (the
 * name is not final). Where nothing really sends (development's console),
 * there is no address, and the placeholder stays visible rather than blank.
 */
export function invitationReminderOf(
  outcome: EmailSendOutcome,
  fromAddress: string | null,
): InvitationReminder {
  if (outcome.kind !== "sent") return null;
  const template = uk.kabinet.registry.inviteSent.tellPersonally;
  return {
    kind: "tell_personally",
    text: fromAddress === null ? template : template.replaceAll("{sender}", fromAddress),
  };
}
