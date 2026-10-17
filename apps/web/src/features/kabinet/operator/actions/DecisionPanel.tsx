"use client";

import type { RegistryShelterView } from "@opika/contracts";
import type { EvidenceGap, InterruptedState } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { useId, useRef, useState } from "react";
import { Button } from "../../../controls/controls";
import { formatDate } from "../format";
import { DECISION_OWNER, type DecisionOutcome } from "./decision-outcome";
import { type OfferedAction, offeredActionsOf } from "./offered-actions";
import { useOperatorActions } from "./operator-actions";
import { ReasonDialog, type ReasonKind } from "./ReasonDialog";
import { type EvidenceEditorSlot, ResubmitPanel } from "./ResubmitPanel";
import {
  ACTIONS,
  CAPTION,
  CARD,
  CARD_TITLE,
  CHIP,
  INNER,
  NOTICE,
  STRONG,
  SUBTITLE,
} from "./styles";

type Notice = { kind: "none" } | Exclude<DecisionOutcome, { kind: "moved" }>;

type Reason = { note: string | null };

/** «{code}. {note}» with the code's label; a reason stored before notes were required shows its code alone. */
const reasonText = (label: string, reason: Reason): string =>
  reason.note === null
    ? label
    : fillTemplate(uk.kabinet.operator.verification.rejected.reason, {
        code: label,
        note: reason.note,
      });

const gapText = (gap: EvidenceGap): string =>
  fillTemplate(uk.kabinet.operator.evidence.gaps, {
    kind: uk.kabinet.operator.evidence.kind[gap.kind],
    provided: String(gap.provided),
    minimum: String(gap.minimum),
  });

