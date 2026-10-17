"use client";

import type { CreatedShelterView, EmailSendOutcome, InvitationReminder } from "@opika/contracts";
import { fillTemplate, uk } from "@opika/i18n";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button, buttonClass } from "../../../controls/controls";
import { BODY, CARD, CARD_TITLE, ERROR_TEXT } from "../../profile-edit/styles";
import { createRefusalOf, emailOutcomeMessage, kyivDateAndTime } from "./create-outcome";
import type { RegistryCreateClient } from "./registry-create-client";

/** S4, one shelter. R-UI 1 serves it. */
export const shelterPagePath = (shelterId: string): string => `/kabinet/prytulky/${shelterId}`;

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
            ? t.errors.addressHasARole[refusal.reason]
            : uk.kabinet.operator.errors.failed,
      });
    } finally {
      resending.current = false;
    }
  };

  const sent = invitation?.outcome.kind === "sent";
  const validUntil = sent && invitation?.validUntil ? kyivDateAndTime(invitation.validUntil) : null;

  return (
    <section aria-labelledby="created-shelter-fact" className={`${CARD} self-start`}>
      <span className="inline-flex min-h-8 items-center self-start rounded-rg-chip border-2 border-dashed border-rg-ink-3 px-3 text-sm font-medium text-rg-ink-2">
        {uk.kabinet.profileStatus[view.verification.status]}
      </span>
      <h1 id="created-shelter-fact" ref={factRef} tabIndex={-1} className={CARD_TITLE}>
        {invitation === null ? t.createdNoInvite : t.created}
      </h1>
      {invitation !== null ? (
        <div className="flex flex-col gap-2">
          <p role="status" className={BODY}>
            {emailOutcomeMessage(invitation.outcome, invitation.email)}
          </p>
          {validUntil !== null ? (
            <p className={BODY}>{fillTemplate(t.inviteValidUntil, validUntil)}</p>
          ) : null}
          {invitation.reminder !== null ? <p className={BODY}>{invitation.reminder.text}</p> : null}
        </div>
      ) : null}
      {resend.kind === "failed" ? (
        <p role="alert" className={ERROR_TEXT}>
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
        <Link href={shelterPagePath(view.id)} className={buttonClass("primary")}>
          {t.openShelter}
        </Link>
      </div>
    </section>
  );
}
