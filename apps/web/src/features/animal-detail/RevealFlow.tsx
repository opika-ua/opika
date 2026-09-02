"use client";

import type { ContactRevealView } from "@opika/contracts";
import type { AnimalId } from "@opika/domain";
import { uk } from "@opika/i18n";
import { safe } from "@orpc/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { revealBrowserClient } from "../../api/browser-client";

type RevealState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "open"; reveal: ContactRevealView };

interface RevealFlowProps {
  animalId: AnimalId;
  animalName: string;
  cityName: string | null;
}

/**
 * docs/design/README.md's addendum, frames R1 (1920, modal)/R2 (360,
 * full-screen) — `Opika Registry Frames.dc.html`, opened directly.
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
 */
export function RevealFlow({ animalId, animalName, cityName }: RevealFlowProps) {
  const [state, setState] = useState<RevealState>({ kind: "idle" });
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const isOpen = state.kind === "open" || state.kind === "error";

  const close = useCallback(() => {
    setState({ kind: "idle" });
    triggerRef.current?.focus();
  }, []);

  const reveal = useCallback(async () => {
    setState({ kind: "loading" });
    const [bootstrapError] = await safe(revealBrowserClient.session.bootstrap({}));
    if (bootstrapError) {
      setState({ kind: "error" });
      return;
    }
    const [revealError, result] = await safe(revealBrowserClient.animals.reveal({ animalId }));
    if (revealError || !result) {
      setState({ kind: "error" });
      return;
    }
    setState({ kind: "open", reveal: result });
  }, [animalId]);

  // Focus the dialog's own heading on open — the entrance the mock's own
  // caption describes ("Фокус переходить на заголовок"). Runs once per
  // open, not per keystroke inside the dialog: `isOpen` alone as the
  // dependency, matching E5's own "frozen at mount" reasoning for exactly
  // this class of effect (DeckScreen's entry announcement).
  useEffect(() => {
    if (isOpen) headingRef.current?.focus();
  }, [isOpen]);

  // Esc closes; page behind the dialog does not scroll while it's open;
  // Tab is trapped inside the dialog's own focusable elements.
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid="reveal-trigger"
        disabled={state.kind === "loading"}
        onClick={reveal}
        className="min-h-14 flex-1 rounded-rg-button bg-rg-ink text-[15px] font-medium text-rg-surface focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px] disabled:opacity-60"
      >
        {uk.actions.writeShelter}
      </button>

      {isOpen && (
        <div
          data-testid="reveal-overlay"
          className="fixed inset-0 z-50 flex items-start desktop:items-center justify-center desktop:bg-[#B9B9B5]/90 desktop:p-8"
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reveal-heading"
            data-testid="reveal-dialog"
            className="font-rg w-full h-full desktop:h-auto desktop:max-w-[640px] desktop:max-h-[85vh] overflow-y-auto bg-rg-surface desktop:rounded-rg-card p-6 desktop:shadow-[0_24px_48px_-32px_rgba(16,17,18,0.4)] flex flex-col gap-6"
          >
            {state.kind === "error" && (
              <RevealError animalId={animalId} onClose={close} onRetry={reveal} />
            )}
            {state.kind === "open" && (
              <RevealContent
                animalName={animalName}
                cityName={cityName}
                reveal={state.reveal}
                headingRef={headingRef}
                onClose={close}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function RevealError({
  onClose,
  onRetry,
}: {
  animalId: AnimalId;
  onClose: () => void;
  onRetry: () => void;
}) {
  const copy = uk.errors.loadFailed;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-medium tracking-[0.12em] text-rg-ink-3">
            {copy.eyebrow}
          </span>
          <span className="text-[26px]/[30px] font-bold text-rg-ink">{copy.title}</span>
          <span className="text-[15px]/[22px] text-rg-ink-2">{copy.body}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={uk.actions.notNow}
          data-testid="reveal-close"
          className="size-12 flex-none rounded-rg-button bg-rg-fill text-[17px] text-rg-ink-2 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
        >
          ✕
        </button>
      </div>
      <button
        type="button"
        onClick={onRetry}
        data-testid="reveal-retry"
        className="min-h-14 rounded-rg-button bg-rg-ink text-[15px] font-medium text-rg-surface focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
      >
        {copy.action}
      </button>
    </div>
  );
}

function RevealContent({
  animalName,
  cityName,
  reveal,
  headingRef,
  onClose,
}: {
  animalName: string;
  cityName: string | null;
  reveal: ContactRevealView;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
}) {
  const shelter = reveal.shelterSnapshot;
  const telegram = shelter.contact.primary.kind === "telegram" ? shelter.contact.primary : null;
  const dateLabel = new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(reveal.revealedAt);

  return (
    <>
      <div className="flex items-start gap-4">
        <div className="flex-1 flex flex-col gap-2">
          <span className="text-[15px]/[22px] text-rg-ink-3">
            {uk.reveal.youAskedAbout.replace("{name}", animalName)}
          </span>
          <h2
            ref={headingRef}
            id="reveal-heading"
            tabIndex={-1}
            className="text-[34px]/[38px] font-bold tracking-[-0.03em] text-rg-ink outline-none"
          >
            {uk.reveal.title}
          </h2>
          <span className="text-[17px]/[26px] text-rg-ink-2">{uk.reveal.subtitle}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={uk.actions.notNow}
          data-testid="reveal-close"
          className="size-12 flex-none rounded-rg-button bg-rg-fill text-[17px] text-rg-ink-2 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col desktop:flex-row gap-4">
        <div className="flex-1 min-w-0 bg-rg-fill rounded-rg-button p-4 flex flex-col gap-2">
          <span className="text-[15px]/[22px] font-medium text-rg-ink">{shelter.displayName}</span>
          {shelter.contact.primary.kind === "phone" && (
            <span className="flex items-center min-h-14 px-4 rounded-rg-button bg-rg-surface text-[17px] text-rg-ink">
              {shelter.contact.primary.e164}
            </span>
          )}
          {telegram && (
            <span className="flex items-center min-h-14 px-4 rounded-rg-button bg-rg-surface text-[17px] text-rg-ink">
              @{telegram.handle}
            </span>
          )}
          <span className="flex items-center min-h-14 px-4 text-[15px]/[22px] text-rg-ink-2">
            {cityName
              ? `${uk.location.lineAtShelter.replace("{city}", cityName)} · ${uk.reveal.meetingPlace}`
              : uk.reveal.meetingPlace}
          </span>
          <span className="text-[13px]/[18px] text-rg-ink-3">
            {uk.reveal.contactsFootnote.replace("{date}", dateLabel)}
          </span>
        </div>

        <div className="flex-1 min-w-0 bg-rg-fill rounded-rg-button p-4 flex flex-col gap-3">
          <span className="text-[17px]/[26px] text-rg-ink">{uk.reveal.reflectionHeading}</span>
          <span className="text-[15px]/[22px] text-rg-ink-2">{uk.reveal.reflection1}</span>
          <span className="text-[15px]/[22px] text-rg-ink-2">{uk.reveal.reflection2}</span>
          <span className="text-[15px]/[22px] text-rg-ink-2">{uk.reveal.reflection3}</span>
        </div>
      </div>

      <div className="flex flex-col desktop:flex-row gap-2 desktop:items-center">
        {telegram && (
          <a
            href={`https://t.me/${telegram.handle}`}
            target="_blank"
            rel="noopener"
            data-testid="reveal-telegram"
            className="min-h-14 flex-1 flex items-center justify-center rounded-rg-button bg-rg-ink text-[15px] font-medium text-rg-surface focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
          >
            {uk.reveal.writeTelegram}
          </a>
        )}
        <button
          type="button"
          onClick={onClose}
          data-testid="reveal-back-to-gallery"
          className="min-h-14 text-[15px] text-rg-ink-2 underline focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px] rounded-rg-button"
        >
          {uk.reveal.backToFeed}
        </button>
      </div>
    </>
  );
}
