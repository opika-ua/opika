"use client";

import { fillTemplate, uk } from "@opika/i18n";
import { useActionState } from "react";
import { OPERATOR_CONTACT } from "../../../brand";
import type { RegistrationLinkState } from "../../../kabinet/registration/email-link-route";
import { Button, LinkButton } from "../../../ui/Button";
import { InlineStatus } from "../../../ui/feedback";
import { Heading } from "../../../ui/Heading";
import { Text } from "../../../ui/Text";
import { CardFrame } from "../password/CardFrame";
import { useTokenOutOfAddressBar } from "../password/use-token-out-of-address-bar";
import { SHELTER_HOME } from "../routes";

export type EmailLinkPurpose = "confirm_email" | "not_me";

type Props = {
  purpose: EmailLinkPurpose;
  initial: RegistrationLinkState;
  action: (previous: RegistrationLinkState, form: FormData) => Promise<RegistrationLinkState>;
  /** The bare path: without JS the form posts here, so the token travels only in the body. */
  permalink: string;
};

/**
 * One card for both email links, before and after the button (R3): the GET's state first, then
 * whatever the action answered. A client island only for `useActionState`.
 */
export function EmailLinkCard({ purpose, initial, action, permalink }: Props) {
  useTokenOutOfAddressBar();
  const [state, formAction, pending] = useActionState(action, initial, permalink);
  const email = uk.kabinet.email.applicationConfirm;
  const heading = purpose === "confirm_email" ? email.action : email.notYouAction;
  const contact = { email: OPERATOR_CONTACT.email };
  const titleId = `email-link-${purpose}-title`;
  return (
    <CardFrame titleId={titleId}>
      <Heading level={1} look="title" id={titleId}>
        {heading}
      </Heading>
      {(() => {
        switch (state.kind) {
          case "form": {
            const prompt =
              purpose === "not_me"
                ? uk.registration.notMePrompt
                : state.email === null
                  ? null
                  : fillTemplate(uk.registration.confirmEmailPrompt, { email: state.email });
            return (
              <form action={formAction} className="flex flex-col gap-6">
                {prompt === null ? null : (
                  <Text look="body" className="text-ink-2">
                    {prompt}
                  </Text>
                )}
                <input type="hidden" name="token" value={state.token} />
                <Button
                  type="submit"
                  size="lg"
                  status={pending ? "loading" : "idle"}
                  className="w-full"
                >
                  {heading}
                </Button>
              </form>
            );
          }
          case "expired":
            // «Це не я» is for someone who never registered: no way into a kabinet they don't have.
            if (purpose === "not_me") {
              return (
                <div role="alert">
                  <Text look="body" className="text-ink-2">
                    {fillTemplate(uk.registration.notMeLinkExpired, contact)}
                  </Text>
                </div>
              );
            }
            return (
              <>
                <div role="alert">
                  <Text look="body" className="text-ink-2">
                    {uk.registration.confirmLinkExpired}
                  </Text>
                </div>
                <LinkButton href={SHELTER_HOME} size="lg" className="w-full">
                  {uk.forShelters.signInLink}
                </LinkButton>
              </>
            );
          case "confirmed":
            return (
              <>
                <InlineStatus tone="success">{uk.registration.emailConfirmed}</InlineStatus>
                <LinkButton href={SHELTER_HOME} size="lg" className="w-full">
                  {uk.forShelters.signInLink}
                </LinkButton>
              </>
            );
          case "withdrawn":
            return (
              <InlineStatus tone="success">
                {fillTemplate(uk.registration.notMeDone, contact)}
              </InlineStatus>
            );
          case "approved":
            return (
              <InlineStatus tone="info">
                {fillTemplate(uk.registration.notMeAfterApproval, contact)}
              </InlineStatus>
            );
          /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind */
          default: {
            const unreachable: never = state;
            return unreachable;
          }
        }
      })()}
    </CardFrame>
  );
}