/** What a single-tap move's lost answer must find on the re-read record to count as done. */
const landedFor = (action: "start_review" | "approve" | "reinstate", view: RegistryShelterView) => {
  switch (action) {
    case "start_review":
      return (fresh: RegistryShelterView) => fresh.verification.status === "under_review";
    case "approve":
      return (fresh: RegistryShelterView) => fresh.verification.status === "verified";
    case "reinstate": {
      const to = view.verification.status === "suspended" ? view.verification.priorState : null;
      return (fresh: RegistryShelterView) => to !== null && fresh.verification.status === to.status;
    }
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled move; unreachable at runtime */
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
};

/**
 * N14, S4's decision panel (S3 folded in, RU-T2): «Рішення», what the shelter
 * will see, and the moves the current status allows, exactly those
 * (`offeredActionsOf`, FSM parity). Approve is offered disabled with the gap
 * list next to it while the evidence misses the policy. Reject and suspend
 * open the reason dialog; reinstate names where it returns, and says what
 * that means for the animals; resubmit sends the evidence back.
 *
 * Every move goes through the page's one runner (`OperatorActionsProvider`):
 * one request at a time, a stale refusal or a lost answer re-reads the page
 * before the panel says anything. A move that happens changes the panel
 * itself (the new status's moves), so there is no success line to read; the
 * focus goes to the panel's heading, since the pressed button may be gone.
 *
 * Mounted at the head of S4's second column, beside the evidence
 * (`ShelterActionsScreen`).
 */
export function DecisionPanel({
  renderEvidenceEditor,
}: {
  renderEvidenceEditor?: EvidenceEditorSlot;
}) {
  const { view, phase, run } = useOperatorActions();
  const t = uk.kabinet.operator.verification;
  const errors = uk.kabinet.operator.errors;
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const [dialog, setDialog] = useState<ReasonKind | null>(null);
  const [notice, setNotice] = useState<Notice>({ kind: "none" });
  const busy = phase.kind !== "idle";
  const mine = busy && phase.owner === DECISION_OWNER;
  const verification = view.verification;
  const offered = offeredActionsOf(verification, view.legalEntity);

  const report = (outcome: DecisionOutcome) => {
    setNotice(outcome.kind === "moved" ? { kind: "none" } : outcome);
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  const tap = async (action: "start_review" | "approve" | "reinstate") => {
    if (busy) return;
    setNotice({ kind: "none" });
    const shelterId = view.id;
    const settled = await run({
      owner: DECISION_OWNER,
      call: (client) => {
        const moves = client.registry.verification;
        return action === "start_review"
          ? moves.startReview({ shelterId })
          : action === "approve"
            ? moves.approve({ shelterId })
            : moves.reinstate({ shelterId });
      },
      viewOf: (answered) => answered,
      landed: landedFor(action, view),
    });
    switch (settled.kind) {
      case "busy":
        return;
      case "ok":
        report({ kind: "moved" });
        return;
      case "lost":
        if (settled.landed) report({ kind: "moved" });
        else setNotice({ kind: "failed" });
        return;
      case "refused": {
        const { failure, reread } = settled;
        if (failure.kind === "illegal_transition") {
          report(reread === "done" ? { kind: "illegal_transition" } : { kind: "failed" });
        } else if (failure.kind === "evidence_insufficient" && reread === "done") {
          // The re-read panel shows approve disabled with the gaps: that is the message.
          report({ kind: "moved" });
        } else {
          setNotice({ kind: "failed" });
        }
        return;
      }
      /* v8 ignore next 4 -- exists so the compiler rejects an unhandled outcome; unreachable at runtime */
      default: {
        const unreachable: never = settled;
        return unreachable;
      }
    }
  };

  const openDialog = (kind: ReasonKind, opener: HTMLButtonElement) => {
    if (busy) return;
    setNotice({ kind: "none" });
    openerRef.current = opener;
    setDialog(kind);
  };

  const control = (action: OfferedAction) => {
    switch (action.event) {
      case "start_review":
        return (
          <Button
            key="start_review"
            aria-disabled={busy || undefined}
            aria-busy={mine || undefined}
            onClick={() => tap("start_review")}
          >
            {t.startReview}
          </Button>
        );
      case "approve":
        return (
          <ApproveControl
            key="approve"
            gate={action.gate}
            busy={busy}
            mine={mine}
            onApprove={() => tap("approve")}
          />
        );
      case "reject":
        return (
          <Button
            key="reject"
            variant="secondary"
            aria-disabled={busy || undefined}
            onClick={(event) => openDialog("reject", event.currentTarget)}
          >
            {t.reject}
          </Button>
        );
      case "suspend":
        return (
          <Button
            key="suspend"
            variant="secondary"
            aria-disabled={busy || undefined}
            onClick={(event) => openDialog("suspend", event.currentTarget)}
          >
            {t.suspend}
          </Button>
        );
      case "reinstate":
        return (
          <ReinstateControl
            key="reinstate"
            to={action.to}
            busy={busy}
            mine={mine}
            onReinstate={() => tap("reinstate")}
          />
        );
      case "resubmit":
        return <ResubmitPanel key="resubmit" renderEditor={renderEvidenceEditor} onDone={report} />;
      /* v8 ignore next 4 -- exists so the compiler rejects an unhandled move; unreachable at runtime */
      default: {
        const unreachable: never = action;
        return unreachable;
      }
    }
  };

  return (
    <section aria-labelledby={titleId} className={CARD}>
      <div className="flex flex-col gap-1">
        <h2 id={titleId} ref={headingRef} tabIndex={-1} className={CARD_TITLE}>
          {t.decisionTitle}
        </h2>
        <p className={CAPTION}>{t.decisionCaption}</p>
      </div>

      {verification.status === "rejected" ? (
        <div className={INNER}>
          <h3 className={SUBTITLE}>{t.rejected.title}</h3>
          <p className={STRONG}>
            {reasonText(
              uk.kabinet.operator.codes.rejection[verification.reason.code],
              verification.reason,
            )}
          </p>
        </div>
      ) : null}

      {verification.status === "suspended" ? (
        <SuspendedDetails reason={verification.reason} prior={verification.priorState} />
      ) : null}

      <div className={verification.status === "rejected" ? "flex flex-col gap-3" : ACTIONS}>
        {offered.map(control)}
      </div>

      <p role="status" className={NOTICE}>
        {mine && phase.kind === "checking" ? errors.lostAnswer : null}
      </p>
      {notice.kind === "illegal_transition" ? (
        <p role="alert" className={NOTICE}>
          {errors.illegalTransition}
        </p>
      ) : null}
      {notice.kind === "failed" ? (
        <p role="alert" className={NOTICE}>
          {errors.failed}
        </p>
      ) : null}

      {dialog !== null ? (
        <ReasonDialog
          kind={dialog}
          onClose={() => {
            setDialog(null);
            const opener = openerRef.current;
            requestAnimationFrame(() => opener?.focus());
          }}
          onDone={(outcome) => {
            setDialog(null);
            report(outcome);
          }}
        />
      ) : null}
    </section>
  );
}

function ApproveControl({
  gate,
  busy,
  mine,
  onApprove,
}: {
  gate: Extract<OfferedAction, { event: "approve" }>["gate"];
  busy: boolean;
  mine: boolean;
  onApprove: () => void;
}) {
  const t = uk.kabinet.operator.verification;
  const blockedId = useId();
  const blocked = gate.kind === "blocked";
  return (
    <div className="flex flex-col gap-2">
      <Button
        aria-disabled={blocked || busy || undefined}
        aria-busy={mine || undefined}
        aria-describedby={blocked ? blockedId : undefined}
        onClick={() => {
          if (!blocked) onApprove();
        }}
      >
        {t.approve}
      </Button>
      {gate.kind === "blocked" ? (
        <div id={blockedId} className="flex flex-col gap-1">
          <p className={STRONG}>{t.approveBlocked}</p>
          <ul className="flex flex-col gap-1">
            {gate.gaps.map((gap) => (
              <li key={gap.kind} className={CAPTION}>
                {gapText(gap)}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className={CAPTION}>{t.approveNote}</p>
      )}
    </div>
  );
}

function ReinstateControl({
  to,
  busy,
  mine,
  onReinstate,
}: {
  to: InterruptedState;
  busy: boolean;
  mine: boolean;
  onReinstate: () => void;
}) {
  const t = uk.kabinet.operator.verification;
  return (
    <div className="flex flex-col gap-2">
      <p className={CAPTION}>
        {to.status === "paused"
          ? t.suspended.reinstateExplainPaused
          : t.suspended.reinstateExplainVerified}
      </p>
      <Button aria-disabled={busy || undefined} aria-busy={mine || undefined} onClick={onReinstate}>
        {fillTemplate(t.reinstate, { status: uk.kabinet.profileStatus[to.status] })}
      </Button>
      <p className={CAPTION}>{t.noConfirm}</p>
    </div>
  );
}

/**
 * S4's suspended variant: the reason as the shelter reads it, and the state
 * the suspension interrupted with its own chip and since when, so the
 * operator sees where «Відновити» returns before pressing it (N14).
 */
function SuspendedDetails({
  reason,
  prior,
}: {
  reason: Extract<RegistryShelterView["verification"], { status: "suspended" }>["reason"];
  prior: InterruptedState;
}) {
  const t = uk.kabinet.operator.verification.suspended;
  return (
    <div className="flex flex-col gap-3">
      <h3 className={SUBTITLE}>{t.title}</h3>
      <dl className="flex flex-col gap-3">
        <div className={INNER}>
          <dt className={CAPTION}>{t.reasonLabel}</dt>
          <dd className={STRONG}>
            {reasonText(uk.kabinet.operator.codes.suspension[reason.code], reason)}
          </dd>
        </div>
        <div className="flex flex-col gap-2">
          <dt className={CAPTION}>{t.priorLabel}</dt>
          <dd className="flex flex-col gap-1">
            <span className={CHIP}>{uk.kabinet.profileStatus[prior.status]}</span>
            <span className={CAPTION}>
              {prior.status === "paused"
                ? fillTemplate(t.priorPausedSince, { date: formatDate(prior.pausedAt) })
                : fillTemplate(uk.kabinet.operator.shelter.timeInState, {
                    date: formatDate(prior.verifiedAt),
                  })}
            </span>
          </dd>
        </div>
      </dl>
    </div>
  );
}
