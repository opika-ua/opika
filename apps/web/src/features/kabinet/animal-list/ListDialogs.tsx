"use client";

import { KABINET_WITHDRAWAL_CODES, WITHDRAWAL_NOTE_MAX_CHARACTERS } from "@opika/contracts";
import { fillTemplate, uk } from "@opika/i18n";
import { type ReactNode, useId, useState } from "react";
import { Button } from "../../../ui/Button";
import { InlineStatus } from "../../../ui/feedback";
import { Select, TextArea } from "../../../ui/form";
import { Modal } from "../../../ui/Modal";
import { Text } from "../../../ui/Text";

/**
 * K2's three confirmations (N15, the kit's `Modal`; `locked` while a call is in flight): «Уже
 * вдома» and «Зняти з показу», the two moves that take an animal out of view
 * (KAB:155), and «Видалити чернетку». Each primary runs the call it names and
 * resolves to null when it went through (the list then closes the dialog), or
 * to the sentence that says why not, shown here. None of the ways out closes
 * a dialog while its call is in flight: closed then, a refusal would land on a
 * dialog that is gone and be shown nowhere (the pause dialog's rule).
 *
 * The secondary button, the ✕ and the withdrawal's fields are K4's pause
 * dialog's own words (`profileEdit.pause.*`, K2 sheet §1): «Скасувати»,
 * «Закрити», «Причина», «Оберіть причину», «Коментар» and its hint, which is
 * true of this note too (only the shelter's admins and the support view see a
 * K2 row, and no public view carries a withdrawn animal).
 */

const t = uk.kabinet.animalList;
const pause = uk.kabinet.profileEdit.pause;

export type DialogResult = string | null;

function DialogFrame({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  /** Null when it went through; otherwise the sentence to show. */
  onConfirm: () => Promise<DialogResult | "invalid">;
  onClose: () => void;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const close = () => {
    if (!busy) onClose();
  };
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setRefusal(null);
    const result = await onConfirm();
    setBusy(false);
    if (result === "invalid") return;
    if (result !== null) setRefusal(result);
  };
  return (
    <Modal
      open
      title={title}
      description={body}
      closeLabel={pause.close}
      locked={busy}
      onClose={close}
    >
      {children}
      {refusal !== null ? <InlineStatus tone="error">{refusal}</InlineStatus> : null}
      <div className="flex flex-col-reverse gap-2 tablet:flex-row tablet:justify-end">
        <Button variant="secondary" onClick={close}>
          {pause.cancel}
        </Button>
        <Button variant="primary" aria-busy={busy || undefined} onClick={() => void confirm()}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/** «Уже вдома»: says it can't be undone (his answer 8a; adopted is terminal, H2-7). No reason field. */
export function AdoptDialog({
  name,
  onConfirm,
  onClose,
}: {
  name: string;
  onConfirm: () => Promise<DialogResult>;
  onClose: () => void;
}) {
  return (
    <DialogFrame
      title={fillTemplate(t.adoptDialog.title, { name })}
      body={t.adoptDialog.body}
      confirmLabel={t.adoptDialog.confirm}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}

export type WithdrawalCodeChoice = (typeof KABINET_WITHDRAWAL_CODES)[number];

/**
 * «Зняти з показу» with a reason: the four codes the kabinet writes (his
 * answer 10; `adopted_elsewhere` is a label for rows that already carry it,
 * never offered), his hint pointing a homed animal to «Уже вдома», and an
 * optional note, cut at the contract's cap. No reason chosen: the select is
 * marked invalid and focused, with no message (K4-T17's precedent; «Оберіть
 * причину» is already its placeholder).
 */
export function WithdrawDialog({
  name,
  onConfirm,
  onClose,
}: {
  name: string;
  onConfirm: (reason: { code: WithdrawalCodeChoice; note: string | null }) => Promise<DialogResult>;
  onClose: () => void;
}) {
  const id = useId();
  const reasonId = `${id}-reason`;
  const [code, setCode] = useState<WithdrawalCodeChoice | "">("");
  const [note, setNote] = useState("");
  const [missingReason, setMissingReason] = useState(false);

  const confirm = async (): Promise<DialogResult | "invalid"> => {
    if (code === "") {
      setMissingReason(true);
      document.getElementById(reasonId)?.focus();
      return "invalid";
    }
    const trimmed = note.trim();
    return onConfirm({ code, note: trimmed === "" ? null : trimmed });
  };

  return (
    <DialogFrame
      title={fillTemplate(t.withdrawDialog.title, { name })}
      body={t.withdrawDialog.body}
      confirmLabel={t.withdrawDialog.confirm}
      onConfirm={confirm}
      onClose={onClose}
    >
      <Text>{t.withdrawDialog.adoptedHint}</Text>
      <Select
        id={reasonId}
        label={pause.reasonLabel}
        value={code}
        required
        aria-invalid={missingReason || undefined}
        onChange={(event) => {
          setCode(event.target.value as WithdrawalCodeChoice | "");
          setMissingReason(false);
        }}
      >
        <option value="" disabled>
          {pause.reasonPlaceholder}
        </option>
        {KABINET_WITHDRAWAL_CODES.map((option) => (
          <option key={option} value={option}>
            {t.withdrawReason[option]}
          </option>
        ))}
      </Select>
      <TextArea
        id={`${id}-note`}
        label={
          <>
            {pause.noteLabel}{" "}
            <span className="text-ink-2">{uk.kabinet.profileEdit.donation.optional}</span>
          </>
        }
        value={note}
        maxLength={WITHDRAWAL_NOTE_MAX_CHARACTERS}
        onChange={(event) => setNote(event.target.value)}
        hint={<p>{pause.noteHint}</p>}
      />
    </DialogFrame>
  );
}

/**
 * «Видалити чернетку», on every draft (K2-T4). The photos line only when the
 * draft has photos (his answer 8b): nothing deletes a stored file (P-Q14). A
 * refusal is his one sentence for `WAS_PUBLISHED`, whichever cause the server
 * had (K-Q9, commitment #2).
 */
export function DeleteDialog({
  name,
  hasPhotos,
  onConfirm,
  onClose,
}: {
  name: string;
  hasPhotos: boolean;
  onConfirm: () => Promise<DialogResult>;
  onClose: () => void;
}) {
  return (
    <DialogFrame
      title={fillTemplate(t.deleteDialog.title, { name })}
      body={t.deleteDialog.body}
      confirmLabel={t.deleteDialog.confirm}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      {hasPhotos ? <Text>{t.deleteDialog.photosStay}</Text> : null}
    </DialogFrame>
  );
}
