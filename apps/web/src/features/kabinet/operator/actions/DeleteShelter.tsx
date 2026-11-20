"use client";

import "../../../../zod-client-config";
import type { ShelterDeletionCounts } from "@opika/contracts";
import { pluralizeUk, type UkrainianPluralForms } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { useId, useRef, useState } from "react";
import { Button } from "../../../../ui/Button";
import { TextField } from "../../../../ui/form";
import { Modal } from "../../../../ui/Modal";
import { Text } from "../../../../ui/Text";
import { OPERATOR_HOME } from "../../routes";
import { rememberDeletedShelter } from "../deleted-notice";
import { useOperatorActions } from "./operator-actions";
import { NOTICE } from "./styles";

const OWNER = "delete-shelter";
const t = uk.kabinet.operator.deleteShelter;

const countOf = (count: number, forms: UkrainianPluralForms): string =>
  fillTemplate(pluralizeUk(count, forms), { count: String(count) });

/** The line above the body (owner, 2026-11-20): every card, the published ones, the admins. */
export const countsLine = (counts: ShelterDeletionCounts): string =>
  fillTemplate(t.counts, {
    animals: countOf(counts.animals, t.countsAnimals),
    published: String(counts.published),
    admins: countOf(counts.admins, t.countsAdmins),
  });

/**
 * Whether the typed name confirms: the input trimmed, the stored name as it is (every write path
 * stores it trimmed, `ShelterDisplayNameInputSchema`), compared exactly. The server checks the same.
 */
export const nameConfirms = (typed: string, displayName: string): boolean =>
  typed.trim() === displayName;

type Counts =
  | { kind: "loading" }
  | { kind: "ready"; counts: ShelterDeletionCounts }
  | { kind: "failed" };

/** What the dialog says under the field: nothing, the page changed, a failure, or a lost answer. */
type Notice = "none" | "changed" | "failed" | "checking";

/**
 * «Видалити притулок» (owner, 2026-11-20): the operator's only, on any shelter. The dialog reads
 * the live counts when it opens and shows them above the body; the confirm stays disabled until
 * the name is typed exactly. The request carries the counts shown: if the server finds others
 * under its lock, it answers with fresh ones and the dialog shows them, after the page is read
 * again (so «Сторінку оновлено» is true). Done lands on the shelters list with `done`.
 */
export function DeleteShelter() {
  const { view, phase, run, navigate, reread } = useOperatorActions();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<Counts>({ kind: "loading" });
  const [typed, setTyped] = useState("");
  const [notice, setNotice] = useState<Notice>("none");
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const mine = phase.kind !== "idle" && phase.owner === OWNER;
  const locked = mine || notice === "checking";

  const loadCounts = async (): Promise<void> => {
    setCounts({ kind: "loading" });
    const settled = await run({
      owner: OWNER,
      call: (client) => client.registry.shelters.deletionCounts({ shelterId: view.id }),
      landed: () => false,
      rereads: false,
    });
    if (settled.kind === "ok") setCounts({ kind: "ready", counts: settled.value });
    else if (settled.kind !== "busy") setCounts({ kind: "failed" });
  };

  const done = (name: string) => {
    rememberDeletedShelter(name);
    navigate(OPERATOR_HOME);
  };

  /** After a lost answer: the shelter gone means the deletion landed. */
  const checkLanded = async (name: string): Promise<void> => {
    setNotice("checking");
    const settled = await run({
      owner: OWNER,
      call: (client) => client.registry.shelters.deletionCounts({ shelterId: view.id }),
      landed: () => false,
      rereads: false,
    });
    if (settled.kind === "refused" && settled.failure.kind === "not_found") done(name);
    else setNotice("failed");
  };

  const onOpen = () => {
    setTyped("");
    setNotice("none");
    setOpen(true);
    void loadCounts();
  };

  const close = () => {
    if (locked) return;
    setOpen(false);
    const opener = openerRef.current;
    requestAnimationFrame(() => opener?.focus());
  };

  const ready =
    counts.kind === "ready" && nameConfirms(typed, view.displayName) && phase.kind === "idle";

  const onConfirm = async () => {
    if (!ready || counts.kind !== "ready") return;
    setNotice("none");
    const name = typed.trim();
    const settled = await run({
      owner: OWNER,
      call: (client) =>
        client.registry.shelters.delete({
          shelterId: view.id,
          typedName: typed,
          counts: counts.counts,
        }),
      landed: () => false,
      // The page would read as 404 once the shelter is gone.
      rereads: false,
    });
    switch (settled.kind) {
      case "busy":
        return;
      case "ok":
        switch (settled.value.kind) {
          case "deleted":
            done(settled.value.name);
            return;
          case "counts_changed":
            setCounts({ kind: "ready", counts: settled.value.counts });
            break;
          case "name_mismatch":
            // Renamed meanwhile: the re-read shows the new name, which the field must now match.
            break;
          /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
          default: {
            const unreachable: never = settled.value;
            return unreachable;
          }
        }
        setNotice((await reread()) === null ? "failed" : "changed");
        return;
      case "lost":
        await checkLanded(name);
        return;
      case "refused":
        // Gone already (another tab): there is nothing left to delete or to show.
        if (settled.failure.kind === "not_found") navigate(OPERATOR_HOME);
        else setNotice("failed");
        return;
      /* v8 ignore next 4 -- exists so the compiler rejects an unhandled outcome; unreachable at runtime */
      default: {
        const unreachable: never = settled;
        return unreachable;
      }
    }
  };

  return (
    <>
      <Button
        ref={openerRef}
        variant="secondary"
        className="self-start"
        aria-disabled={phase.kind !== "idle" || undefined}
        onClick={() => {
          if (phase.kind === "idle") onOpen();
        }}
      >
        {t.button}
      </Button>
      {open ? (
        <Modal
          open
          title={t.title}
          closeLabel={uk.kabinet.profileEdit.pause.close}
          locked={locked}
          onClose={close}
        >
          <p aria-live="polite" className={NOTICE}>
            {counts.kind === "ready" ? countsLine(counts.counts) : null}
          </p>
          {counts.kind === "failed" ? (
            <p role="alert" className={NOTICE}>
              {uk.kabinet.operator.errors.failed}
            </p>
          ) : null}
          <Text>{fillTemplate(t.body, { name: view.displayName })}</Text>
          <TextField
            id={`${id}-name`}
            label={t.confirmLabel}
            value={typed}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setTyped(event.target.value)}
          />
          <p role="status" className={NOTICE}>
            {notice === "checking"
              ? uk.kabinet.operator.errors.lostAnswer
              : notice === "changed"
                ? uk.kabinet.operator.errors.conflictReload
                : null}
          </p>
          {notice === "failed" ? (
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
              aria-disabled={!ready || undefined}
              aria-busy={mine || undefined}
              onClick={onConfirm}
            >
              {t.confirm}
            </Button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
