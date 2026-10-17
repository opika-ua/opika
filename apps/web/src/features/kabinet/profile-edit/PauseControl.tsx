"use client";

import type { KabinetShelterView } from "@opika/contracts";
import { PAUSE_NOTE_MAX_CHARACTERS } from "@opika/contracts";
import { type PauseCode, PauseCodeSchema, type PauseReason } from "@opika/domain";
import { uk } from "@opika/i18n";
import { useId, useRef, useState } from "react";
import { Button, SelectField, TextAreaField } from "../../controls/controls";
import { ModalDialog } from "../../controls/ModalDialog";
import { PausedStatus } from "./PausedStatus";
import { BODY, CARD, ERROR_TEXT, OPTIONAL } from "./styles";
import type { WriteResult } from "./write-result";

type Notice =
  | { kind: "none" }
  | { kind: "paused" }
  | { kind: "resumed" }
  | { kind: "illegal_resume" }
  | { kind: "failed" }
  | { kind: "not_available" };

/**
 * N21: the shelter pauses or resumes taking animals itself (the domain's
 * `pause`/`resume`, distinct from the operator's suspend). Shown only where
 * one of them is legal: «Призупинити прийом тварин» while verified,
 * «Відновити прийом тварин» while paused, with the pause's date and reason
 * label (fix 5: the label only, never the note) and the note under it,
 * labelled «Коментар» (K4-B4, answer 2; `PausedStatus`). Pausing asks for a reason
 * in N15's dialog template; resuming needs no confirmation (KABINET K4).
 */
export function PauseControl({
  verification,
  pause,
  resume,
}: {
  verification: KabinetShelterView["verification"];
  pause: (reason: PauseReason) => Promise<WriteResult>;
  resume: () => Promise<WriteResult>;
}) {
  const t = uk.kabinet.profileEdit.pause;
  const errors = uk.kabinet.profileEdit.errors;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>({ kind: "none" });
  const pauseButtonRef = useRef<HTMLButtonElement | null>(null);

  if (verification.status !== "verified" && verification.status !== "paused") {
    return null;
  }

  const onResume = async () => {
    if (busy) return;
    setBusy(true);
    const result = await resume();
    setBusy(false);
    setNotice(
      result.kind === "ok"
        ? { kind: "resumed" }
        : result.kind === "illegal_transition"
          ? { kind: "illegal_resume" }
          : result.kind === "not_available"
            ? { kind: "not_available" }
            : { kind: "failed" },
    );
  };

  return (
    <section
      aria-label={verification.status === "paused" ? t.resumeButton : t.button}
      className={`${CARD} items-start`}
    >
      {verification.status === "paused" ? (
        <>
          <PausedStatus since={verification.since} reason={verification.reason} />
          <Button variant="secondary" aria-busy={busy || undefined} onClick={onResume}>
            {t.resumeButton}
          </Button>
        </>
      ) : (
        <Button
          ref={pauseButtonRef}
          variant="secondary"
          onClick={() => {
            setNotice({ kind: "none" });
            setDialogOpen(true);
          }}
        >
          {t.button}
        </Button>
      )}
      <p role="status" className={BODY}>
        {notice.kind === "paused" ? t.paused : notice.kind === "resumed" ? t.resumed : null}
      </p>
      {notice.kind === "illegal_resume" ? (
        <p role="alert" className={ERROR_TEXT}>
          {errors.illegalTransitionResume}
        </p>
      ) : null}
      {notice.kind === "failed" ? (
        <p role="alert" className={ERROR_TEXT}>
          {uk.kabinet.profileEdit.state.failed}
        </p>
      ) : null}
      {notice.kind === "not_available" ? (
        <p role="alert" className={ERROR_TEXT}>
          {errors.notAvailable}
        </p>
      ) : null}
      {dialogOpen ? (
        <PauseDialog
          pause={pause}
          onClose={() => {
            setDialogOpen(false);
            requestAnimationFrame(() => pauseButtonRef.current?.focus());
          }}
          onPaused={() => {
            setDialogOpen(false);
            setNotice({ kind: "paused" });
          }}
        />
      ) : null}
    </section>
  );
}

