"use client";

import { OperatorNoteSchema, type RegistryShelterView } from "@opika/contracts";
import {
  type RejectionCode,
  RejectionCodeSchema,
  type SuspensionCode,
  SuspensionCodeSchema,
} from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { useId, useState } from "react";
import { Button, SelectField, TextAreaField } from "../../../controls/controls";
import { ModalDialog } from "../../../controls/ModalDialog";
import { DECISION_OWNER, type DecisionOutcome } from "./decision-outcome";
import { useOperatorActions } from "./operator-actions";
import { NOTICE } from "./styles";

export type ReasonKind = "reject" | "suspend";

const TARGET: Record<ReasonKind, "rejected" | "suspended"> = {
  reject: "rejected",
  suspend: "suspended",
};

/** Whether the re-read record holds exactly this reason: the move, done, by this request. */
const holdsReason = (
  fresh: RegistryShelterView,
  kind: ReasonKind,
  reason: { code: string; note: string },
): boolean =>
  fresh.verification.status === TARGET[kind] &&
  fresh.verification.reason.code === reason.code &&
  fresh.verification.reason.note === reason.note;

/**
 * N15 for the operator (S3, S4): reject or suspend, with a reason code and a
 * note, both required (the contract's `OperatorNoteSchema`: trimmed, then at
 * least one character). The primary stays disabled until both are set: it
 * stays focusable and its press does nothing (`aria-disabled`, KABINET's
 * disabled button), and the note's hint next to it says why. The shelter reads
 * the note verbatim on its own page (answer 7, `VerificationDecision`), which
 * is what the body sentence promises.
 *
 * Esc and ✕ close it, as «Скасувати» does (`ModalDialog`). A refusal that
 * keeps the move possible (`failed`, or a lost answer that didn't land) keeps
 * the dialog open with the note as typed, so nothing written is lost; a move
 * that happened, or became impossible, closes it and the panel says which.
 */
export function ReasonDialog({
  kind,
  onClose,
  onDone,
}: {
  kind: ReasonKind;
  onClose: () => void;
  onDone: (outcome: DecisionOutcome) => void;
}) {
  const { view, phase, run } = useOperatorActions();
  const t = uk.kabinet.operator.reasonDialog;
  const pause = uk.kabinet.profileEdit.pause;
  const id = useId();
  const [code, setCode] = useState<RejectionCode | SuspensionCode | "">("");
  const [note, setNote] = useState("");
  const [failed, setFailed] = useState(false);

  const mine = phase.kind !== "idle" && phase.owner === DECISION_OWNER;
  const ready = code !== "" && note.trim() !== "";
  const codes = kind === "reject" ? RejectionCodeSchema.options : SuspensionCodeSchema.options;
  const codeLabel = (option: string): string =>
    kind === "reject"
      ? uk.kabinet.operator.codes.rejection[option as RejectionCode]
      : uk.kabinet.operator.codes.suspension[option as SuspensionCode];

  const onConfirm = async () => {
    if (code === "" || note.trim() === "" || phase.kind !== "idle") return;
    setFailed(false);
    const reason = { code, note: note.trim() };
    const shelterId = view.id;
    const settled = await run({
      owner: DECISION_OWNER,
      call: (client) =>
        kind === "reject"
          ? client.registry.verification.reject({
              shelterId,
              reason: { code: code as RejectionCode, note: reason.note },
            })
          : client.registry.verification.suspend({
              shelterId,
              reason: { code: code as SuspensionCode, note: reason.note },
            }),
      viewOf: (answered) => answered,
      landed: (fresh) => holdsReason(fresh, kind, reason),
    });
    switch (settled.kind) {
      case "busy":
        return;
      case "ok":
        onDone({ kind: "moved" });
        return;
      case "lost":
        if (settled.landed) onDone({ kind: "moved" });
        else setFailed(true);
        return;
      case "refused":
        if (settled.failure.kind === "illegal_transition") {
          onDone(settled.reread === "done" ? { kind: "illegal_transition" } : { kind: "failed" });
        } else {
          setFailed(true);
        }
        return;
      /* v8 ignore next 4 -- exists so the compiler rejects an unhandled outcome; unreachable at runtime */
      default: {
        const unreachable: never = settled;
        return unreachable;
      }
    }
  };

  return (
    <ModalDialog
      title={fillTemplate(kind === "reject" ? t.rejectTitle : t.suspendTitle, {
        shelter: view.displayName,
      })}
      body={kind === "reject" ? t.rejectBody : t.suspendBody}
      closeLabel={pause.close}
      onClose={onClose}
    >
      <SelectField
        id={`${id}-code`}
        label={t.codeLabel}
        value={code}
        required
        onChange={(event) => setCode(event.target.value as RejectionCode | SuspensionCode | "")}
      >
        <option value="" disabled>
          {pause.reasonPlaceholder}
        </option>
        {codes.map((option) => (
          <option key={option} value={option}>
            {codeLabel(option)}
          </option>
        ))}
      </SelectField>
      <TextAreaField
        id={`${id}-note`}
        label={t.reasonLabel}
        value={note}
        required
        maxLength={OperatorNoteSchema.maxLength ?? undefined}
        onChange={(event) => setNote(event.target.value)}
        hint={<p>{t.reasonHint}</p>}
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
        <Button variant="secondary" onClick={onClose}>
          {pause.cancel}
        </Button>
        <Button
          variant="primary"
          aria-disabled={!ready || phase.kind !== "idle" || undefined}
          aria-busy={mine || undefined}
          aria-describedby={`${id}-note-hint`}
          onClick={onConfirm}
        >
          {kind === "reject" ? t.confirmReject : t.confirmSuspend}
        </Button>
      </div>
    </ModalDialog>
  );
}
