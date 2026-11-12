"use client";

import "../../../zod-client-config";
import { fillTemplate, uk } from "@opika/i18n";
import Link from "next/link";
import { useId } from "react";
import { Button, LinkButton } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { FreshnessPips } from "../../../ui/FreshnessPips";
import { Heading } from "../../../ui/Heading";
import { Icon } from "../../../ui/Icon";
import { Menu, MenuItem } from "../../../ui/Menu";
import { Photo } from "../../../ui/Photo";
import { Text } from "../../../ui/Text";
import { ListingStatusChip } from "../StatusChips";
import type { MenuStatus, AnimalManageCard as Model, StatusMenuItem } from "./manage-card";

const t = uk.kabinet.animalList;

/*
 * The action row: the primary action left, «Редагувати» and ⋯ right. Both may grow, the pair a
 * thousand times more: on one line the pair takes the spare room (pushed right) and the primary
 * keeps its width; wrapped, each fills its own line, so the primary goes full width and the pair
 * sits right-aligned below. No width threshold, so it holds for any label and card width.
 */
const PRIMARY = "grow";
const REST = "flex grow-1000 items-center justify-end gap-2";

/** Ids the list returns focus to when a dialog or an undo it started is done. */
export const statusTriggerId = (animalId: string): string => `animal-status-${animalId}`;
export const moreTriggerId = (animalId: string): string => `animal-more-${animalId}`;
export const nameLinkId = (animalId: string): string => `animal-name-${animalId}`;

export type CardMenu = "status" | "more";

/**
 * One kabinet animal card (owner's spec v2, 2026-11-12), the same at every width: photo, name and
 * status, the facts, where it stands, then the actions. Only the photo, the name and «Редагувати»
 * open the edit page. Tab order: name, status, confirm or publish, «Редагувати», ⋯ (spec rule 6).
 * `editable` false (the support view) leaves out every write: the status is a plain chip.
 */
