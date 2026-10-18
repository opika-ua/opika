"use client";

import { uk } from "@opika/i18n";
import { useId, useState } from "react";
import { Button, TextField } from "../../../controls/controls";
import { useOperatorActions } from "./operator-actions";
import { ACTIONS, NOTICE } from "./styles";

const OWNER = "rename";

/**
 * What the form last said. `required` is the field's own message (nothing
 * was sent); the rest are what became of a request.
 */
type Notice =
  | { kind: "none" }
  | { kind: "required" }
  | { kind: "saved" }
  | { kind: "conflict" }
  | { kind: "failed" };

/**
 * The name as `registry.shelters.updateProfile` takes it: trimmed, then
 * required, the contract's own rule (create's `humanName`). Null when nothing
 * is left, which the form answers with create's «Це поле потрібне.» rather
 * than a round trip the server would refuse.
 */
export const renameInputOf = (typed: string): string | null => {
  const name = typed.trim();
  return name === "" ? null : name;
};

/**
 * R-UI 4 on S4: the operator renames the shelter (his answer 8, verbatim:
 * "Yes: rename as R-UI 4, with a history line."). One field, his «Назва
 * притулку» (`create.name`), and his «Зберегти» (`profileEdit.actions.save`),
 * offered only while the field holds a different name, so there is never a
 * button that does nothing.
 *
 * The version read travels with the name, and it goes through S4's one
 * runner (`OperatorActionsProvider`), so R-UI 3's rules hold here too: one
 * request at a time across the page; a CONFLICT re-reads the page before
 * saying «Дані змінилися… Сторінку оновлено.», and the field then shows the
 * name as it is now, so a second press can't overwrite a change the operator
 * hasn't seen; a lost answer re-reads before saying anything, and the fresh
 * record decides between «Збережено.» and the failure. Every string is his,
 * reused: no new copy on an operator screen.
 */
export function RenameForm() {
  const { view, phase, run } = useOperatorActions();
  const t = uk.kabinet.operator;
  const edit = uk.kabinet.profileEdit;
  const id = useId();
  // Null: untouched, so the field shows the current name, a re-read's included.
  const [draft, setDraft] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>({ kind: "none" });
  const busy = phase.kind !== "idle";
  const mine = busy && phase.owner === OWNER;
  const text = draft ?? view.displayName;
  const dirty = draft !== null && draft.trim() !== view.displayName;

  const save = async () => {
    if (busy) return;
    const displayName = renameInputOf(text);
    if (displayName === null) {
      setNotice({ kind: "required" });
      return;
    }
    // The name it already has (Enter in an untouched field, or only spaces
    // added): nothing to send, and nothing to claim was saved.
    if (displayName === view.displayName) {
      setDraft(null);
      return;
    }
    setNotice({ kind: "none" });
    const settled = await run({
      owner: OWNER,
      call: (client) =>
        client.registry.shelters.updateProfile({
          shelterId: view.id,
          expectedVersion: view.version,
          displayName,
        }),
      viewOf: (answered) => answered,
      landed: (fresh) => fresh.displayName === displayName,
    });
    switch (settled.kind) {
      case "busy":
        return;
      case "ok":
        setDraft(null);
        setNotice({ kind: "saved" });
        return;
      case "lost":
        if (settled.landed) {
          setDraft(null);
          setNotice({ kind: "saved" });
        } else {
          setNotice({ kind: "failed" });
        }
        return;
      case "refused":
        if (settled.failure.kind === "conflict" && settled.reread === "done") {
          // The page now shows the record as it is; so does the field.
          setDraft(null);
          setNotice({ kind: "conflict" });
        } else {
          setNotice({ kind: "failed" });
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
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <TextField
        id={id}
        label={t.create.name}
        value={text}
        autoComplete="off"
        error={notice.kind === "required" ? t.create.errors.required : null}
        onChange={(event) => {
          setDraft(event.target.value);
          setNotice({ kind: "none" });
        }}
      />
      {dirty || mine ? (
        <div className={ACTIONS}>
          <Button type="submit" aria-disabled={busy || undefined} aria-busy={mine || undefined}>
            {mine && phase.kind === "sending" ? edit.state.saving : edit.actions.save}
          </Button>
        </div>
      ) : null}
      <p role="status" className={NOTICE}>
        {mine && phase.kind === "checking"
          ? t.errors.lostAnswer
          : notice.kind === "saved"
            ? edit.state.saved
            : null}
      </p>
      {notice.kind === "conflict" ? (
        <p role="alert" className={NOTICE}>
          {t.errors.conflictReload}
        </p>
      ) : null}
      {notice.kind === "failed" ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className={NOTICE}>{t.errors.failed}</p>
          <Button variant="text" onClick={() => void save()}>
            {edit.state.retry}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
