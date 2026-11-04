"use client";

import "../../../../zod-client-config";
import {
  EVIDENCE_OPEN_STATUSES,
  kyivCalendarDateOf,
  MAX_EVIDENCE_ITEMS_PER_ADD,
} from "@opika/domain";
import { uk } from "@opika/i18n";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../../../../ui/Button";
import { Heading } from "../../../../ui/Heading";
import { Panel } from "../../../../ui/Panel";
import { Text } from "../../../../ui/Text";
import { EvidenceEditor } from "../evidence-editor/EvidenceEditor";
import {
  type EvidenceRow,
  type EvidenceRowErrors,
  evidenceOfRows,
} from "../evidence-editor/evidence-rows";
import { DECISION_OWNER } from "./decision-outcome";
import { useOperatorActions } from "./operator-actions";
import { NOTICE } from "./styles";

const NO_ROW_ERRORS: Readonly<Record<string, EvidenceRowErrors>> = {};

type Message =
  | "none"
  | "added"
  | "nothing_new"
  | "needed"
  | "failed"
  | "not_editable"
  | "limit"
  | "site_visit_in_future";

/**
 * «Додати докази» (pending and under_review): the operator appends evidence
 * without moving the shelter. Not a verification move, so it is not one of
 * `offeredActionsOf`'s FSM-parity events. The editor starts EMPTY (only new
 * items are sent) and offers at most one call's worth of cards; the items
 * already on file are shown by the page's own evidence section. The shelter is
 * never told (its history omits the entry), so nothing here mentions it
 * beyond the intro the owner approved.
 */
export function AddEvidencePanel({ now = () => new Date() }: { now?: () => Date }) {
  const { view, phase, run } = useOperatorActions();
  const t = uk.kabinet.operator;
  const id = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [rows, setRows] = useState<readonly EvidenceRow[]>([]);
  const [rowErrors, setRowErrors] = useState(NO_ROW_ERRORS);
  const [focusFirstError, setFocusFirstError] = useState(0);
  const [message, setMessage] = useState<Message>("none");
  const busy = phase.kind !== "idle";
  const mine = busy && phase.owner === DECISION_OWNER;

  useEffect(() => {
    if (focusFirstError === 0) return;
    containerRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusFirstError]);

  const onAdd = async () => {
    if (busy) return;
    setMessage("none");
    if (rows.length === 0) {
      setMessage("needed");
      return;
    }
    const checked = evidenceOfRows(rows, now());
    if (checked.kind === "invalid") {
      setRowErrors(checked.errors);
      setFocusFirstError((n) => n + 1);
      return;
    }
    setRowErrors(NO_ROW_ERRORS);
    const shelterId = view.id;
    const evidence = checked.items;
    const before = view.verification.evidence.items.length;
    const settled = await run({
      owner: DECISION_OWNER,
      call: (client) => client.registry.verification.addEvidence({ shelterId, evidence }),
      viewOf: (answered) => answered,
      landed: (fresh) => fresh.verification.evidence.items.length > before,
    });
    switch (settled.kind) {
      case "busy":
        return;
      case "ok":
        setRows([]);
        setMessage(
          settled.value.verification.evidence.items.length > before ? "added" : "nothing_new",
        );
        return;
      case "lost":
        if (settled.landed) {
          setRows([]);
          setMessage("added");
        } else setMessage("failed");
        return;
      case "refused": {
        const { failure } = settled;
        if (failure.kind === "evidence_not_editable") setMessage("not_editable");
        else if (failure.kind === "evidence_limit_reached") setMessage("limit");
        else if (failure.kind === "invalid_evidence" && failure.reason === "site_visit_in_future") {
          setMessage("site_visit_in_future");
        } else setMessage("failed");
        return;
      }
      /* v8 ignore next 4 -- exists so the compiler rejects an unhandled outcome; unreachable at runtime */
      default: {
        const unreachable: never = settled;
        return unreachable;
      }
    }
  };

  if (!(EVIDENCE_OPEN_STATUSES as readonly string[]).includes(view.verification.status)) {
    return null;
  }

  const text: Record<Exclude<Message, "none" | "added" | "nothing_new">, string> = {
    needed: t.evidence.addNeeded,
    failed: t.errors.failed,
    not_editable: t.evidence.notEditable,
    limit: t.evidence.limit,
    site_visit_in_future: t.create.errors.siteVisitInFuture,
  };

  return (
    <Panel
      as="section"
      padding="lg"
      aria-labelledby={`${id}-title`}
      className="flex min-w-0 flex-col gap-3"
    >
      <div ref={containerRef} className="flex min-w-0 flex-col gap-3">
        <Heading level={3} look="body-l" id={`${id}-title`}>
          {t.evidence.addTitle}
        </Heading>
        <Text look="hint">{t.evidence.addIntro}</Text>
        <EvidenceEditor
          idPrefix={`${id}-add`}
          rows={rows}
          update={setRows}
          errors={rowErrors}
          today={kyivCalendarDateOf(now())}
          limit={{ rows: MAX_EVIDENCE_ITEMS_PER_ADD, hint: t.evidence.limit }}
        />
        <Button
          variant="primary"
          className="self-start"
          aria-disabled={busy || undefined}
          aria-busy={mine || undefined}
          onClick={onAdd}
        >
          {t.evidence.addSubmit}
        </Button>
        {message === "added" || message === "nothing_new" ? (
          <p role="status" className={NOTICE}>
            {message === "added" ? t.evidence.addDone : t.evidence.addNothingNew}
          </p>
        ) : message !== "none" ? (
          <p role="alert" className={NOTICE}>
            {text[message]}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
