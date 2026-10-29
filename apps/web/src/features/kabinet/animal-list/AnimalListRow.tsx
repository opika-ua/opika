"use client";

import { fillTemplate, uk } from "@opika/i18n";
import Link from "next/link";
import { useId } from "react";
import { Button, type ButtonVariant, LinkButton } from "../../../ui/Button";
import { FreshnessPips } from "../../../ui/FreshnessPips";
import { Heading } from "../../../ui/Heading";
import { Menu, MenuItem } from "../../../ui/Menu";
import { Panel } from "../../../ui/Panel";
import { Photo } from "../../../ui/Photo";
import { Text } from "../../../ui/Text";
import { missingSentence } from "../animal-form/labels";
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
import { ListingStatusChip } from "./RowParts";

const t = uk.kabinet.animalList;

/** «Ще»'s id, so the list can give it focus back when a dialog it opened closes. */
export const moreButtonId = (animalId: string): string => `animal-more-${animalId}`;

/** Filled only for the one move that changes what people see; routine upkeep outlined; the rest plain. */
const FORWARD_VARIANT: Record<Exclude<RowAction, "edit">, Exclude<ButtonVariant, "icon">> = {
  publish: "primary",
  restore: "secondary",
  reserve: "ghost",
  adopt: "ghost",
  release: "ghost",
  withdraw: "ghost",
  deleteDraft: "ghost",
};

/**
 * One card in K2's list. Reading order is the order a volunteer decides in: who it is (photo,
 * name, status, species · sex · size · age), where it stands (the freshness pips and the day count
 * in words, or the closed date), then what to do.
 *
 * Action weight: the filled button is kept for «Опублікувати» on a draft, the one move that
 * changes what people see. The routine upkeep («Ще шукає» / «Ще домовляються», or «Повернути в
 * чернетки») is outlined and sits right under the date it moves; the next step in the card's life
 * («Почали домовлятися», «Уже вдома») and «Ще» are plain. «Зняти з показу» stays in «Ще».
 *
 * The name opens the card's form (it was only reachable through «Ще» before); «Редагувати» stays
 * in «Ще» too. The repeated buttons get the animal's name through `aria-describedby` (P4); the
 * photo is a second, hidden way into the same form for people who tap the picture.
 *
 * `editable` false (the support view, S5) keeps every write visible and `aria-disabled`,
 * focusable, doing nothing; «Редагувати» stays a link, to K3's read-only page.
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
  const kind = row.listing.kind;
  const { forward, menu } = rowActionsOf(kind);
  const confirmLabel = confirmLabelOf(kind);
  const unready = kind === "draft" && row.publishGaps.length > 0;
  const inert = !editable || busy;
  const href = animalPath(row.id);

  const act = (action: Exclude<RowAction, "edit">) => {
    if (inert) return;
    onToggleMenu(false);
    onAction(action);
  };

  return (
    <li aria-labelledby={nameId}>
      <Panel
        padding="lg"
        className="flex flex-col gap-4 desktop:flex-row desktop:items-center desktop:justify-between desktop:gap-8"
      >
        <div className="flex min-w-0 gap-4 desktop:w-72 desktop:flex-none">
          <Link href={href} prefetch={false} tabIndex={-1} aria-hidden="true" className="shrink-0">
            <Photo
              src={row.coverPhoto?.storageKey ?? null}
              alt=""
              sizes="(min-width: 1024px) 112px, (min-width: 600px) 96px, 80px"
              aspect="square"
              className="size-20 rounded-panel tablet:size-24 desktop:size-28"
            />
          </Link>
          <div className="flex min-w-0 flex-col gap-2">
            <Heading level={2} look="body-l" id={nameId} className="break-words">
              <Link
                href={href}
                prefetch={false}
                className="focus-ring rounded-field underline-offset-4 hover:underline"
              >
                {row.name}
              </Link>
            </Heading>
            <ListingStatusChip kind={kind} />
            <p className="text-body text-ink-2">{metaLineOf(row, now)}</p>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4 desktop:flex-1">
          <div className="flex flex-col gap-1">
            {row.freshness !== null ? (
              <FreshnessPips kind={row.freshness.kind} label={statusLineOf(row, now)} />
            ) : (
              <Text look="body">{statusLineOf(row, now)}</Text>
            )}
            {unready ? (
              <Text look="hint" id={gapsId}>
                {missingSentence(row.publishGaps)}
              </Text>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {undoSeconds !== null ? (
              <>
                <Text look="label">
                  <span aria-hidden="true">✓ </span>
                  {t.confirm.done}
                </Text>
                <Button
                  variant="ghost"
                  aria-describedby={nameId}
                  aria-disabled={inert || undefined}
                  onClick={() => {
                    if (!inert) onUndo();
                  }}
                >
                  {fillTemplate(t.confirm.undo, { seconds: String(undoSeconds) })}
                </Button>
              </>
            ) : confirmLabel !== null ? (
              <Button
                variant="secondary"
                className="w-full tablet:w-auto"
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

            {forward !== null && forward !== "edit" ? (
              <Button
                variant={FORWARD_VARIANT[forward]}
                className={forward === "publish" ? "flex-1 tablet:flex-none" : undefined}
                aria-describedby={unready ? `${nameId} ${gapsId}` : nameId}
                aria-disabled={inert || unready || undefined}
                onClick={() => {
                  if (!unready) act(forward);
                }}
              >
                {actionLabelOf(forward)}
              </Button>
            ) : null}

            <Menu
              open={menuOpen}
              onOpenChange={onToggleMenu}
              label={t.row.more}
              triggerId={moreButtonId(row.id)}
              describedBy={nameId}
              className="ml-auto"
            >
              {menu.map((action) => (
                <MenuItem key={action}>
                  {action === "edit" ? (
                    <LinkButton
                      variant="ghost"
                      href={href}
                      prefetch={false}
                      className="w-full justify-start"
                    >
                      {actionLabelOf(action)}
                    </LinkButton>
                  ) : (
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      aria-disabled={inert || undefined}
                      onClick={() => act(action)}
                    >
                      {actionLabelOf(action)}
                    </Button>
                  )}
                </MenuItem>
              ))}
            </Menu>
          </div>
        </div>
      </Panel>
    </li>
  );
}
