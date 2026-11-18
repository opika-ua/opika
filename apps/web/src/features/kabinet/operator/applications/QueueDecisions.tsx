"use client";

import "../../../../zod-client-config";
import {
  APPLICATION_REJECTION_CODES,
  APPLICATION_REJECTION_NOTE_MAX_CHARACTERS,
  type ApplicationRejectionReason,
  type DonationUrlProblem,
  donationUrlProblemOf,
  type EmailStatus,
  type ShelterId,
} from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { Button } from "../../../../ui/Button";
import { Select, TextArea } from "../../../../ui/form";
import { Modal } from "../../../../ui/Modal";
import { Text } from "../../../../ui/Text";
import { actionFailureOf } from "../actions/action-result";
import { ACTIONS, NOTICE } from "../actions/styles";
import { type ApplicationsClient, applicationsBrowserClient } from "./applications-client";

type RejectionCode = ApplicationRejectionReason["code"];
type Busy = "idle" | "accept" | "reject" | "approve";

/** What the card says after a decision; anything but `failed` re-reads the page. */
export type QueueNotice =
  | { kind: "none" }
  | { kind: "accepted" }
  | { kind: "rejected" }
  | { kind: "already_decided" }
  | { kind: "email_unconfirmed" }
  | { kind: "conflict" }
  | { kind: "no_answer" }
  | { kind: "failed" };

const op = uk.kabinet.operator;

export function queueNoticeText(notice: QueueNotice): string | null {
  switch (notice.kind) {
    case "none":
      return null;
    case "accepted":
      return op.history.verification.accept_application;
    case "rejected":
      return uk.kabinet.profileStatus.rejected;
    case "already_decided":
      return op.errors.illegalTransition;
    case "email_unconfirmed":
      return uk.kabinet.applications.emailUnconfirmed;
    case "conflict":
      return op.errors.conflictReload;
    case "no_answer":
      return op.errors.lostAnswer;
    case "failed":
      return op.errors.failed;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled notice; unreachable at runtime */
    default: {
      const unreachable: never = notice;
      return unreachable;
    }
  }
}

/** The A5 preset as the menu lists it; «Інше» alone, its text comes from the note. */
const codeLabel = (code: RejectionCode): string =>
  code === "other" ? op.codes.rejection.other : uk.registration.rejectionReasons[code];

/** A note is needed for «Інше» only (`ApplicationRejectionReasonSchema`). */
export function reasonOf(
  code: RejectionCode | "",
  note: string,
): ApplicationRejectionReason | null {
  if (code === "") return null;
  const trimmed = note.trim();
  if (code === "other" && trimmed === "") return null;
  return { code, note: trimmed === "" ? null : trimmed };
}

/** Re-renders the page on the server: the browser holds no registry read of its own. */
function useReread(): () => void {
  const router = useRouter();
  const [, startTransition] = useTransition();
  return () => startTransition(() => router.refresh());
}

/**
 * «Схвалити» and «Відхилити» on one application card. «Схвалити» stays focusable but does nothing
 * until the email is confirmed (the server refuses it too). Each decision carries the version the
 * card was read at, so an applicant's edit since is CONFLICT and the page is read again.
 */
