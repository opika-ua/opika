"use client";

import "../../../../zod-client-config";
import { OperatorNoteSchema, type RegistryShelterView } from "@opika/contracts";
import { EARLY_LISTING_MAX_PERIODS, EARLY_LISTING_STATUSES, pluralizeUk } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { useId, useState } from "react";
import { Button } from "../../../../ui/Button";
import { TextArea } from "../../../../ui/form";
import { Heading } from "../../../../ui/Heading";
import { Modal } from "../../../../ui/Modal";
import { Panel } from "../../../../ui/Panel";
import { Text } from "../../../../ui/Text";
import { formatDate } from "../format";
import { useOperatorActions } from "./operator-actions";
import { ACTIONS, NOTICE } from "./styles";

const OWNER = "early-listing";

type Message = "none" | "evidence_minimum" | "limit" | "stale" | "failed";

const isRunning = (view: RegistryShelterView): boolean =>
  view.earlyListing.state.kind === "running";

/**
 * Listing before verification, the operator's side (owner, 2026-11-04): «Дозволити показ до
 * завершення перевірки» on a pending or under_review shelter, «Зняти дозвіл» while it runs. Not a
 * verification move, so it is not one of `offeredActionsOf`'s FSM-parity events. The server decides
 * everything (evidence minimum, two periods at most, the written reason for the second); this panel
 * only asks for the reason up front and says what a refusal means. The state shown is the view's
 * own, derived on the server with its clock, so the days left cannot disagree with the public gate.
 */
export function EarlyListingPanel() {
  const { view, phase, run } = useOperatorActions();
  const t = uk.kabinet.operator.earlyListing;
  const id = useId();
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  const [failedInDialog, setFailedInDialog] = useState(false);
  const [message, setMessage] = useState<Message>("none");
  const busy = phase.kind !== "idle";
  const mine = busy && phase.owner === OWNER;

  if (!(EARLY_LISTING_STATUSES as readonly string[]).includes(view.verification.status)) {
    return null;
  }

  const { state, periodsUsed } = view.earlyListing;
  const needsNote = periodsUsed >= 1;
  const limitReached = periodsUsed >= EARLY_LISTING_MAX_PERIODS;
  const noteReady = !needsNote || note.trim() !== "";

  const close = () => {
    if (mine) return;
    setConfirming(false);
    setFailedInDialog(false);
  };

  const onAllow = async () => {
    if (busy || !noteReady) return;
    setFailedInDialog(false);
    setMessage("none");
    const shelterId = view.id;
    const trimmed = note.trim();
    const settled = await run({
      owner: OWNER,
      call: (client) =>
        client.registry.earlyListing.allow({
          shelterId,
          ...(trimmed === "" ? {} : { note: trimmed }),
        }),
      viewOf: (answered) => answered,
      landed: isRunning,
    });
    switch (settled.kind) {
      case "busy":
        return;
      case "ok":
        setNote("");
        setConfirming(false);
        return;
      case "lost":
        if (settled.landed) {
          setNote("");
          setConfirming(false);
        } else setFailedInDialog(true);
        return;
      case "refused": {
        const { failure } = settled;
        if (failure.kind === "early_listing_refused") {
          if (failure.reason === "note_required") {
            setFailedInDialog(true);
            return;
          }
          if (failure.reason === "evidence_below_minimum") setMessage("evidence_minimum");
          else if (failure.reason === "limit_reached") setMessage("limit");
          else setMessage("stale");
          setConfirming(false);
          return;
        }
        if (failure.kind === "illegal_transition" || failure.kind === "conflict") {
          setMessage("stale");
          setConfirming(false);
          return;
        }
        setFailedInDialog(true);
        return;
      }
      /* v8 ignore next 4 -- exists so the compiler rejects an unhandled outcome; unreachable at runtime */
      default: {
        const unreachable: never = settled;
        return unreachable;
      }
    }
  };

  const onRevoke = async () => {
    if (busy) return;
    setMessage("none");
    const shelterId = view.id;
    const settled = await run({
      owner: OWNER,
      call: (client) => client.registry.earlyListing.revoke({ shelterId }),
      viewOf: (answered) => answered,
      landed: (fresh) => !isRunning(fresh),
    });
    switch (settled.kind) {
      case "busy":
      case "ok":
        return;
      case "lost":
        if (!settled.landed) setMessage("failed");
        return;
      case "refused":
        setMessage(settled.failure.kind === "early_listing_refused" ? "stale" : "failed");
        return;
      /* v8 ignore next 4 -- exists so the compiler rejects an unhandled outcome; unreachable at runtime */
      default: {
        const unreachable: never = settled;
        return unreachable;
      }
    }
  };

  const text: Record<Exclude<Message, "none">, string> = {
    evidence_minimum: t.evidenceMinimum,
    limit: t.limitReached,
    stale: uk.kabinet.operator.errors.illegalTransition,
    failed: uk.kabinet.operator.errors.failed,
  };

  return (
    <Panel
      as="section"
      padding="lg"
      aria-labelledby={`${id}-title`}
      className="flex min-w-0 flex-col gap-3"
    >
      <Heading level={3} look="body-l" id={`${id}-title`}>
        {t.title}
      </Heading>
      {state.kind === "running" ? (
        <Text look={state.remind ? "body" : "hint"}>
          {fillTemplate(pluralizeUk(state.daysLeft, t.daysLeft), { count: String(state.daysLeft) })}
        </Text>
      ) : null}
      {state.kind === "lapsed" ? (
        <Text look="hint">{fillTemplate(t.expired, { date: formatDate(state.expiredAt) })}</Text>
      ) : null}
      {state.kind === "lapsed" && periodsUsed === EARLY_LISTING_MAX_PERIODS - 1 ? (
        <Text look="hint">{t.oneMoreLeft}</Text>
      ) : null}
      {state.kind !== "running" && limitReached ? <Text look="hint">{t.limitReached}</Text> : null}
      <div className={ACTIONS}>
        {state.kind === "running" ? (
          <Button
            variant="secondary"
            aria-disabled={busy || undefined}
            aria-busy={mine || undefined}
            onClick={onRevoke}
          >
            {t.revoke}
          </Button>
        ) : limitReached ? null : (
          <Button
            variant="primary"
            aria-disabled={busy || undefined}
            onClick={() => setConfirming(true)}
          >
            {t.allow}
          </Button>
        )}
      </div>
      {message !== "none" ? (
        <p role="alert" className={NOTICE}>
          {text[message]}
        </p>
      ) : null}
      {confirming ? (
        <Modal
          open
          title={t.allow}
          description={t.confirm}
          closeLabel={uk.kabinet.profileEdit.pause.close}
          locked={mine}
          onClose={close}
        >
          {needsNote ? (
            <TextArea
              id={`${id}-note`}
              label={t.extendNote}
              value={note}
              required
              maxLength={OperatorNoteSchema.maxLength ?? undefined}
              onChange={(event) => setNote(event.target.value)}
            />
          ) : null}
          {failedInDialog ? (
            <p role="alert" className={NOTICE}>
              {uk.kabinet.operator.errors.failed}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 tablet:flex-row tablet:justify-end">
            <Button variant="secondary" onClick={close}>
              {uk.kabinet.profileEdit.pause.cancel}
            </Button>
            <Button
              variant="primary"
              aria-disabled={!noteReady || busy || undefined}
              aria-busy={mine || undefined}
              onClick={onAllow}
            >
              {t.allow}
            </Button>
          </div>
        </Modal>
      ) : null}
    </Panel>
  );
}
