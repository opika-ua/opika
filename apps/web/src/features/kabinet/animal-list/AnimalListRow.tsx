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

/** The freshness line's phone slot: the photo's column, under the chip. */
const PHONE_FRESHNESS = "max-tablet:col-span-2 max-tablet:col-start-2 max-tablet:row-start-4 min-w-0";

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
      {/* Phone: a framed card laid out as a grid (photo | name | menu, then meta, chip, freshness
          beside the photo, then the gaps hint and the button full width); the wrappers are
          `contents` there so the freshness line can sit up in the photo's column without a second
          copy in the DOM. From `tablet` they are the flex boxes they always were. */}
      <Panel
        padding="none"
        className="grid grid-cols-[6rem_minmax(0,1fr)_auto] gap-x-3 gap-y-2 p-3.5 max-tablet:rounded-card max-tablet:border-[1.5px] max-tablet:border-line tablet:flex tablet:flex-col tablet:gap-4 tablet:p-5 desktop:flex-row desktop:items-center desktop:justify-between desktop:gap-8 desktop:p-6"
      >
        <div className="contents min-w-0 tablet:flex tablet:gap-4 desktop:w-72 desktop:flex-none">
          <Link
            href={href}
            prefetch={false}
            tabIndex={-1}
            aria-hidden="true"
            className="shrink-0 max-tablet:col-start-1 max-tablet:row-span-4 max-tablet:row-start-1 max-tablet:flex"
          >
            <Photo
              src={row.coverPhoto?.storageKey ?? null}
              alt=""
              sizes="(min-width: 1024px) 112px, (min-width: 600px) 96px, 80px"
              aspect="square"
              className="w-24 rounded-panel max-tablet:min-h-28 tablet:size-24 desktop:size-28"
            />
          </Link>
          <div className="contents min-w-0 tablet:flex tablet:flex-1 tablet:flex-col tablet:gap-2">
            <Heading
              level={2}
              look="body-l"
              id={nameId}
              className="min-w-0 max-tablet:col-start-2 max-tablet:row-start-1 tablet:break-words"
            >
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
            <div className="max-tablet:col-span-2 max-tablet:col-start-2 max-tablet:row-start-3 tablet:contents">
              <ListingStatusChip kind={kind} />
            </div>
            <p className="truncate text-body text-ink-2 max-tablet:col-span-2 max-tablet:col-start-2 max-tablet:row-start-2 tablet:overflow-visible tablet:text-clip tablet:whitespace-normal">
              {metaLineOf(row, now)}
            </p>
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
            className="-mr-2 shrink-0 max-tablet:col-start-3 max-tablet:row-start-1 tablet:hidden"
          >
            {items}
          </Menu>
        </div>

        <div className="contents min-w-0 tablet:flex tablet:flex-col tablet:gap-4 desktop:flex-1">
          <div className="contents tablet:flex tablet:flex-col tablet:gap-1">
            {row.freshness !== null ? (
              <FreshnessPips
                kind={row.freshness.kind}
                label={statusLineOf(row, now)}
                className={PHONE_FRESHNESS}
              />
            ) : (
              <Text look="body" className={PHONE_FRESHNESS}>
                {statusLineOf(row, now)}
              </Text>
            )}
            {unready ? (
              <Text look="hint" id={gapsId} className="max-tablet:col-span-3 max-tablet:mt-1">
                {missingSentence(row.publishGaps)}
              </Text>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 max-tablet:col-span-3 max-tablet:mt-1">
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
