"use client";

import "../../../zod-client-config";
import { fillTemplate, uk } from "@opika/i18n";
import Link from "next/link";
import { useId, useLayoutEffect, useRef } from "react";
import { Button, LinkButton } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { FreshnessPips } from "../../../ui/FreshnessPips";
import { Heading } from "../../../ui/Heading";
import { Icon } from "../../../ui/Icon";
import { Menu, MenuItem } from "../../../ui/Menu";
import { Photo } from "../../../ui/Photo";
import { Text } from "../../../ui/Text";
import { Tooltip } from "../../../ui/Tooltip";
import { ListingStatusChip } from "../StatusChips";
import type {
  ConfirmOffer,
  MenuStatus,
  AnimalManageCard as Model,
  StatusMenuItem,
} from "./manage-card";

const t = uk.kabinet.animalList;

/*
 * A draft's action row: «Опублікувати» left, «Редагувати» and ⋯ right. Both may grow, the pair a
 * thousand times more, so on one line the pair is pushed right; wrapped, «Опублікувати» goes full
 * width with the pair right-aligned below.
 */
const PRIMARY = "grow";
const REST = "flex grow-1000 items-center justify-end gap-2";

/** Ids the list returns focus to when a dialog or an undo it started is done. */
export const statusTriggerId = (animalId: string): string => `animal-status-${animalId}`;
export const moreTriggerId = (animalId: string): string => `animal-more-${animalId}`;
export const nameLinkId = (animalId: string): string => `animal-name-${animalId}`;
/** The confirm, as a link or a button: one id, so focus finds whichever form it has now. */
export const confirmTriggerId = (animalId: string): string => `animal-confirm-${animalId}`;

export type CardMenu = "status" | "more";

/**
 * One kabinet animal card (owner's spec v2, 2026-11-12), the same at every width: photo, name and
 * status, the facts, where it stands, then the actions. The biggest control is the thing to do now
 * (owner, 2026-11-13): while the date is fresh the confirm is a link at the end of the freshness
 * line; once it is aging or stale it is the filled button and «Редагувати» shrinks to a pencil.
 * Photo, name, «Редагувати» and the pencil open the edit page. Tab order: name, status, confirm or
 * publish, «Редагувати» or the pencil, ⋯ (spec rule 6). `editable` false (the support view) leaves
 * out every write: the status is a plain chip.
 */
export function AnimalManageCard({
  card,
  editable,
  busy,
  openMenu,
  onOpenMenu,
  onMove,
  onPublish,
  onConfirm,
  onDelete,
  onCopyLink,
}: {
  card: Model;
  editable: boolean;
  busy: boolean;
  openMenu: CardMenu | null;
  onOpenMenu: (menu: CardMenu | null) => void;
  onMove: (item: StatusMenuItem) => void;
  onPublish: () => void;
  onConfirm: () => void;
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

  /** A visible card's ⋯: its public page, opened or copied. */
  const siteMore = (href: string) => (
    <Menu
      {...menuProps("more")}
      trigger="icon"
      label={moreLabel}
      triggerId={moreTriggerId(card.id)}
    >
      <MenuItem>
        <LinkButton
          variant="ghost"
          href={href}
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
            onCopyLink(href);
          }}
        >
          {t.more.copyLink}
        </Button>
      </MenuItem>
    </Menu>
  );

  // The filled button once the date is aging or stale, a link while fresh, none in the support view.
  const confirmLook =
    !editable || (card.status !== "published" && card.status !== "reserved")
      ? "none"
      : card.confirm.emphasis === "prompt"
        ? "button"
        : "link";

  // This card's confirm or undo (it was busy) moves the control, button ↔ link, dropping focus: it
  // follows in the same commit. A date that merely crosses a threshold moves nothing.
  const shown = useRef({ look: confirmLook, busy });
  useLayoutEffect(() => {
    const before = shown.current;
    shown.current = { look: confirmLook, busy };
    if (!before.busy || before.look === confirmLook || before.look === "none") return;
    if (confirmLook === "none") return;
    const active = document.activeElement;
    if (active === null || active === document.body) {
      document.getElementById(confirmTriggerId(card.id))?.focus();
    }
  }, [confirmLook, busy, card.id]);

  // The link keeps its ✓; the filled button drops it and pads tight, so it shares a 320 px row with
  // two 48 px icons (owner, 2026-11-13). Either label may wrap rather than clip.
  const confirm = (offer: ConfirmOffer, look: "link" | "button") => (
    <Button
      id={confirmTriggerId(card.id)}
      variant={look === "link" ? "link" : "primary"}
      size={look === "link" ? "md" : "compact"}
      className={look === "link" ? "max-w-full compact:-my-3" : "min-w-0 flex-1"}
      aria-describedby={describedBy}
      aria-disabled={inert || undefined}
      onClick={() => {
        if (!inert) onConfirm();
      }}
    >
      {look === "link" ? (
        <>
          {offer.label}
          <Icon name="check" size="sm" />
        </>
      ) : (
        <span className="text-center">{offer.label}</span>
      )}
    </Button>
  );

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
              confirmLook === "link" ? (
                // The link wraps under the pips when the line is full. From 360 it is always one line, so
                // -my-3 keeps its 48px target off the line height; below, it may need two, and its full 48.
                <div className="mt-1 flex flex-wrap items-center gap-x-1">
                  <FreshnessPips
                    kind={card.freshness.kind}
                    label={card.freshness.label}
                    trail="dot"
                  />
                  {confirm(card.confirm, "link")}
                </div>
              ) : (
                <FreshnessPips
                  kind={card.freshness.kind}
                  label={card.freshness.label}
                  className="mt-1"
                />
              )
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
            confirmLook === "button" ? (
              // Aging or stale: one row at every width, the confirm taking what the two icons leave.
              <div className="flex w-full items-center gap-2">
                {confirm(card.confirm, "button")}
                <Tooltip text={t.actions.edit}>
                  <LinkButton
                    variant="icon"
                    href={card.editHref}
                    prefetch={false}
                    aria-label={fillTemplate(t.actions.editNamed, { name: card.name })}
                  >
                    <Icon name="pencil" size="md" />
                  </LinkButton>
                </Tooltip>
                {siteMore(card.more.href)}
              </div>
            ) : (
              // Fresh, or the support view: «Редагувати» fills a phone's row, natural width from tablet.
              <div className="flex w-full items-center justify-end gap-2">
                <LinkButton
                  variant="secondary"
                  href={card.editHref}
                  prefetch={false}
                  aria-describedby={describedBy}
                  className="flex-1 tablet:flex-none"
                >
                  {t.actions.edit}
                </LinkButton>
                {siteMore(card.more.href)}
              </div>
            )
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
