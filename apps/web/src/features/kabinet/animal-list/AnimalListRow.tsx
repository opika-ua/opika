"use client";

import { fillTemplate, uk } from "@opika/i18n";
import { freshnessPips } from "@opika/ui";
import { useId, useRef } from "react";
import { Button, buttonClass } from "../../controls/controls";
import { missingSentence } from "../animal-form/labels";
import { BODY, CAPTION, CARD, STRONG } from "../profile-edit/styles";
import { animalPath } from "../routes";
import {
  type AnimalRow,
  actionLabelOf,
  confirmLabelOf,
  metaLineOf,
  type RowAction,
  rowActionsOf,
  statusLineOf,
} from "./list-model";

const t = uk.kabinet.animalList;

/** «Ще»'s id, so the list can give it focus back when a dialog it opened closes. */
export const moreButtonId = (animalId: string): string => `animal-more-${animalId}`;

/**
 * One card in K2's list (KAB K2, the row; sheet §4): its name, the status
 * chip, species · sex · size · age, the line that says where it stands, and
 * its actions: «Ще шукає» / «Ще домовляються» under the date, one forward
 * action, and the rest under «Ще».
 *
 * The repeated buttons («Ще», «Ще шукає», the forward action) get the
 * animal's name through `aria-describedby` (P4), so a screen reader hears
 * whose they are with no template string; the glyphs (✓, ▾) are hidden from
 * it. «Ще» is a disclosure (a button that shows a list of buttons), not an
 * ARIA menu, so nothing about it needs arrow keys; Escape closes it.
 *
 * `editable` false (the support view, S5) keeps every write visible and
 * `aria-disabled`, focusable, doing nothing; «Редагувати» stays a link, to
 * K3's read-only page.
 */
export function AnimalListRow({
  row,
  now,
  editable,
  busy,
  undoSeconds,
  menuOpen,
  onToggleMenu,
  onAction,
  onConfirm,
  onUndo,
}: {
  row: AnimalRow;
  now: Date;
  editable: boolean;
  busy: boolean;
  /** Seconds left on the screen's undo, or null when no confirmation of this card is undoable. */
  undoSeconds: number | null;
  menuOpen: boolean;
  onToggleMenu: (open: boolean) => void;
  onAction: (action: Exclude<RowAction, "edit">) => void;
  onConfirm: () => void;
  onUndo: () => void;
}) {
  const id = useId();
  const nameId = `${id}-name`;
  const gapsId = `${id}-gaps`;
  const menuId = `${id}-menu`;
  const moreRef = useRef<HTMLButtonElement | null>(null);
  const kind = row.listing.kind;
  const { forward, menu } = rowActionsOf(kind);
  const confirmLabel = confirmLabelOf(kind);
  const unready = kind === "draft" && row.publishGaps.length > 0;
  const inert = !editable || busy;

  const act = (action: Exclude<RowAction, "edit">) => {
    if (inert) return;
    onToggleMenu(false);
    onAction(action);
  };

  return (
    <li aria-labelledby={nameId} className={CARD}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 id={nameId} className="text-xl font-bold tracking-tight break-words text-rg-ink">
          {row.name}
        </h2>
        <span className="rounded-rg-chip bg-rg-fill px-3 py-1 text-sm font-medium text-rg-ink-2">
          {uk.kabinet.listingStatus[kind]}
        </span>
      </div>
      <p className={CAPTION}>{metaLineOf(row, now)}</p>

      <div className="flex flex-col items-start gap-2">
        <div className="flex items-center gap-2">
          {row.freshness !== null ? (
            <span aria-hidden="true" className="flex gap-1">
              {freshnessPips(row.freshness.kind).map((fill, index) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: three fixed positions, never reordered
                  key={index}
                  className={`size-2.5 rounded-full ${fill === "empty" ? "border-2 border-rg-ink-3" : fill}`}
                />
              ))}
            </span>
          ) : null}
          <p className={BODY}>{statusLineOf(row, now)}</p>
        </div>
        {unready ? (
          <p id={gapsId} className={CAPTION}>
            {missingSentence(row.publishGaps)}
          </p>
        ) : null}
        {undoSeconds !== null ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className={STRONG}>
              <span aria-hidden="true">✓ </span>
              {t.confirm.done}
            </p>
            <Button
              variant="text"
              aria-describedby={nameId}
              aria-disabled={inert || undefined}
              onClick={() => {
                if (!inert) onUndo();
              }}
            >
              {fillTemplate(t.confirm.undo, { seconds: String(undoSeconds) })}
            </Button>
          </div>
        ) : confirmLabel !== null ? (
          <Button
            variant="secondary"
            aria-describedby={nameId}
            aria-disabled={inert || undefined}
            onClick={() => {
              if (!inert) onConfirm();
            }}
          >
            <span aria-hidden="true">✓ </span>
            {confirmLabel}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-start gap-2">
        {forward !== null && forward !== "edit" ? (
          <Button
            variant="primary"
            aria-describedby={unready ? `${nameId} ${gapsId}` : nameId}
            aria-disabled={inert || unready || undefined}
            onClick={() => {
              if (!unready) act(forward);
            }}
          >
            {actionLabelOf(forward)}
          </Button>
        ) : null}
        <div className="flex flex-col items-start gap-1">
          <Button
            ref={moreRef}
            id={moreButtonId(row.id)}
            variant="text"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? menuId : undefined}
            aria-describedby={nameId}
            onClick={() => onToggleMenu(!menuOpen)}
          >
            {t.row.more}
            <span aria-hidden="true"> ▾</span>
          </Button>
          {menuOpen ? (
            <ul
              id={menuId}
              className="flex flex-col items-start gap-1"
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                onToggleMenu(false);
                moreRef.current?.focus();
              }}
            >
              {menu.map((action) => (
                <li key={action}>
                  {action === "edit" ? (
                    <a href={animalPath(row.id)} className={buttonClass("text")}>
                      {actionLabelOf(action)}
                    </a>
                  ) : (
                    <Button
                      variant="text"
                      aria-disabled={inert || undefined}
                      onClick={() => act(action)}
                    >
                      {actionLabelOf(action)}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </li>
  );
}
