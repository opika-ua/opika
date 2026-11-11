"use client";

import "../../../../zod-client-config";
import { uk } from "@opika/i18n";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Button } from "../../../../ui/Button";
import { TextArea } from "../../../../ui/form";
import { aboutCounterText, aboutInputOf, aboutOverBy, aboutTooLongMessage } from "../about-text";
import { useOperatorActions } from "./operator-actions";
import { ACTIONS, NOTICE } from "./styles";

const OWNER = "about";

type Notice =
  | { kind: "none" }
  | { kind: "saved" }
  | { kind: "conflict" }
  | { kind: "too_long" }
  | { kind: "failed" };

/**
 * «Змінити» (or «Додати», none on file yet) on S4's «Про притулок»: the operator edits the shelter's
 * text through `registry.shelters.updateProfile`, by S4's one runner like the rename form, so a
 * CONFLICT re-reads the page before saying «Дані змінилися… Сторінку оновлено.» and a lost answer is
 * checked against the fresh record. A blank text clears it. A stored text over the cap opens with the
 * over-state counter and the message at once, and its save is refused until it is trimmed.
 *
 * The English translation goes back as stored; the server drops it when the Ukrainian changed.
 */
export function AboutForm() {
  const { view, phase, run } = useOperatorActions();
  const t = uk.kabinet.operator;
  const edit = uk.kabinet.profileEdit;
  const id = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<Notice>({ kind: "none" });
  const busy = phase.kind !== "idle";
  const mine = busy && phase.owner === OWNER;
  const stored = view.description;
  const openRef = useRef<HTMLButtonElement>(null);
  // Focus follows the form: into the field when it opens, back to the button when it closes.
  const [focusTarget, setFocusTarget] = useState<"field" | "button" | null>(null);
  useEffect(() => {
    if (focusTarget === "field") document.getElementById(id)?.focus();
    if (focusTarget === "button") openRef.current?.focus();
    setFocusTarget(null);
  }, [focusTarget, id]);

  const over = aboutOverBy(text);
  const tooLong = over > 0 || notice.kind === "too_long";

  const close = (next: Notice) => {
    setOpen(false);
    setNotice(next);
    setFocusTarget("button");
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (aboutOverBy(text) > 0) {
      document.getElementById(id)?.focus();
      return;
    }
    const typed = aboutInputOf(text);
    // The same text again (or blank over none): nothing to send, nothing to claim was saved.
    if (typed === (stored?.uk ?? null)) {
      close({ kind: "none" });
      return;
    }
    setNotice({ kind: "none" });
    const settled = await run({
      owner: OWNER,
      call: (client) =>
        client.registry.shelters.updateProfile({
          shelterId: view.id,
          expectedVersion: view.version,
          description: typed === null ? null : { uk: typed, en: stored?.en ?? null },
        }),
      viewOf: (answered) => answered,
      landed: (fresh) => (fresh.description?.uk ?? null) === typed,
    });
    switch (settled.kind) {
      case "busy":
        return;
      case "ok":
        close({ kind: "saved" });
        return;
      case "lost":
        if (settled.landed) close({ kind: "saved" });
        else setNotice({ kind: "failed" });
        return;
      case "refused":
        if (settled.failure.kind === "description_too_long") {
          setNotice({ kind: "too_long" });
        } else if (settled.failure.kind === "conflict" && settled.reread === "done") {
          // The page now shows the record as it is; the form closes so nothing stale is resent.
          close({ kind: "conflict" });
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
    <div className="flex flex-col gap-3">
      {open ? (
        <form noValidate onSubmit={save} className="flex flex-col gap-4">
          <TextArea
            id={id}
            label={uk.shelterPage.aboutHeading}
            hint={t.create.descriptionHint}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setNotice({ kind: "none" });
            }}
            error={tooLong ? aboutTooLongMessage() : null}
            describedBy={[`${id}-counter`]}
          />
          <p
            id={`${id}-counter`}
            aria-live={over > 0 ? "polite" : "off"}
            className={over > 0 ? "text-label text-ink" : "text-caption text-ink-2"}
          >
            {aboutCounterText(text)}
          </p>
          <div className={ACTIONS}>
            <Button type="submit" aria-disabled={busy || undefined} aria-busy={mine || undefined}>
              {mine && phase.kind === "sending" ? edit.state.saving : edit.actions.save}
            </Button>
            <Button
              variant="ghost"
              aria-disabled={mine || undefined}
              onClick={() => {
                if (!mine) close({ kind: "none" });
              }}
            >
              {t.create.cancel}
            </Button>
          </div>
        </form>
      ) : (
        <div className={ACTIONS}>
          <Button
            ref={openRef}
            variant="secondary"
            aria-describedby="operator-description"
            aria-disabled={busy || undefined}
            onClick={() => {
              if (busy) return;
              setText(stored?.uk ?? "");
              setNotice({ kind: "none" });
              setOpen(true);
              setFocusTarget("field");
            }}
          >
            {stored === null ? t.shelter.add : t.shelter.edit}
          </Button>
        </div>
      )}
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
        <p role="alert" className={NOTICE}>
          {t.errors.failed}
        </p>
      ) : null}
    </div>
  );
}
