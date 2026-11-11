"use client";

import "../../../../zod-client-config";
import type { RegistryShelterView } from "@opika/contracts";
import { uk } from "@opika/i18n";
import { useRef, useState } from "react";
import { Button } from "../../../../ui/Button";
import { Text } from "../../../../ui/Text";
import { DonationRemoveDialog } from "./DonationRemoveDialog";
import { useOperatorActions } from "./operator-actions";
import { ACTIONS, NOTICE } from "./styles";

const OWNER = "donation";

type Decision = "approve" | "reject";
type Notice =
  | { kind: "none" }
  | { kind: "decided"; decision: Decision }
  | { kind: "removed" }
  | { kind: "conflict" }
  | { kind: "remove_conflict" }
  | { kind: "failed" };

/**
 * N20 on S4: approve or reject the donation link the shelter proposed, as the
 * operator read it. The version read travels with the decision (RG-Q12), so a
 * re-proposal or a cancellation in between is CONFLICT; the page is then read
 * again and shows the current proposal (`donation.conflict`). Not a
 * verification move, so no reason dialog and no confirmation (KABINET N20).
 *
 * The proposal itself (`donation.proposed`, the live link beside it) is the
 * read-only donation section's; this sits under it (`ShelterActionsScreen`).
 */
export function DonationDecision() {
  const { view, phase, run } = useOperatorActions();
  const t = uk.kabinet.operator;
  const [notice, setNotice] = useState<Notice>({ kind: "none" });
  const busy = phase.kind !== "idle";
  const mine = busy && phase.owner === OWNER;
  const pending = view.pendingDonation;
  const [removing, setRemoving] = useState(false);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  const decide = async (decision: Decision) => {
    if (busy || pending === null) return;
    setNotice({ kind: "none" });
    const input = { shelterId: view.id, expectedVersion: view.version };
    const liveBefore = view.donation?.url ?? null;
    const landed = (fresh: RegistryShelterView): boolean =>
      fresh.pendingDonation === null &&
      (fresh.donation?.url ?? null) === (decision === "approve" ? pending.link.url : liveBefore);
    const settled = await run({
      owner: OWNER,
      call: (client) =>
        decision === "approve"
          ? client.registry.donation.approve(input)
          : client.registry.donation.reject(input),
      viewOf: (answered) => answered,
      landed,
    });
    switch (settled.kind) {
      case "busy":
        return;
      case "ok":
        setNotice({ kind: "decided", decision });
        return;
      case "lost":
        setNotice(settled.landed ? { kind: "decided", decision } : { kind: "failed" });
        return;
      case "refused":
        setNotice(
          settled.failure.kind === "conflict" && settled.reread === "done"
            ? { kind: "conflict" }
            : { kind: "failed" },
        );
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
      {view.donation !== null ? (
        <div className={ACTIONS}>
          <Button
            variant="secondary"
            aria-disabled={busy || undefined}
            onClick={(event) => {
              if (busy) return;
              setNotice({ kind: "none" });
              openerRef.current = event.currentTarget;
              setRemoving(true);
            }}
          >
            {t.donation.remove}
          </Button>
        </div>
      ) : null}
      {pending !== null && view.verification.status !== "suspended" ? (
        <Text look="hint">
          {view.legalEntity?.kind === "unregistered_initiative"
            ? t.donation.approveHintInitiative
            : t.donation.approveHint}
        </Text>
      ) : null}
      {pending !== null ? (
        <div className={ACTIONS}>
          {/* Not offered while suspended: a reinstatement must not publish it unseen. */}
          {view.verification.status === "suspended" ? null : (
            <Button
              aria-disabled={busy || undefined}
              aria-busy={mine || undefined}
              onClick={() => decide("approve")}
            >
              {t.donation.approve}
            </Button>
          )}
          <Button
            variant="secondary"
            aria-disabled={busy || undefined}
            onClick={() => decide("reject")}
          >
            {t.donation.reject}
          </Button>
        </div>
      ) : null}
      <p role="status" className={NOTICE}>
        {mine && phase.kind === "checking"
          ? t.errors.lostAnswer
          : notice.kind === "decided"
            ? notice.decision === "approve"
              ? // A later suspension demotes the live link; the old line must not outlive it.
                view.donation === null
                ? null
                : t.donation.approved
              : t.donation.rejected
            : notice.kind === "removed"
              ? t.donation.removed
              : notice.kind === "conflict"
                ? t.donation.conflict
                : notice.kind === "remove_conflict"
                  ? t.donation.removeConflict
                  : null}
      </p>
      {notice.kind === "failed" ? (
        <p role="alert" className={NOTICE}>
          {t.errors.failed}
        </p>
      ) : null}
      {removing ? (
        <DonationRemoveDialog
          owner={OWNER}
          onClose={() => {
            setRemoving(false);
            const opener = openerRef.current;
            requestAnimationFrame(() => opener?.focus());
          }}
          onDone={(outcome) => {
            setRemoving(false);
            setNotice(
              outcome === "removed"
                ? { kind: "removed" }
                : outcome === "conflict"
                  ? { kind: "remove_conflict" }
                  : { kind: "failed" },
            );
          }}
        />
      ) : null}
    </div>
  );
}
