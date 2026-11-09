"use client";

import "../../../zod-client-config";
import { fillTemplate, uk } from "@opika/i18n";
import Link from "next/link";
import { Fragment, useId, useState } from "react";
import { Button, type ButtonVariant, LinkButton } from "../../../ui/Button";
import { FreshnessPips } from "../../../ui/FreshnessPips";
import { Heading } from "../../../ui/Heading";
import { Menu, MenuDivider, MenuItem } from "../../../ui/Menu";
import { Panel } from "../../../ui/Panel";
import { Photo } from "../../../ui/Photo";
import { Text } from "../../../ui/Text";
import { missingSentence } from "../animal-form/labels";
import { animalPath, publicAnimalPath } from "../routes";
import { ListingStatusChip } from "../StatusChips";
import {
  type AnimalRow,
  actionLabelOf,
  confirmLabelOf,
  DANGER_ENTRIES,
  metaLineOf,
  type RowAction,
  rowActionsOf,
  statusLineOf,
} from "./list-model";

const t = uk.kabinet.animalList;

/** «Ще»'s id, so the list can give it focus back when a dialog it opened closes. */
export const moreButtonId = (animalId: string): string => `animal-more-${animalId}`;
/** The phone's copy of the menu (top-right corner); only one of the two is ever displayed. */
export const moreButtonPhoneId = (animalId: string): string => `animal-more-phone-${animalId}`;

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
 * `editable` false (the support view, S5) leaves out every write button (they looked live and did
 * nothing); «Редагувати» and «Переглянути на сайті» stay links, to K3's read-only page and the site.
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
  // Two triggers in the DOM, one displayed per breakpoint (the phone's sits in the card's top-right
  // corner, ahead of the confirm button in tab order); `via` keeps just the clicked one open.
  const [via, setVia] = useState<"top" | "bottom">("bottom");
  const nameId = `${id}-name`;
  const gapsId = `${id}-gaps`;
  const kind = row.listing.kind;
  const { forward, menu } = rowActionsOf(kind);
  const firstDanger = menu.find((entry) => DANGER_ENTRIES.has(entry));
  const confirmLabel = confirmLabelOf(kind);
  const unready = kind === "draft" && row.publishGaps.length > 0;
  const inert = !editable || busy;
  const href = animalPath(row.id);

  const act = (action: Exclude<RowAction, "edit">) => {
    if (inert) return;
    onToggleMenu(false);
    onAction(action);
  };

  const items = (
    <>
      {menu
        .filter((action) => editable || action === "edit" || action === "viewOnSite")
        .map((action) => (
          <Fragment key={action}>
            {DANGER_ENTRIES.has(action) && action === firstDanger ? <MenuDivider /> : null}
            <MenuItem tone={DANGER_ENTRIES.has(action) ? "danger" : "default"}>
              {action === "edit" ? (
                <LinkButton
                  variant="ghost"
                  href={href}
                  prefetch={false}
                  className="w-full justify-start"
                >
                  {actionLabelOf(action)}
                </LinkButton>
              ) : action === "viewOnSite" ? (
                <LinkButton
                  variant="ghost"
                  href={publicAnimalPath(row.id)}
                  target="_blank"
                  rel="noopener"
                  prefetch={false}
                  className="w-full justify-start"
                >
                  {actionLabelOf(action)}
                  <span className="sr-only"> {uk.kabinet.shell.newTab}</span>
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
          </Fragment>
        ))}
    </>
  );

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
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Heading level={2} look="body-l" id={nameId} className="min-w-0 tablet:break-words">
              <Link
                href={href}
                prefetch={false}
                className="inline-flex min-h-target max-w-full items-center focus-ring rounded-field underline-offset-4 hover:underline"
              >
                <span className="min-w-0 truncate tablet:whitespace-normal tablet:break-words">
                  {row.name}
                </span>
              </Link>
            </Heading>
            <ListingStatusChip kind={kind} />
            <p className="text-body text-ink-2">{metaLineOf(row, now)}</p>
          </div>
          <Menu
            open={menuOpen && via === "top"}
            onOpenChange={(open) => {
              setVia("top");
              onToggleMenu(open);
            }}
            trigger="icon-plain"
            label={fillTemplate(t.row.menuLabel, { name: row.name })}
            triggerId={moreButtonPhoneId(row.id)}
            className="-mr-2 shrink-0 tablet:hidden"
          >
            {items}
          </Menu>
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
            {!editable ? null : undoSeconds !== null ? (
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

            {editable && forward !== null && forward !== "edit" ? (
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
              open={menuOpen && via === "bottom"}
              onOpenChange={(open) => {
                setVia("bottom");
                onToggleMenu(open);
              }}
              trigger="icon"
              label={fillTemplate(t.row.menuLabel, { name: row.name })}
              triggerId={moreButtonId(row.id)}
              className="ml-auto hidden tablet:block"
            >
              {items}
            </Menu>
          </div>
        </div>
      </Panel>
    </li>
  );
}