type DialogError =
  | { kind: "none" }
  | { kind: "reason" }
  | { kind: "illegal" }
  | { kind: "failed" }
  | { kind: "not_available" };

/**
 * N15's reason-dialog template: modal over the page, the five pause codes as
 * a select (a reason is required), an optional note, black primary. The
 * frame (focus to the title on open, Tab cycling inside, Esc and ✕ closing)
 * is the shared `ModalDialog`; «Скасувати» closes it too. None of the three
 * closes it while the pause is in flight: closed then, a refusal would land
 * on a dialog that is gone and be shown nowhere (the same rule as the
 * operator's `ReasonDialog`).
 *
 * The note hint (`pause.noteHint`, fix 2) is true since the note shows
 * under the paused line for the shelter's admins and the operator (K4-B4).
 * The field stops at the contract's cap (`PAUSE_NOTE_MAX_CHARACTERS`): a
 * browser's `maxLength` counts UTF-16 units, never fewer than the
 * characters the server counts, so the server's refusal can't be reached
 * from here.
 */
function PauseDialog({
  pause,
  onClose,
  onPaused,
}: {
  pause: (reason: PauseReason) => Promise<WriteResult>;
  onClose: () => void;
  onPaused: () => void;
}) {
  const t = uk.kabinet.profileEdit.pause;
  const id = useId();
  const [code, setCode] = useState<PauseCode | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DialogError>({ kind: "none" });

  const reasonId = `${id}-reason`;
  const close = () => {
    if (!busy) onClose();
  };

  const onConfirm = async () => {
    if (busy) return;
    if (code === "") {
      setError({ kind: "reason" });
      document.getElementById(reasonId)?.focus();
      return;
    }
    setBusy(true);
    const trimmed = note.trim();
    const result = await pause({ code, note: trimmed === "" ? null : trimmed });
    setBusy(false);
    if (result.kind === "ok") {
      onPaused();
      return;
    }
    setError(
      result.kind === "illegal_transition"
        ? { kind: "illegal" }
        : result.kind === "not_available"
          ? { kind: "not_available" }
          : { kind: "failed" },
    );
  };

  return (
    <ModalDialog title={t.dialogTitle} body={t.dialogBody} closeLabel={t.close} onClose={close}>
      {/* No message key exists for a missing reason: the select is marked
            invalid and focused, and its placeholder already says «Оберіть причину». */}
      <SelectField
        id={reasonId}
        label={t.reasonLabel}
        value={code}
        required
        aria-invalid={error.kind === "reason" || undefined}
        onChange={(event) => {
          setCode(event.target.value as PauseCode | "");
          if (error.kind === "reason") setError({ kind: "none" });
        }}
      >
        <option value="" disabled>
          {t.reasonPlaceholder}
        </option>
        {PauseCodeSchema.options.map((option) => (
          <option key={option} value={option}>
            {t.reason[option]}
          </option>
        ))}
      </SelectField>
      <TextAreaField
        id={`${id}-note`}
        label={
          <>
            {t.noteLabel}{" "}
            <span className={OPTIONAL}>{uk.kabinet.profileEdit.donation.optional}</span>
          </>
        }
        value={note}
        maxLength={PAUSE_NOTE_MAX_CHARACTERS}
        onChange={(event) => setNote(event.target.value)}
        hint={<p>{t.noteHint}</p>}
      />
      {error.kind === "illegal" ? (
        <p role="alert" className={ERROR_TEXT}>
          {uk.kabinet.profileEdit.errors.illegalTransitionPause}
        </p>
      ) : null}
      {error.kind === "failed" ? (
        <p role="alert" className={ERROR_TEXT}>
          {uk.kabinet.profileEdit.state.failed}
        </p>
      ) : null}
      {error.kind === "not_available" ? (
        <p role="alert" className={ERROR_TEXT}>
          {uk.kabinet.profileEdit.errors.notAvailable}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 tablet:flex-row tablet:justify-end">
        <Button variant="secondary" onClick={close}>
          {t.cancel}
        </Button>
        <Button variant="primary" aria-busy={busy || undefined} onClick={onConfirm}>
          {t.confirm}
        </Button>
      </div>
    </ModalDialog>
  );
}
