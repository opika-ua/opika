"use client";

import { kyivCalendarDateOf } from "@opika/domain";
import { uk } from "@opika/i18n";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../../../../ui/Button";
import { Heading } from "../../../../ui/Heading";
import { EvidenceEditor } from "../evidence-editor/EvidenceEditor";
import {
  type EvidenceRow,
  type EvidenceRowErrors,
  evidenceOfRows,
} from "../evidence-editor/evidence-rows";
import { DECISION_OWNER, type DecisionOutcome } from "./decision-outcome";
import { useOperatorActions } from "./operator-actions";
import { resubmitRowsOf } from "./resubmit-evidence";
import { NOTICE } from "./styles";

const NO_ROW_ERRORS: Readonly<Record<string, EvidenceRowErrors>> = {};

/**
 * «Повернути на перевірку» (S3/S4, `rejected` only): the operator sends the
 * evidence back for review, amended or not, and the shelter is `pending`
 * again. The editor is R-UI 2's (`EvidenceEditor`, the four document-free
 * kinds), started from the evidence on file (`resubmitRowsOf`), so with no
 * edits the same items go back (pinned by its test). The cards are checked
 * by the editor's own `evidenceOfRows` before anything is sent, as on S2;
 * the server checks them again.
 *
 * What the editor can't hold (a script-onboarded `supporting_document`,
 * RG-Q5) has no card and stays on file: the server carries it over
 * (`resubmit-evidence.ts` says how).
 *
 * `now` is the clock for "today" (Kyiv's calendar, the server's own rule for
 * a site visit), injectable so a test can stand at Kyiv's midnight.
 */
export function ResubmitPanel({
  onDone,
  now = () => new Date(),
}: {
  onDone: (outcome: DecisionOutcome) => void;
  now?: () => Date;
}) {
  const { view, phase, run } = useOperatorActions();
  const t = uk.kabinet.operator;
  const id = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [rows, setRows] = useState<readonly EvidenceRow[]>(() =>
    resubmitRowsOf(view.verification.evidence),
  );
  const [rowErrors, setRowErrors] = useState(NO_ROW_ERRORS);
  const [focusFirstError, setFocusFirstError] = useState(0);
  const [error, setError] = useState<"none" | "failed" | "site_visit_in_future">("none");
  const busy = phase.kind !== "idle";
  const mine = busy && phase.owner === DECISION_OWNER;

  useEffect(() => {
    if (focusFirstError === 0) return;
    containerRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusFirstError]);

  const onResubmit = async () => {
    if (busy) return;
    setError("none");
    const checked = evidenceOfRows(rows, now());
    if (checked.kind === "invalid") {
      setRowErrors(checked.errors);
      setFocusFirstError((n) => n + 1);
      return;
    }
    setRowErrors(NO_ROW_ERRORS);
    const shelterId = view.id;
    const evidence = checked.items;
    const settled = await run({
      owner: DECISION_OWNER,
      call: (client) => client.registry.verification.resubmit({ shelterId, evidence }),
      viewOf: (answered) => answered,
      landed: (fresh) => fresh.verification.status === "pending",
    });
    switch (settled.kind) {
      case "busy":
        return;
      case "ok":
        onDone({ kind: "moved" });
        return;
      case "lost":
        if (settled.landed) onDone({ kind: "moved" });
        else setError("failed");
        return;
      case "refused":
        if (settled.failure.kind === "illegal_transition") {
          onDone(settled.reread === "done" ? { kind: "illegal_transition" } : { kind: "failed" });
        } else if (
          settled.failure.kind === "invalid_evidence" &&
          settled.failure.reason === "site_visit_in_future"
        ) {
          setError("site_visit_in_future");
        } else {
          setError("failed");
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
    <div ref={containerRef} className="flex min-w-0 flex-col gap-3">
      <section aria-labelledby={`${id}-resubmit-title`} className="flex min-w-0 flex-col gap-3">
        <Heading level={3} look="body-l" id={`${id}-resubmit-title`}>
          {t.evidence.title}
        </Heading>
        <EvidenceEditor
          idPrefix={`${id}-resubmit`}
          rows={rows}
          update={setRows}
          errors={rowErrors}
          today={kyivCalendarDateOf(now())}
        />
      </section>
      {error === "failed" ? (
        <p role="alert" className={NOTICE}>
          {t.errors.failed}
        </p>
      ) : null}
      {error === "site_visit_in_future" ? (
        <p role="alert" className={NOTICE}>
          {t.create.errors.siteVisitInFuture}
        </p>
      ) : null}
      <Button
        variant="primary"
        className="self-start"
        aria-disabled={busy || undefined}
        aria-busy={mine || undefined}
        onClick={onResubmit}
      >
        {t.verification.resubmit}
      </Button>
    </div>
  );
}
