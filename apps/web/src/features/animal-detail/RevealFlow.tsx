"use client";

import type { AnimalId } from "@opika/domain";
import { uk } from "@opika/i18n";
import { useRef } from "react";
import { RevealDialog } from "../reveal/RevealDialog";
import { useRevealFlow } from "../reveal/use-reveal-flow";

interface RevealFlowProps {
  animalId: AnimalId;
  animalName: string;
  cityName: string | null;
}

/**
 * docs/design/README.md's addendum, frames R1 (1920, modal)/R2 (360,
 * full-screen) — `Opika Registry Frames.dc.html`, opened directly.
 *
 * The state machine and dialog rendering live in `features/reveal/`
 * (2026-09-10) — extracted so the deck's gesture-parity reveal
 * (`DeckScreen.tsx`) can share them rather than duplicate a second, drifting
 * copy. This component is now the detail-page-specific half only: its own
 * trigger button, and wiring `reveal(animalId)` to that button's click.
 *
 * One overlay tree for both breakpoints, not two components: the mobile
 * card is `w-full h-full` (a true full-screen takeover, matching R2's own
 * frame — no backdrop visible, nothing else on screen), the desktop card
 * is a centred `max-w-[640px]` box over a visible backdrop, matching R1.
 * `desktop:` is this repo's own 1024px breakpoint (`globals.css`), the
 * same cut point the gallery's own rail-vs-sheet split uses.
 *
 * This whole component needs JavaScript to function at all — there is no
 * server-rendered fallback for "look up a shelter's contact details,"
 * unlike the gallery/detail page's own content. That's consistent with
 * the mock's own framing: "розкриття контактів — це пошук у довіднику" —
 * an interactive lookup, not a page navigation.
 *
 * One recorded deviation: R2's own header reads "← До {animal name}"
 * (frame R2's back link is named, not a bare glyph); this implementation
 * uses the same ✕ close button at both breakpoints instead of a second,
 * differently-worded close control unique to mobile. `onClose` already
 * reaches the same place (`isOpen` false, focus back on the trigger)
 * either way — the difference is the label, not the behaviour.
 */
export function RevealFlow({ animalId, animalName, cityName }: RevealFlowProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const { state, isOpen, reveal, close, headingRef, dialogRef } = useRevealFlow(triggerRef);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid="reveal-trigger"
        disabled={state.kind === "loading"}
        onClick={() => reveal(animalId)}
        className="min-h-14 flex-1 rounded-rg-button bg-rg-ink text-[15px] font-medium text-rg-surface focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px] disabled:opacity-60"
      >
        {uk.actions.writeShelter}
      </button>

      {isOpen && (
        <RevealDialog
          state={state}
          animalName={animalName}
          cityName={cityName}
          headingRef={headingRef}
          dialogRef={dialogRef}
          onClose={close}
          onRetry={() => reveal(animalId)}
        />
      )}
    </>
  );
}