export function AnimalManageCard({
  card,
  editable,
  busy,
  undoSeconds,
  openMenu,
  onOpenMenu,
  onMove,
  onPublish,
  onConfirm,
  onUndo,
  onDelete,
  onCopyLink,
}: {
  card: Model;
  editable: boolean;
  busy: boolean;
  /** Seconds left on the confirmation's undo, or null when none of this card is undoable. */
  undoSeconds: number | null;
  openMenu: CardMenu | null;
  onOpenMenu: (menu: CardMenu | null) => void;
  onMove: (item: StatusMenuItem) => void;
  onPublish: () => void;
  onConfirm: () => void;
  onUndo: () => void;
  onDelete: () => void;
  onCopyLink: (href: string) => void;
}) {
  const id = useId();
  const nameId = `${id}-name`;
  const gapsId = `${id}-gaps`;
  const inert = !editable || busy;
  const describedBy = nameId;

  const menuProps = (menu: CardMenu) => ({
    open: openMenu === menu,
    onOpenChange: (open: boolean) => onOpenMenu(open ? menu : null),
  });

  const pick = (run: () => void) => {
    onOpenMenu(null);
    if (!inert) run();
  };

  const statusControl = (
    status: MenuStatus,
    menu: Extract<Model, { status: MenuStatus }>["statusMenu"],
  ) =>
    editable ? (
      <Menu
        {...menuProps("status")}
        trigger="status"
        tone={status}
        text={uk.kabinet.listingStatus[status]}
        label={menu.label}
        triggerId={statusTriggerId(card.id)}
        align="start"
      >
        {menu.items.map((item) => (
          <MenuItem key={item.event}>
            <Button
              variant="ghost"
              className="w-full justify-start"
              aria-disabled={inert || undefined}
              onClick={() => pick(() => onMove(item))}
            >
              {item.label}
            </Button>
          </MenuItem>
        ))}
      </Menu>
    ) : (
      <ListingStatusChip kind={status} />
    );

  const status =
    card.status === "published" || card.status === "reserved" || card.status === "withdrawn" ? (
      statusControl(card.status, card.statusMenu)
    ) : (
      <ListingStatusChip kind={card.status} />
    );

  const edit = (
    <LinkButton
      variant="secondary"
      href={card.editHref}
      prefetch={false}
      aria-describedby={describedBy}
    >
      {t.actions.edit}
    </LinkButton>
  );

  const moreLabel = fillTemplate(t.more.label, { name: card.name });

  return (
    <Card as="li" tone="outline" aria-labelledby={nameId} className="flex flex-col">
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex gap-3">
          <Link
            href={card.editHref}
            prefetch={false}
            tabIndex={-1}
            aria-hidden="true"
            className="shrink-0 self-start"
          >
            <Photo
              src={card.photo?.storageKey ?? null}
              alt=""
              sizes="96px"
              aspect="portrait"
              className="w-24 rounded-field"
            />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <div className="flex w-full flex-wrap items-center justify-between gap-x-2">
              <Heading level={2} look="body-l" id={nameId} className="min-w-0 max-w-full">
                <Link
                  id={nameLinkId(card.id)}
                  href={card.editHref}
                  prefetch={false}
                  className="inline-flex min-h-target max-w-full items-center rounded-field focus-ring underline-offset-4 hover:underline"
                >
                  <span className="min-w-0 break-words">{card.name}</span>
                </Link>
              </Heading>
              {status}
            </div>
            <p className="text-body text-ink-2">{card.meta}</p>
            {card.status === "published" || card.status === "reserved" ? (
              <FreshnessPips
                kind={card.freshness.kind}
                label={card.freshness.label}
                className="mt-1"
              />
            ) : card.status === "draft" ? (
              <>
                <Text look="hint">{card.notice}</Text>
                {card.publish.kind === "blocked" ? (
                  <Text look="hint" id={gapsId}>
                    {card.publish.sentence}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text look="body">{card.closedLine}</Text>
            )}
          </div>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2">
          {card.status === "published" || card.status === "reserved" ? (
            <>
              {!editable ? null : undoSeconds !== null ? (
                <div className={`${PRIMARY} flex flex-wrap items-center gap-2`}>
                  <Text look="label">
                    <span aria-hidden="true">✓ </span>
                    {t.confirm.done}
                  </Text>
                  <Button
                    variant="ghost"
                    aria-describedby={describedBy}
                    aria-disabled={inert || undefined}
                    onClick={() => {
                      if (!inert) onUndo();
                    }}
                  >
                    {fillTemplate(t.confirm.undo, { seconds: String(undoSeconds) })}
                  </Button>
                </div>
              ) : (
                <Button
                  variant={card.confirm.emphasis === "prompt" ? "primary" : "secondary"}
                  className={PRIMARY}
                  aria-describedby={describedBy}
                  aria-disabled={inert || undefined}
                  onClick={() => {
                    if (!inert) onConfirm();
                  }}
                >
                  {card.confirm.label}
                  <Icon name="check" size="sm" />
                </Button>
              )}
              <div className={REST}>
                {edit}
                <Menu
                  {...menuProps("more")}
                  trigger="icon"
                  label={moreLabel}
                  triggerId={moreTriggerId(card.id)}
                >
                  <MenuItem>
                    <LinkButton
                      variant="ghost"
                      href={card.more.href}
                      target="_blank"
                      rel="noopener"
                      prefetch={false}
                      className="w-full justify-start"
                      onClick={() => onOpenMenu(null)}
                    >
                      {t.more.openOnSite}
                      <Icon name="arrow-up-right" size="sm" />
                      <span className="sr-only"> {uk.kabinet.shell.newTab}</span>
                    </LinkButton>
                  </MenuItem>
                  <MenuItem>
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => {
                        onOpenMenu(null);
                        onCopyLink(card.more.href);
                      }}
                    >
                      {t.more.copyLink}
                    </Button>
                  </MenuItem>
                </Menu>
              </div>
            </>
          ) : card.status === "draft" ? (
            <>
              {editable ? (
                <Button
                  variant="primary"
                  className={PRIMARY}
                  aria-describedby={
                    card.publish.kind === "blocked" ? `${describedBy} ${gapsId}` : describedBy
                  }
                  aria-disabled={inert || card.publish.kind === "blocked" || undefined}
                  onClick={() => {
                    if (!inert && card.publish.kind === "ready") onPublish();
                  }}
                >
                  {uk.kabinet.animalForm.publish.button}
                </Button>
              ) : null}
              <div className={REST}>
                {edit}
                {editable ? (
                  <Menu
                    {...menuProps("more")}
                    trigger="icon"
                    label={moreLabel}
                    triggerId={moreTriggerId(card.id)}
                  >
                    <MenuItem tone="danger">
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        aria-disabled={inert || undefined}
                        onClick={() => pick(onDelete)}
                      >
                        {t.actions.deleteDraft}
                      </Button>
                    </MenuItem>
                  </Menu>
                ) : null}
              </div>
            </>
          ) : (
            <div className={REST}>{edit}</div>
          )}
        </div>
      </div>
    </Card>
  );
}
