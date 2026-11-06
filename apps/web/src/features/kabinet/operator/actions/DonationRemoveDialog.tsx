"use client";

import "../../../../zod-client-config";
import { OperatorNoteSchema } from "@opika/contracts";
import { type DonationRemovalCode, DonationRemovalCodeSchema } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { useId, useState } from "react";
import { Button } from "../../../../ui/Button";
import { Select, TextArea } from "../../../../ui/form";
import { Modal } from "../../../../ui/Modal";
import { useOperatorActions } from "./operator-actions";
import { NOTICE } from "./styles";

export type RemoveOutcome = "removed" | "conflict" | "failed";

/**
 * Takes the live link away, with a reason code and a note, both required; the shelter reads the
 * note verbatim. The version read travels with the call, so a link changed meanwhile is
 * CONFLICT: the page is read again and the dialog closes onto the current link. A failure that
 * leaves the removal possible keeps the dialog open with the note as typed. Like the reason
 * dialog, it cannot be closed while its request is in flight.
 */
export function DonationRemoveDialog({
  owner,
  onClose,
  onDone,
}: {
  owner: string;
  onClose: () => void;
  onDone: (outcome: RemoveOutcome) => void;
}) {
  const { view, phase, run } = useOperatorActions();
  const t = uk.kabinet.operator.donation.removeDialog;
  const reasonDialog = uk.kabinet.operator.reasonDialog;
  const pause = uk.kabinet.profileEdit.pause;
  const id = useId();
  const [code, setCode] = useState<DonationRemovalCode | "">("");
  const [note, setNote] = useState("");
  const [failed, setFailed] = useState(false);

  const mine = phase.kind !== "idle" && phase.owner === owner;
  const close = () => {
    if (!mine) onClose();
  };
  const ready = code !== "" && note.trim() !== "";

  const onConfirm = async () => {
    if (code === "" || note.trim() === "" || phase.kind !== "idle") return;
    setFailed(false);
    const input = {
      shelterId: view.id,
      expectedVersion: view.version,
      reason: { code, note: note.trim() },
    };
    const settled = await run({
      owner,
      call: (client) => client.registry.donation.remove(input),
      viewOf: (answered) => answered,
      landed: (fresh) => fresh.donation === null && fresh.pendingDonation === null,
    });
    switch (settled.kind) {
      case "busy":
        return;
      case "ok":
        onDone("removed");
        return;
      case "lost":
        if (settled.landed) onDone("removed");
        else setFailed(true);
        return;
      case "refused":
        if (settled.failure.kind === "conflict" && settled.reread === "done") onDone("conflict");
        else setFailed(true);
        return;
      /* v8 ignore next 4 -- exists so the compiler rejects an unhandled outcome; unreachable at runtime */
      default: {
        const unreachable: never = settled;
        return unreachable;
      }
    }
  };

  return (
    <Modal
      open
      title={fillTemplate(t.title, { shelter: view.displayName })}
      description={t.body}
      closeLabel={pause.close}
      locked={mine}
      onClose={close}
    >
      <Select
        id={`${id}-code`}
        label={reasonDialog.codeLabel}
        value={code}
        required
        onChange={(event) => setCode(event.target.value as DonationRemovalCode | "")}
      >
        <option value="" disabled>
          {pause.reasonPlaceholder}
        </option>
        {DonationRemovalCodeSchema.options.map((option) => (
          <option key={option} value={option}>
            {uk.kabinet.operator.codes.donationRemoval[option]}
          </option>
        ))}
      </Select>
      <TextArea
        id={`${id}-note`}
        label={reasonDialog.reasonLabel}
        value={note}
        required
        maxLength={OperatorNoteSchema.maxLength ?? undefined}
        onChange={(event) => setNote(event.target.value)}
        hint={
          <>
            <p>{reasonDialog.reasonHint}</p>
            <p>{t.shelterSeesNote}</p>
          </>
        }
      />
      <p role="status" className={NOTICE}>
        {mine && phase.kind === "checking" ? uk.kabinet.operator.errors.lostAnswer : null}
      </p>
      {failed ? (
        <p role="alert" className={NOTICE}>
          {uk.kabinet.operator.errors.failed}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 tablet:flex-row tablet:justify-end">
        <Button variant="secondary" onClick={close}>
          {pause.cancel}
        </Button>
        <Button
          variant="primary"
          aria-disabled={!ready || phase.kind !== "idle" || undefined}
          aria-busy={mine || undefined}
          aria-describedby={`${id}-note-hint`}
          onClick={onConfirm}
        >
          {t.confirm}
        </Button>
      </div>
    </Modal>
  );
}