export function ApplicationDecision({
  shelterId,
  version,
  name,
  emailStatus,
  client = applicationsBrowserClient,
}: {
  shelterId: ShelterId;
  version: number;
  name: string;
  emailStatus: EmailStatus;
  client?: ApplicationsClient;
}) {
  const [busy, setBusy] = useState<Busy>("idle");
  const [notice, setNotice] = useState<QueueNotice>({ kind: "none" });
  const [rejecting, setRejecting] = useState(false);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const inFlight = useRef(false);
  const reread = useReread();
  const t = uk.kabinet.applications;
  const confirmed = emailStatus === "confirmed";

  const settle = (next: QueueNotice) => {
    setNotice(next);
    if (next.kind !== "failed" && next.kind !== "email_unconfirmed") reread();
  };

  const run = async (
    which: "accept" | "reject",
    call: () => Promise<{ kind: "decided" | "already_decided" | "email_unconfirmed" }>,
  ): Promise<boolean> => {
    // A ref, not the state: two taps in one tick both read the state as idle.
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(which);
    setNotice({ kind: "none" });
    try {
      const result = await call();
      settle(
        result.kind === "decided"
          ? { kind: which === "accept" ? "accepted" : "rejected" }
          : { kind: result.kind },
      );
      return true;
    } catch (error) {
      const failure = actionFailureOf(error);
      settle(
        failure.kind === "conflict" || failure.kind === "no_answer"
          ? { kind: failure.kind }
          : { kind: "failed" },
      );
      return failure.kind !== "failed";
    } finally {
      inFlight.current = false;
      setBusy("idle");
    }
  };

  const accept = () => {
    if (!confirmed) return;
    void run("accept", () =>
      client.registry.applications.accept({ shelterId, expectedVersion: version }),
    );
  };

  const text = queueNoticeText(notice);
  return (
    <div className="flex flex-col gap-2">
      <div className={ACTIONS}>
        <Button
          aria-disabled={!confirmed || busy !== "idle" || undefined}
          aria-busy={busy === "accept" || undefined}
          aria-describedby={confirmed ? undefined : `${shelterId}-email`}
          onClick={accept}
        >
          {t.accept}
        </Button>
        <Button
          variant="secondary"
          aria-disabled={busy !== "idle" || undefined}
          onClick={(event) => {
            if (busy !== "idle") return;
            openerRef.current = event.currentTarget;
            setRejecting(true);
          }}
        >
          {t.reject}
        </Button>
      </div>
      <p role="status" className={NOTICE}>
        {notice.kind === "failed" ? null : text}
      </p>
      {notice.kind === "failed" ? (
        <p role="alert" className={NOTICE}>
          {text}
        </p>
      ) : null}
      {rejecting ? (
        <RejectApplicationDialog
          name={name}
          busy={busy === "reject"}
          failed={notice.kind === "failed"}
          onClose={() => {
            setRejecting(false);
            const opener = openerRef.current;
            requestAnimationFrame(() => opener?.focus());
          }}
          onConfirm={async (reason) => {
            const done = await run("reject", () =>
              client.registry.applications.reject({ shelterId, expectedVersion: version, reason }),
            );
            if (done) setRejecting(false);
          }}
        />
      ) : null}
    </div>
  );
}

