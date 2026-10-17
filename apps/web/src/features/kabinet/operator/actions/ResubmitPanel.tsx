"use client";

import type { EvidenceItemInput } from "@opika/domain";
import { uk } from "@opika/i18n";
import { type ReactNode, useState } from "react";
import { Button } from "../../../controls/controls";
import { DECISION_OWNER, type DecisionOutcome } from "./decision-outcome";
import { useOperatorActions } from "./operator-actions";
import { resubmitPrefillOf } from "./resubmit-evidence";
import { BODY, CAPTION, NOTICE } from "./styles";

/**
 * Where the evidence editor goes: given the items and told of every change.
 * rebase: R-UI 2's four-kind evidence editor is passed here, prefilled with
 * `items`; until then the default lists what will be sent, unchanged.
 */
export type EvidenceEditorSlot = (editor: {
  items: readonly EvidenceItemInput[];
  onChange: (items: EvidenceItemInput[]) => void;
}) => ReactNode;

const summaryOf = (item: EvidenceItemInput): string => {
  switch (item.kind) {
    case "edrpou_registration":
      return `${item.edrpou} · ${item.registeredName}`;
    case "bank_account_holder":
      return item.holderName;
    case "reference_contact":
      return item.name;
    case "site_visit":
      return item.visitedOn;
    case "supporting_document":
      return item.labelUk;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = item;
      return unreachable;
    }
  }
};

const ReadOnlyEvidence: EvidenceEditorSlot = ({ items }) =>
  items.length === 0 ? (
    <p className={CAPTION}>{uk.kabinet.operator.evidence.empty}</p>
  ) : (
    <ul className="flex flex-col gap-1">
      {items.map((item, index) => (
        <li key={`${item.kind}-${index}`} className={BODY}>
          {uk.kabinet.operator.evidence.kind[item.kind]} · {summaryOf(item)}
        </li>
      ))}
    </ul>
  );

/**
 * «Повернути на перевірку» (S3/S4, `rejected` only): the operator sends the
 * evidence back for review, amended or not, and the shelter is `pending`
 * again. The editor starts from the evidence on file (`resubmitPrefillOf`),
 * so with no edits the same items go back (pinned by its test).
 *
 * What can't be sent again (a script-onboarded `supporting_document`, RG-Q5)
 * is left out of the prefill. Saying so on the screen needs a sentence that
 * has no copy yet (NEEDS OLEKSII in the R-UI 3 report), so this cut computes
 * it (`leftOut`) and doesn't show it; no screen can create such an item.
 */
export function ResubmitPanel({
  renderEditor = ReadOnlyEvidence,
  onDone,
}: {
  renderEditor?: EvidenceEditorSlot | undefined;
  onDone: (outcome: DecisionOutcome) => void;
}) {
  const { view, phase, run } = useOperatorActions();
  const t = uk.kabinet.operator;
  const [items, setItems] = useState<EvidenceItemInput[]>(
    () => resubmitPrefillOf(view.verification.evidence).items,
  );
  const [error, setError] = useState<"none" | "failed" | "site_visit_in_future">("none");
  const busy = phase.kind !== "idle";
  const mine = busy && phase.owner === DECISION_OWNER;

  const onResubmit = async () => {
    if (busy) return;
    setError("none");
    const shelterId = view.id;
    const evidence = items;
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
    <div className="flex flex-col gap-3">
      {renderEditor({ items, onChange: setItems })}
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
