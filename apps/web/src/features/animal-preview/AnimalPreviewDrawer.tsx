"use client";

import type { AnimalDetailView } from "@opika/contracts";
import type { AnimalId } from "@opika/domain";
import { textIn } from "@opika/domain";
import { uk } from "@opika/i18n";
import { useRouter } from "next/navigation";
import { useId, useLayoutEffect, useRef } from "react";
import { CoatFact } from "../animal-detail/CoatFact";
import { DetailPhotoGallery } from "../animal-detail/DetailPhotoGallery";
import { animalLocationLine, animalSubtitle } from "../animal-detail/detail-text";
import { ShelterFreshnessBlock } from "../animal-detail/ShelterFreshnessBlock";
import { Button, buttonClass } from "../controls/controls";
import { useModalFocus } from "../controls/useModalFocus";

/**
 * What the drawer was given to show. `not_found` is an animal that left the
 * site between the gallery's render and the click (adopted, withdrawn, its
 * shelter paused): `animals.byId` collapses every such case to one
 * `NOT_FOUND`, and the drawer says so with the animal page's own copy rather
 * than opening empty.
 */
export type AnimalPreviewContent =
  | { kind: "animal"; animal: AnimalDetailView; cityName: string | null }
  | { kind: "not_found" };

/** The full page's URL, which is also the drawer's: one address per animal. */
export function animalPageHref(animalId: AnimalId): string {
  return `/tvaryny/${animalId}`;
}

const BACKDROP =
  "fixed inset-0 z-50 flex items-end justify-center bg-rg-fill-strong/90 tablet:items-stretch tablet:justify-end";
const FRAME =
  "font-rg flex max-h-dvh w-full flex-col gap-5 overflow-y-auto rounded-t-rg-card bg-rg-surface p-5 shadow-rg-card tablet:h-dvh tablet:max-w-xl tablet:rounded-none tablet:p-8";
const TITLE = "text-2xl font-bold tracking-tight text-rg-ink";
const BODY = "text-base text-rg-ink";
const MUTED = "text-base text-rg-ink-2";

/**
 * Designer round 1, §2 (`docs/designer-round-1.md`): the gallery opens an
 * animal in this drawer, over the list, instead of leaving it. No mock
 * frame; the structure is the plan's.
 *
 * Rendered by the intercepting route `app/tvaryny/@preview/(.)[animalId]`,
 * so the address bar holds the animal's own URL (shareable, as the reveal
 * modal's is, README "Contact reveal (05)"), and closing is going back in
 * history: ✕, Escape and the phone's back gesture all do the same thing. A
 * reload, a shared link or a click with no JavaScript gets the full page.
 *
 * What it leaves out, on purpose: the shelter's name (DR1-D1, the same rule
 * as the gallery card), the contact reveal (DR1-D7: one reveal surface, with
 * its rate limit and its reassurance, on the animal page), the shelter's
 * freshness sentence (DR1-Q1: it is shown on the shelter page only), and the
 * donation link. Freshness is the pips and the day count in words, both.
 *
 * The modal behaviour is `useModalFocus`, shared with `ModalDialog`. Focus
 * goes back to the card that opened the drawer when it closes.
 */
export function AnimalPreviewDrawer({
  animalId,
  content,
}: {
  animalId: AnimalId;
  content: AnimalPreviewContent;
}) {
  const router = useRouter();
  const id = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const href = animalPageHref(animalId);

  useModalFocus({ dialogRef, initialFocusRef: titleRef, onClose: () => router.back() });
  useReturnFocusToOpener(href);

  return (
    <div className={BACKDROP}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className={FRAME}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={`${id}-title`} ref={titleRef} tabIndex={-1} className={TITLE}>
            {content.kind === "animal" ? content.animal.name : uk.detail.notFound.title}
          </h2>
          <Button variant="icon" aria-label={uk.preview.close} onClick={() => router.back()}>
            <span aria-hidden="true">✕</span>
          </Button>
        </div>
        {content.kind === "animal" ? (
          <AnimalPreviewBody animal={content.animal} cityName={content.cityName} href={href} />
        ) : (
          <p className={BODY}>{uk.detail.notFound.body}</p>
        )}
      </div>
    </div>
  );
}

function AnimalPreviewBody({
  animal,
  cityName,
  href,
}: {
  animal: AnimalDetailView;
  cityName: string | null;
  href: string;
}) {
  const description = textIn(animal.description, "uk");
  return (
    <>
      <div className="flex flex-col gap-1">
        <p className={MUTED}>{animalSubtitle(animal)}</p>
        <CoatFact coatLength={animal.coatLength} className={MUTED} />
        <p className={MUTED}>{animalLocationLine(animal, cityName)}</p>
      </div>
      <DetailPhotoGallery photos={animal.photos} altFallback={animal.name} />
      <ShelterFreshnessBlock freshness={animal.freshness} sentence={null} />
      {description && <p className={BODY}>{description}</p>}
      {/*
        A plain anchor, not `next/link`: a client navigation to this URL from
        here would be intercepted again and reopen the drawer. A document
        load is what reaches the full page.
      */}
      <a href={href} className={buttonClass("primary")}>
        {uk.preview.openFull}
      </a>
    </>
  );
}

/**
 * When the drawer closes, focus goes back to the card that opened it, so a
 * keyboard user carries on through the grid where they were. The opener is
 * whatever held focus as the drawer mounted (the clicked or Enter-ed card);
 * where a browser doesn't focus a link on click (Safari), the gallery's link
 * to this same URL is that card. A layout effect, so the opener is read in
 * the commit that inserts the drawer, before its title takes focus.
 */
function useReturnFocusToOpener(href: string) {
  useLayoutEffect(() => {
    const active = document.activeElement;
    const opener = active instanceof HTMLElement && active !== document.body ? active : null;
    return () => {
      const target =
        opener?.isConnected === true
          ? opener
          : document.querySelector<HTMLElement>(`a[href="${href}"]`);
      target?.focus();
    };
  }, [href]);
}
