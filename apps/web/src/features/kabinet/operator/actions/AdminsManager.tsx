"use client";

import type { RegistryShelterView, ShelterAdminView } from "@opika/contracts";
import { fillTemplate, uk } from "@opika/i18n";
import { type FormEvent, useId, useRef, useState } from "react";
import { z } from "zod";
import { Button, TextField } from "../../../controls/controls";
import { ModalDialog } from "../../../controls/ModalDialog";
import { formatDate } from "../format";
import { type ActionRefusal, emailOutcomeText } from "./action-result";
import { useOperatorActions } from "./operator-actions";
import { ACTIONS, BODY, CAPTION, NOTICE, STRONG } from "./styles";

const OWNER = "admins";

type AddressRole = "shelter_admin" | "operator" | "invited_elsewhere";

/**
 * What the list says after an admin action. At the list, not on the row, so
 * it survives the row it is about leaving the page (a removal, an admin gone
 * meanwhile).
 */
type Notice =
  | { kind: "none" }
  | { kind: "email"; text: string; reminder: string | null }
  | { kind: "gone" }
  | { kind: "address_has_a_role"; reason: AddressRole }
  | { kind: "failed" };

type InviteErrors = { name: string | null; email: string | null };
const NO_ERRORS: InviteErrors = { name: null, email: null };

const isEmail = (value: string): boolean => z.email().safeParse(value).success;

/** The address as `adminsOf` stores it, for finding an invitation on a re-read. */
const sameAddress = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

const statusLine = (admin: ShelterAdminView, now: Date): string => {
  const t = uk.kabinet.operator.admins;
  if (admin.invite.status === "accepted") return t.joined;
  return admin.invite.expiresAt.getTime() > now.getTime()
    ? fillTemplate(t.invitedUntil, { date: formatDate(admin.invite.expiresAt) })
    : t.invitedExpired;
};

/**
 * S4's admins, with what the operator does to them: remove (asked first,
 * since every session ends at once, RG-Q6), resend a pending invitation, and
 * invite another address. Invite and resend show what became of the email
 * (IN-E7), and the reminder to tell the shelter personally when one was sent
 * (IN-E13). An address that has a role elsewhere is refused with which role.
 *
 * Mounted in S4's admins section in place of R-UI 1's read-only rows
 * (`ShelterActionsScreen`); the section keeps its heading. `now` is the
 * page's request time, for "valid until" vs "expired".
 */
