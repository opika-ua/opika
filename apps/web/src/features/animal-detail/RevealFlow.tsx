"use client";

import type { AnimalId } from "@opika/domain";
import { uk } from "@opika/i18n";
import { useCallback, useRef } from "react";
import { ContactRevealDialog } from "../reveal/ContactRevealDialog";
import { useReveal } from "../reveal/useReveal";
import { PillButton } from "./PillButton";

interface RevealFlowProps {
  animalId: AnimalId;
  animalName: string;
  cityName: string | null;
}

/**
 * The trigger button plus the detail page's own framing around
 * `ContactRevealDialog` (R3, Phase R, `docs/build-plan.md`, extracted the
 * dialog itself and `useReveal`'s state machine out of this component so
 * the deck could open the identical dialog - see both files' own comments).
 *
 * `secondaryAction` is the one thing this page passes that the deck does
 * not: dismissing the reveal here already meant "back to the gallery"
 * before this dialog existed, so the text link stays. Focus returns to
 * this trigger button on close - `close`'s own job, not the dialog's,
 * since the dialog has no idea what triggered it.
 *
 * This whole component needs JavaScript to function at all - there is no
 * server-rendered fallback for "look up a shelter's contact details,"
 * unlike the gallery/detail page's own content. That's consistent with
 * the mock's own framing: "розкриття контактів — це пошук у довіднику" -
 * an interactive lookup, not a page navigation.
 *
 * One recorded deviation from the mock, carried forward from before this
 * extraction: R2's own header reads "← До {animal name}" (frame R2's back
 * link is named, not a bare glyph); this implementation uses the same ✕
 * close button at both breakpoints instead of a second, differently-worded
 * close control unique to mobile. `close` already reaches the same place
 * (dialog closed, focus back on the trigger) either way - the difference
 * is the label, not the behaviour.
 *
 * Pet card PR 5, owner decision 4: «Дати сімʼю», the panel header's own
 * pill (64px tall, orange `bg-brand-accent`), opens this exact flow with no
 * new logic - only this trigger's own label and styling changed, from
 * `uk.actions.writeShelter` ("Написати притулку") to `uk.detail.giveHome`.
 * The dialog it opens, `secondaryAction` included, is untouched.
 */
export function RevealFlow({ animalId, animalName, cityName }: RevealFlowProps) {
  const { state, open, close: closeReveal } = useReveal();
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const openThisAnimal = useCallback(
    () => open({ animalId, animalName, cityName }),
    [open, animalId, animalName, cityName],
  );

  // Memoised - caught on review: an inline arrow here re-created a new
  // function identity on every render, which `ContactRevealDialog`'s own
  // `[onClose]`-dependent keydown effect (Esc, Tab trap, body-scroll-lock)
  // then treated as a reason to tear down and re-register its listener on
  // every render while open, not just once per open/close.
  const close = useCallback(() => {
    closeReveal();
    triggerRef.current?.focus();
  }, [closeReveal]);

  return (
    <>
      <PillButton
        ref={triggerRef}
        tone="accent"
        data-testid="reveal-trigger"
        disabled={state.kind === "loading"}
        onClick={openThisAnimal}
      >
        {uk.detail.giveHome}
      </PillButton>

      {(state.kind === "error" || state.kind === "open") && (
        <ContactRevealDialog
          state={state}
          onClose={close}
          onRetry={openThisAnimal}
          secondaryAction={{ label: uk.reveal.backToFeed, onClick: close }}
        />
      )}
    </>
  );
}
