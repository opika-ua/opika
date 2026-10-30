"use client";

import type { KabinetShelterView } from "@opika/contracts";
import { PAUSE_NOTE_MAX_CHARACTERS } from "@opika/contracts";
import { type PauseCode, PauseCodeSchema, type PauseReason } from "@opika/domain";
import { uk } from "@opika/i18n";
import { useId, useRef, useState } from "react";
import { Button } from "../../../ui/Button";
import { InlineStatus } from "../../../ui/feedback";
import { Select, TextArea } from "../../../ui/form";
import { Modal } from "../../../ui/Modal";
import { Panel } from "../../../ui/Panel";
import type { WriteResult } from "../shared/write-result";
import { Optional } from "./Optional";
import { PausedStatus } from "./PausedStatus";

type Notice =
  | { kind: "none" }
  | { kind: "paused" }
  | { kind: "resumed" }
  | { kind: "illegal_resume" }
  | { kind: "failed" };

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
  const id = useId();
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
          : { kind: "failed" },
    );
  };

  return (
    <Panel
      as="section"
      tone="outline"
      padding="lg"
      aria-labelledby={`${id}-title`}
      className="flex flex-col items-start gap-4"
    >
      {/* The section is named by the action it holds. */}
      <h2 id={`${id}-title`} className="sr-only">
        {verification.status === "paused" ? t.resumeButton : t.button}
      </h2>
      {verification.status === "paused" ? (
        <>
          <PausedStatus since={verification.since} reason={verification.reason} />
          <Button variant="secondary" status={busy ? "loading" : "idle"} onClick={onResume}>
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
      <p role="status" className="text-body text-ink">
        {notice.kind === "paused" ? t.paused : notice.kind === "resumed" ? t.resumed : null}
      </p>
      {notice.kind === "illegal_resume" ? (
        <InlineStatus tone="error">{errors.illegalTransitionResume}</InlineStatus>
      ) : null}
      {notice.kind === "failed" ? (
        <InlineStatus tone="error">{uk.kabinet.profileEdit.state.failed}</InlineStatus>
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
    </Panel>
  );
}

type DialogError = { kind: "none" } | { kind: "reason" } | { kind: "illegal" } | { kind: "failed" };

/**
 * N15's reason-dialog template: modal over the page, the five pause codes as
 * a select (a reason is required), an optional note, black primary. The
 * frame (focus to the title on open, Tab cycling inside, Esc and ✕ closing)
 * is the kit `Modal`, `locked` while the pause is in flight; «Скасувати» closes it too. None of the three
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
    setError(result.kind === "illegal_transition" ? { kind: "illegal" } : { kind: "failed" });
  };

  return (
    <Modal
      open
      title={t.dialogTitle}
      description={t.dialogBody}
      closeLabel={t.close}
      locked={busy}
      onClose={close}
    >
      {/* No message key exists for a missing reason: the select is marked
            invalid and focused, and its placeholder already says «Оберіть причину». */}
      <Select
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
      </Select>
      <TextArea
        id={`${id}-note`}
        label={
          <>
            {t.noteLabel} <Optional />
          </>
        }
        value={note}
        maxLength={PAUSE_NOTE_MAX_CHARACTERS}
        onChange={(event) => setNote(event.target.value)}
        hint={<p>{t.noteHint}</p>}
      />
      {error.kind === "illegal" ? (
        <InlineStatus tone="error">
          {uk.kabinet.profileEdit.errors.illegalTransitionPause}
        </InlineStatus>
      ) : null}
      {error.kind === "failed" ? (
        <InlineStatus tone="error">{uk.kabinet.profileEdit.state.failed}</InlineStatus>
      ) : null}
      <div className="flex flex-col-reverse gap-2 tablet:flex-row tablet:justify-end">
        <Button variant="secondary" onClick={close}>
          {t.cancel}
        </Button>
        <Button variant="primary" status={busy ? "loading" : "idle"} onClick={onConfirm}>
          {t.confirm}
        </Button>
      </div>
    </Modal>
  );
}