/** «Відхилити» with an A5 preset; the note is optional except for «Інше». */
function RejectApplicationDialog({
  name,
  busy,
  failed,
  onClose,
  onConfirm,
}: {
  name: string;
  busy: boolean;
  /** The last try was refused: the dialog stays open with the reason as chosen. */
  failed: boolean;
  onClose: () => void;
  onConfirm: (reason: ApplicationRejectionReason) => Promise<void>;
}) {
  const id = useId();
  const t = op.reasonDialog;
  const pause = uk.kabinet.profileEdit.pause;
  const [code, setCode] = useState<RejectionCode | "">("");
  const [note, setNote] = useState("");
  const reason = reasonOf(code, note);
  const close = () => {
    if (!busy) onClose();
  };
  return (
    <Modal
      open
      title={fillTemplate(t.rejectTitle, { shelter: name })}
      closeLabel={pause.close}
      locked={busy}
      onClose={close}
    >
      <Select
        id={`${id}-code`}
        label={t.codeLabel}
        value={code}
        required
        onChange={(event) => setCode(event.target.value as RejectionCode | "")}
      >
        <option value="" disabled>
          {pause.reasonPlaceholder}
        </option>
        {APPLICATION_REJECTION_CODES.map((option) => (
          <option key={option} value={option}>
            {codeLabel(option)}
          </option>
        ))}
      </Select>
      <TextArea
        id={`${id}-note`}
        label={t.reasonLabel}
        value={note}
        required={code === "other"}
        maxLength={APPLICATION_REJECTION_NOTE_MAX_CHARACTERS}
        onChange={(event) => setNote(event.target.value)}
      />
      {failed ? (
        <p role="alert" className={NOTICE}>
          {op.errors.failed}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 tablet:flex-row tablet:justify-end">
        <Button variant="secondary" onClick={close}>
          {pause.cancel}
        </Button>
        <Button
          aria-disabled={reason === null || busy || undefined}
          aria-busy={busy || undefined}
          onClick={() => {
            if (reason !== null && !busy) void onConfirm(reason);
          }}
        >
          {t.confirmReject}
        </Button>
      </div>
    </Modal>
  );
}

type DonationNotice =
  | { kind: "none" }
  | { kind: "decided"; decision: "approve" | "reject" }
  | { kind: "conflict" }
  | { kind: "link_refused"; problem: DonationUrlProblem }
  | { kind: "no_answer" }
  | { kind: "failed" };

/**
 * A proposed donation link in the queue, decided through the existing `registry.donation.*` with
 * the version read. A link a new proposal could not be is not offered for approval (as on S4).
 */
export function DonationQueueDecision({
  shelterId,
  version,
  proposedUrl,
  client = applicationsBrowserClient,
}: {
  shelterId: ShelterId;
  version: number;
  proposedUrl: string;
  client?: ApplicationsClient;
}) {
  const [busy, setBusy] = useState<"idle" | "approve" | "reject">("idle");
  const [notice, setNotice] = useState<DonationNotice>({ kind: "none" });
  const inFlight = useRef(false);
  const reread = useReread();
  const t = op.donation;
  const problem = donationUrlProblemOf(proposedUrl);

  const decide = async (decision: "approve" | "reject") => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(decision);
    setNotice({ kind: "none" });
    const input = { shelterId, expectedVersion: version };
    try {
      await (decision === "approve"
        ? client.registry.donation.approve(input)
        : client.registry.donation.reject(input));
      setNotice({ kind: "decided", decision });
      reread();
    } catch (error) {
      const failure = actionFailureOf(error);
      if (failure.kind === "donation_link_refused") {
        setNotice({ kind: "link_refused", problem: failure.problem });
      } else if (failure.kind === "conflict" || failure.kind === "no_answer") {
        setNotice({ kind: failure.kind });
        reread();
      } else {
        setNotice({ kind: "failed" });
      }
    } finally {
      inFlight.current = false;
      setBusy("idle");
    }
  };

  const status =
    notice.kind === "decided"
      ? notice.decision === "approve"
        ? t.approved
        : t.rejected
      : notice.kind === "conflict"
        ? t.conflict
        : notice.kind === "no_answer"
          ? op.errors.lostAnswer
          : null;
  const alert =
    notice.kind === "link_refused"
      ? t.cannotApprove[notice.problem]
      : notice.kind === "failed"
        ? op.errors.failed
        : null;
  return (
    <div className="flex flex-col gap-2">
      {problem !== null ? <Text>{t.cannotApprove[problem]}</Text> : null}
      <div className={ACTIONS}>
        {problem === null ? (
          <Button
            aria-disabled={busy !== "idle" || undefined}
            aria-busy={busy === "approve" || undefined}
            onClick={() => void decide("approve")}
          >
            {t.approve}
          </Button>
        ) : null}
        <Button
          variant="secondary"
          aria-disabled={busy !== "idle" || undefined}
          aria-busy={busy === "reject" || undefined}
          onClick={() => void decide("reject")}
        >
          {t.reject}
        </Button>
      </div>
      <p role="status" className={NOTICE}>
        {status}
      </p>
      {alert !== null ? (
        <p role="alert" className={NOTICE}>
          {alert}
        </p>
      ) : null}
    </div>
  );
}