export function AdminsManager({ now }: { now: Date }) {
  const { view, phase, run } = useOperatorActions();
  const t = uk.kabinet.operator.admins;
  const errors = uk.kabinet.operator.errors;
  const [notice, setNotice] = useState<Notice>({ kind: "none" });
  const [confirming, setConfirming] = useState<ShelterAdminView | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const inviteId = useId();
  // The removed row is gone with the re-read: focus goes to the list, or,
  // once the last admin is gone, to the invite form's first field.
  const focusAfterRemoval = () =>
    requestAnimationFrame(() =>
      (listRef.current ?? document.getElementById(`${inviteId}-name`))?.focus(),
    );
  const busy = phase.kind !== "idle";
  const mine = busy && phase.owner === OWNER;

  const remove = async (admin: ShelterAdminView) => {
    if (busy) return;
    setNotice({ kind: "none" });
    const settled = await run({
      owner: OWNER,
      call: (client) => client.registry.admins.remove({ shelterId: view.id, adminId: admin.id }),
      landed: (fresh) => !fresh.admins.some((other) => other.id === admin.id),
    });
    if (settled.kind === "busy") return;
    setConfirming(null);
    if (settled.kind === "ok" || (settled.kind === "lost" && settled.landed)) {
      focusAfterRemoval();
      return;
    }
    if (settled.kind === "refused" && settled.failure.kind === "not_found") {
      setNotice(settled.reread === "done" ? { kind: "gone" } : { kind: "failed" });
      focusAfterRemoval();
      return;
    }
    setNotice({ kind: "failed" });
  };

  const resend = async (admin: ShelterAdminView) => {
    if (busy || admin.invite.status !== "pending") return;
    setNotice({ kind: "none" });
    const expiresBefore = admin.invite.expiresAt.getTime();
    const settled = await run({
      owner: OWNER,
      call: (client) =>
        client.registry.admins.resendInvite({ shelterId: view.id, adminId: admin.id }),
      // A resend renews the link for the full 72 hours: a later expiry is the resend, done.
      landed: (fresh) =>
        fresh.admins.some(
          (other) =>
            other.id === admin.id &&
            other.invite.status === "pending" &&
            other.invite.expiresAt.getTime() > expiresBefore,
        ),
    });
    switch (settled.kind) {
      case "busy":
        return;
      case "ok":
        setNotice({
          kind: "email",
          text: emailOutcomeText(settled.value.invitationEmail, admin.email),
          reminder: settled.value.invitationReminder?.text ?? null,
        });
        return;
      case "lost":
        // Done or not, what became of the email is unknown: say nothing about it.
        setNotice(settled.landed ? { kind: "none" } : { kind: "failed" });
        return;
      case "refused":
        setNotice(refusalNotice(settled.failure, settled.reread));
        return;
      /* v8 ignore next 4 -- exists so the compiler rejects an unhandled outcome; unreachable at runtime */
      default: {
        const unreachable: never = settled;
        return unreachable;
      }
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {view.admins.length === 0 ? (
        <p className={CAPTION}>{t.none}</p>
      ) : (
        <ul ref={listRef} tabIndex={-1} className="flex flex-col gap-3">
          {view.admins.map((admin) => (
            <AdminRow
              key={admin.id}
              admin={admin}
              now={now}
              busy={busy}
              onRemove={(opener) => {
                if (busy) return;
                openerRef.current = opener;
                setNotice({ kind: "none" });
                setConfirming(admin);
              }}
              onResend={() => resend(admin)}
            />
          ))}
        </ul>
      )}

      <p role="status" className={NOTICE}>
        {mine && phase.kind === "checking"
          ? errors.lostAnswer
          : notice.kind === "email"
            ? notice.text
            : notice.kind === "gone"
              ? t.gone
              : null}
      </p>
      {notice.kind === "email" && notice.reminder !== null ? (
        <p className={BODY}>{notice.reminder}</p>
      ) : null}
      {notice.kind === "failed" ? (
        <p role="alert" className={NOTICE}>
          {errors.failed}
        </p>
      ) : null}
      {notice.kind === "address_has_a_role" ? (
        <p role="alert" className={NOTICE}>
          {uk.kabinet.operator.create.errors.addressHasARole[notice.reason]}
        </p>
      ) : null}

      <InviteAdminForm id={inviteId} view={view} onNotice={setNotice} />

      {confirming !== null ? (
        <ModalDialog
          title={fillTemplate(t.removeConfirm.title, { name: confirming.name })}
          body={t.removeConfirm.body}
          closeLabel={uk.kabinet.profileEdit.pause.close}
          onClose={() => {
            setConfirming(null);
            const opener = openerRef.current;
            requestAnimationFrame(() => opener?.focus());
          }}
        >
          <div className="flex flex-col-reverse gap-2 tablet:flex-row tablet:justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                setConfirming(null);
                const opener = openerRef.current;
                requestAnimationFrame(() => opener?.focus());
              }}
            >
              {uk.kabinet.profileEdit.pause.cancel}
            </Button>
            <Button
              aria-disabled={busy || undefined}
              aria-busy={mine || undefined}
              onClick={() => remove(confirming)}
            >
              {t.remove}
            </Button>
          </div>
        </ModalDialog>
      ) : null}
    </div>
  );
}

/** A refusal of resend or invite, as the list says it. */
function refusalNotice(failure: ActionRefusal, reread: "done" | "failed" | "not_needed"): Notice {
  if (failure.kind === "address_has_a_role")
    return { kind: "address_has_a_role", reason: failure.reason };
  if (failure.kind === "not_found")
    return reread === "done" ? { kind: "gone" } : { kind: "failed" };
  return { kind: "failed" };
}

