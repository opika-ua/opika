"use client";

import type { CreatedShelterView, EmailSendOutcome, InvitationReminder } from "@opika/contracts";
import { fillTemplate, uk } from "@opika/i18n";
import { useEffect, useRef, useState } from "react";
import { Button, LinkButton } from "../../../../ui/Button";
import { Heading } from "../../../../ui/Heading";
import { Panel } from "../../../../ui/Panel";
import { Text } from "../../../../ui/Text";
import { VerificationStatusChip } from "../../StatusChips";
import { shelterPath } from "../list-params";
import {
  createRefusalOf,
  emailOutcomeMessage,
  kyivDateAndTime,
  refusalMessage,
} from "./create-outcome";
import type { RegistryCreateClient } from "./registry-create-client";

/**
 * The invitation as the screen shows it. `validUntil` is the link's expiry
 * from the created view; a resend answers with the email's outcome only, not
 * the new expiry, so after one the line is left out rather than guessed.
 */
type Invitation = {
  adminId: string;
  email: string;
  outcome: EmailSendOutcome;
  reminder: InvitationReminder;
  validUntil: Date | null;
};

type Resend = { kind: "idle" } | { kind: "sending" } | { kind: "failed"; message: string };

function invitationOf(view: CreatedShelterView): Invitation | null {
  const outcome = view.firstAdminInvitationEmail;
  const admin = view.admins[0];
  if (outcome === null || admin === undefined) return null;
  return {
    adminId: admin.id,
    email: admin.email,
    outcome,
    reminder: view.firstAdminInvitationReminder,
    validUntil: admin.invite.status === "pending" ? admin.invite.expiresAt : null,
  };
}

/**
 * S2's success state (KABINET.md S2): the status chip, the fact, what became
 * of the invitation email (IN-E7: shown directly), how long the link lasts,
 * the reminder to tell the shelter personally when an email went (IN-E13),
 * and the two next steps. No celebration.
 *
 * Every outcome but "no admin" keeps «Надіслати ще раз»: a resend retries a
 * blocked or failed email too (the invitation stays in place either way).
 * "No admin" is the race RG-T6 records: the shelter exists without one, and
 * S4's invite finishes the job.
 *
 * Focus moves to the fact on arrival, so a screen reader hears the result
 * the form was replaced by.
 */
export function CreatedShelter({
  view,
  client,
}: {
  view: CreatedShelterView;
  client: RegistryCreateClient;
}) {
  const t = uk.kabinet.operator.create;
  const [invitation, setInvitation] = useState<Invitation | null>(() => invitationOf(view));
  const [resend, setResend] = useState<Resend>({ kind: "idle" });
  const resending = useRef(false);
  const factRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    factRef.current?.focus();
  }, []);

  const onResend = async () => {
    if (invitation === null || resending.current) return;
    resending.current = true;
    setResend({ kind: "sending" });
    try {
      const result = await client.registry.admins.resendInvite({
        shelterId: view.id,
        adminId: invitation.adminId,
      });
      setInvitation({
        ...invitation,
        outcome: result.invitationEmail,
        reminder: result.invitationReminder,
        validUntil: null,
      });
      setResend({ kind: "idle" });
    } catch (error) {
      const refusal = createRefusalOf(error);
      setResend({
        kind: "failed",
        message:
          refusal.kind === "address_has_a_role"
            ? refusalMessage(refusal)
            : uk.kabinet.operator.errors.failed,
      });
    } finally {
      resending.current = false;
    }
  };

  const sent = invitation?.outcome.kind === "sent";
  const validUntil = sent && invitation?.validUntil ? kyivDateAndTime(invitation.validUntil) : null;

  return (
    <Panel
      as="section"
      aria-labelledby="created-shelter-fact"
      padding="lg"
      className="flex min-w-0 flex-col gap-4 self-start"
    >
      <span className="self-start">
        <VerificationStatusChip status={view.verification.status} />
      </span>
      <Heading level={1} look="title" id="created-shelter-fact" ref={factRef} tabIndex={-1}>
        {invitation === null ? t.createdNoInvite : t.created}
      </Heading>
      {invitation !== null ? (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-body text-ink">
            {emailOutcomeMessage(invitation.outcome, invitation.email)}
          </p>
          {validUntil !== null ? <Text>{fillTemplate(t.inviteValidUntil, validUntil)}</Text> : null}
          {invitation.reminder !== null ? <Text>{invitation.reminder.text}</Text> : null}
        </div>
      ) : null}
      {resend.kind === "failed" ? (
        <p role="alert" className="text-label text-ink">
          {resend.message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {invitation !== null ? (
          <Button
            variant="secondary"
            aria-busy={resend.kind === "sending" || undefined}
            onClick={onResend}
          >
            {t.resend}
          </Button>
        ) : null}
        <LinkButton href={shelterPath(view.id)}>{t.openShelter}</LinkButton>
      </div>
    </Panel>
  );
}