function AdminRow({
  admin,
  now,
  busy,
  onRemove,
  onResend,
}: {
  admin: ShelterAdminView;
  now: Date;
  busy: boolean;
  onRemove: (opener: HTMLButtonElement) => void;
  onResend: () => void;
}) {
  const t = uk.kabinet.operator.admins;
  const nameId = useId();
  return (
    <li className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <span id={nameId} className={STRONG}>
          {admin.name}
        </span>
        <span className={CAPTION}>
          {admin.email} · {statusLine(admin, now)}
        </span>
      </div>
      <div className={ACTIONS}>
        {admin.invite.status === "pending" ? (
          <Button
            variant="secondary"
            aria-disabled={busy || undefined}
            aria-describedby={nameId}
            onClick={onResend}
          >
            {t.resend}
          </Button>
        ) : null}
        <Button
          variant="text"
          aria-disabled={busy || undefined}
          aria-describedby={nameId}
          onClick={(event) => onRemove(event.currentTarget)}
        >
          {t.remove}
        </Button>
      </div>
    </li>
  );
}

/**
 * «Запросити ще одного»: another admin for this shelter, by name and address
 * (the first admin came with create, RU-Q6). The address is trimmed before it
 * is sent: the contract checks it as an email as typed.
 */
function InviteAdminForm({
  id,
  view,
  onNotice,
}: {
  /** Its fields' id prefix, so the list can send focus here. */
  id: string;
  view: RegistryShelterView;
  onNotice: (notice: Notice) => void;
}) {
  const { phase, run } = useOperatorActions();
  const t = uk.kabinet.operator;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [fieldErrors, setFieldErrors] = useState<InviteErrors>(NO_ERRORS);
  const busy = phase.kind !== "idle";
  const mine = busy && phase.owner === OWNER;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const typedName = name.trim();
    const typedEmail = email.trim();
    const problems: InviteErrors = {
      name: typedName === "" ? t.create.errors.required : null,
      email:
        typedEmail === ""
          ? t.create.errors.required
          : isEmail(typedEmail)
            ? null
            : uk.kabinet.profileEdit.errors.emailFormat,
    };
    setFieldErrors(problems);
    if (problems.name !== null || problems.email !== null) {
      document.getElementById(problems.name !== null ? `${id}-name` : `${id}-email`)?.focus();
      return;
    }
    onNotice({ kind: "none" });
    const settled = await run({
      owner: OWNER,
      call: (client) =>
        client.registry.admins.invite({ shelterId: view.id, name: typedName, email: typedEmail }),
      landed: (fresh) => fresh.admins.some((admin) => sameAddress(admin.email, typedEmail)),
    });
    const clear = () => {
      setName("");
      setEmail("");
    };
    switch (settled.kind) {
      case "busy":
        return;
      case "ok":
        clear();
        onNotice({
          kind: "email",
          text: emailOutcomeText(settled.value.invitationEmail, settled.value.email),
          reminder: settled.value.invitationReminder?.text ?? null,
        });
        return;
      case "lost":
        if (settled.landed) {
          // Invited, but what became of the email is unknown: the row is the message.
          clear();
          onNotice({ kind: "none" });
        } else {
          onNotice({ kind: "failed" });
        }
        return;
      case "refused":
        if (settled.failure.kind === "address_has_a_role") {
          setFieldErrors({
            name: null,
            email: t.create.errors.addressHasARole[settled.failure.reason],
          });
          document.getElementById(`${id}-email`)?.focus();
          return;
        }
        onNotice(refusalNotice(settled.failure, settled.reread));
        return;
      /* v8 ignore next 4 -- exists so the compiler rejects an unhandled outcome; unreachable at runtime */
      default: {
        const unreachable: never = settled;
        return unreachable;
      }
    }
  };

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3">
      <TextField
        id={`${id}-name`}
        label={t.create.adminName}
        value={name}
        autoComplete="off"
        error={fieldErrors.name}
        onChange={(event) => setName(event.target.value)}
      />
      <TextField
        id={`${id}-email`}
        label={uk.kabinet.signIn.emailLabel}
        type="email"
        value={email}
        autoComplete="off"
        error={fieldErrors.email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <Button
        type="submit"
        variant="secondary"
        className="self-start"
        aria-disabled={busy || undefined}
        aria-busy={mine || undefined}
      >
        {t.admins.inviteAnother}
      </Button>
    </form>
  );
}
