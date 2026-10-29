"use client";

import type { ContactRevealView } from "@opika/contracts";
import { allChannels, type ContactChannel } from "@opika/domain";
import { ukPublic as uk } from "@opika/i18n/public";
import { useLayoutEffect, useRef } from "react";
import { lockBodyScroll } from "../controls/body-scroll-lock";
import { THROTTLED_COPY } from "./throttled-copy";
import type { RevealErrorReason, RevealState } from "./useReveal";

/**
 * The dialog's own primary action, keyed on whichever channel the shelter
 * actually gave as `primary` - the shelter's own stated preference, not
 * this component's guess. The mock's R1/R2 frames only ever show the
 * Telegram case, but real seed data has phone-primary shelters. Found by
 * looking at a real rendered reveal, not assumed: a phone-only shelter
 * left the dialog with no primary action at all before this existed.
 *
 * `viber`/`website` return `null` rather than a guessed deep-link scheme
 * this codebase has never used anywhere else, and no fallback to a
 * *different* channel's action is attempted - the contact rows below list
 * every channel either way, so such a shelter's details are readable and
 * copyable; only the one-tap button is absent. Which channel should win
 * the button when the primary cannot supply one is a product decision, not
 * this function's to invent.
 */
function primaryContactAction(
  channel: ContactChannel,
): { label: string; href: string; external: boolean } | null {
  switch (channel.kind) {
    case "telegram":
      return {
        label: uk.reveal.writeTelegram,
        href: `https://t.me/${channel.handle}`,
        external: true,
      };
    case "phone":
      return { label: uk.reveal.call, href: `tel:${channel.e164}`, external: false };
    case "email":
      return { label: uk.reveal.writeEmail, href: `mailto:${channel.address}`, external: false };
    case "viber":
    case "website":
      return null;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = channel;
      return unreachable;
    }
  }
}

/**
 * Every channel the shelter gave, not just `contact.primary` - the mock's
 * own R1/R2 frames show two rows for one shelter ("+380 67 123 45 67" and
 * "@domivka_brovary"), and today's seed data puts the phone in `primary`
 * and Telegram in `additional` for every shelter that has both. Keying the
 * rows off `primary` alone dropped the Telegram handle from every real
 * reveal, and rendered nothing at all for a `viber`/`website`-primary
 * shelter - an empty dialog that had still spent one of the adopter's 30
 * daily reveals.
 *
 * `allChannels` (packages/domain) is the domain's own primary-then-additional
 * ordering; the mock's row order is the same.
 *
 * "Viber" is written out because a Viber number and a phone number are both
 * bare `+380…` strings - two identical-looking rows with nothing to tell
 * them apart reads as a duplication bug. It is a proper noun, spelled the
 * same in both catalogues, so it is not a missing translation.
 */
function contactChannelText(channel: ContactChannel): string {
  switch (channel.kind) {
    case "phone":
      return channel.e164;
    case "email":
      return channel.address;
    case "telegram":
      return `@${channel.handle}`;
    case "viber":
      return `Viber · ${channel.e164}`;
    case "website":
      return channel.url;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = channel;
      return unreachable;
    }
  }
}

/**
 * «Контакти збережено такими, якими вони є сьогодні · {date}», only where it
 * is true: under the first-reveal record's contacts, dated by that first
 * reveal (`revealedAt` is the stored reveal's, unchanged by a repeat).
 *
 * Never under the shelter's current contacts (`source: "current"`, K4-B4),
 * which is every `animals.reveal` answer: there the date would be the first
 * reveal's while the channels are today's, so a number changed since would
 * be captioned as saved on a day it didn't exist (Tier 1 review, finding 1).
 * Deleted rather than reworded there (standing constraints, "Removing a
 * false claim is not the same gate as adding one"); whether a line for the
 * current-contacts case is wanted is his question (inbox K4-Q11).
 */
function contactsFootnoteOf(reveal: ContactRevealView): string | null {
  switch (reveal.shelterContact.source) {
    case "current":
      return null;
    case "first_reveal": {
      const date = new Intl.DateTimeFormat("uk-UA", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(reveal.revealedAt);
      return uk.reveal.contactsFootnote.replace("{date}", () => date);
    }
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled source; unreachable at runtime */
    default: {
      const unreachable: never = reveal.shelterContact;
      return unreachable;
    }
  }
}

type DialogState = Extract<RevealState, { kind: "error" }> | Extract<RevealState, { kind: "open" }>;

interface ContactRevealDialogProps {
  /** Carries its own `animalName`/`cityName` snapshot - see `useReveal.ts`'s
   * own comment on why those live inside the state object rather than as
   * separate props kept in sync by hand. */
  state: DialogState;
  onClose: () => void;
  onRetry: () => void;
  /**
   * Absent for a surface where dismissing the dialog should never navigate
   * anywhere - the deck (R3, Phase R, `docs/build-plan.md`): "the deck
   * session must survive a reveal - no exit back to the gallery." The
   * detail page (`RevealFlow.tsx`) still passes one, since there dismissing
   * the reveal and "going back to the gallery" already meant the same
   * thing before this dialog existed.
   */
  secondaryAction?: { label: string; onClick: () => void } | undefined;
}

/**
 * The dialog half of what used to be `RevealFlow.tsx` in full - extracted
 * (R3, Phase R, `docs/build-plan.md`) so the deck can open the identical
 * overlay, focus trap and contact-card rendering the detail page already
 * had, rather than a second implementation of either. The caller owns
 * *when* this mounts (conditionally, only for `"error"`/`"open"` - never
 * `"idle"`/`"loading"`, which render nothing here at all) and the trigger
 * that opens it; this component owns everything from the overlay in.
 *
 * docs/design/README.md's addendum, frames R1 (1920, modal)/R2 (360,
 * full-screen) - `Opika Registry Frames.dc.html`, opened directly. One
 * overlay tree for both breakpoints: the mobile card is `w-full h-full` (a
 * true full-screen takeover, matching R2's own frame), the desktop card is
 * a centred `max-w-160` box over a visible backdrop, matching R1.
 */
export function ContactRevealDialog({
  state,
  onClose,
  onRetry,
  secondaryAction,
}: ContactRevealDialogProps) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Focus the dialog's own heading on mount - the entrance the mock's own
  // caption describes ("Фокус переходить на заголовок"). This component is
  // only ever mounted while open (the caller renders it conditionally), so
  // a mount-only effect already is "once per open" - no `isOpen` dependency
  // needed the way the pre-extraction single component required.
  //
  // A layout effect for the same reason as the scroll lock below (RF-F2):
  // the dialog mounts after an awaited reveal, so a passive effect would
  // run after the commit. An Escape in that gap closed the dialog and
  // returned focus to the trigger, and then the late effect focused this
  // heading, which unmounted with the dialog and left focus on `<body>`.
  useLayoutEffect(() => {
    headingRef.current?.focus();
  }, []);

  // Esc closes; page behind the dialog does not scroll while it's open;
  // Tab is trapped inside the dialog's own focusable elements.
  //
  // A layout effect, not a passive one (RF-F1): this dialog mounts only
  // after an awaited `animals.reveal` resolves, not inline inside the
  // click that triggered it, so a passive effect here would be scheduled
  // for after the browser's next paint instead of flushed before it. A
  // layout effect locks the scroll in the same commit that inserts the
  // dialog, before anything paints, so there is never a frame where the
  // dialog is visible and the page behind it is still scrollable.
  useLayoutEffect(() => {
    // Counted, not saved and restored (`body-scroll-lock.ts`): this dialog
    // can sit over the gallery's animal overlay, which holds its own lock.
    const releaseScroll = lockBodyScroll();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // Marked handled, so a page-level Escape behind the dialog (the
        // deck's own "exit to the gallery", `DeckScreen.tsx`) knows this
        // press belonged to the dialog and does nothing (RF-F2).
        event.preventDefault();
        onClose();
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
      // Indexed against the focusable list rather than compared to first/last
      // directly, because the element focus actually starts on is neither:
      // the dialog's heading carries tabindex="-1" and so is not in this
      // list at all. Comparing only to `first` left Shift+Tab from the
      // heading falling through to the trigger button behind the overlay -
      // the trap held forwards and leaked backwards. `-1` also covers the
      // error state, where focus can still be outside the dialog.
      const active = document.activeElement;
      const index =
        active instanceof HTMLElement ? Array.prototype.indexOf.call(focusable, active) : -1;
      if (event.shiftKey ? index <= 0 : index === -1 || index === focusable.length - 1) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }

    // Capture phase: the deck's page-level Escape listener is also on
    // `window` and was registered first, so in the bubble phase it ran
    // before this one and left the deck on every Escape that only meant to
    // close the dialog (RF-F2). Capturing runs this first, whatever the
    // registration order. The gallery's animal overlay (`useModalFocus`)
    // listens in the bubble phase too and skips a key marked handled, so
    // with the reveal open over it the first Escape closes the reveal only.
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      releaseScroll();
    };
  }, [onClose]);

  return (
    <div
      data-testid="reveal-overlay"
      className="fixed inset-0 z-(--z-modal) flex items-start desktop:items-center justify-center desktop:bg-line/90 desktop:p-8"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reveal-heading"
        data-testid="reveal-dialog"
        className="w-full h-full desktop:h-auto desktop:max-w-160 desktop:max-h-full overflow-y-auto bg-surface desktop:rounded-card p-6 desktop:shadow-float flex flex-col gap-6"
      >
        {state.kind === "error" && (
          <RevealError
            reason={state.reason}
            headingRef={headingRef}
            onClose={onClose}
            onRetry={onRetry}
          />
        )}
        {state.kind === "open" && (
          <RevealContent
            animalName={state.animalName}
            cityName={state.cityName}
            reveal={state.reveal}
            headingRef={headingRef}
            onClose={onClose}
            secondaryAction={secondaryAction}
          />
        )}
      </div>
    </div>
  );
}

/**
 * The error card carries `#reveal-heading` too, and takes focus the same way
 * the success card does. Both are load-bearing rather than symmetry for its
 * own sake: the dialog's `aria-labelledby` points at that id unconditionally,
 * so without it the error dialog announced with no accessible name at all,
 * and focus stayed on the trigger button *behind* the overlay.
 *
 * `reason` picks the copy - `uk.errors.rateLimited` has no `eyebrow`
 * (`"eyebrow" in copy` guards it) and no retry button at all, rendered
 * conditionally rather than pointed at `uk.errors.loadFailed.action`: a
 * reveal-budget refusal cannot succeed on retry before the window resets,
 * so offering one would be a false affordance, not a convenience.
 */
function RevealError({
  reason,
  headingRef,
  onClose,
  onRetry,
}: {
  reason: RevealErrorReason;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
  onRetry: () => void;
}) {
  const copy = reason === "tooManyRequests" ? THROTTLED_COPY : uk.errors[reason];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          {"eyebrow" in copy && <span className="text-caption text-ink-2">{copy.eyebrow}</span>}
          <h2
            ref={headingRef}
            id="reveal-heading"
            tabIndex={-1}
            className="text-title text-ink outline-none"
          >
            {copy.title}
          </h2>
          {"body" in copy && <span className="text-body text-ink-2">{copy.body}</span>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={uk.preview.close}
          data-testid="reveal-close"
          className="size-12 flex-none rounded-field bg-line text-body text-ink-2 focus-ring"
        >
          ✕
        </button>
      </div>
      {/*
        `"action" in copy`, not `reason !== "rateLimited"` - states the
        actual rule ("no retry only for a refusal with no action copy")
        rather than "only this one specific reason gets a retry", which
        would silently withhold retry from any future reason added to
        `RevealErrorReason` that a caller *does* want retryable, and lets
        TypeScript narrow `copy` itself so `copy.action` below is sound.
        `offline` is exactly the retryable case this used to only
        anticipate in a comment - `copy.action` (not a hardcoded
        `uk.errors.loadFailed.action`) is what makes the button read
        "Спробувати ще раз" there instead of "Оновити", mirroring the
        deck's own `DeckErrorReason` handling.
      */}
      {"action" in copy && (
        <button
          type="button"
          onClick={onRetry}
          data-testid="reveal-retry"
          className="min-h-14 rounded-field bg-ink text-label text-on-ink focus-ring"
        >
          {copy.action}
        </button>
      )}
    </div>
  );
}

function RevealContent({
  animalName,
  cityName,
  reveal,
  headingRef,
  onClose,
  secondaryAction,
}: {
  animalName: string;
  cityName: string | null;
  reveal: ContactRevealView;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
  secondaryAction?: { label: string; onClick: () => void } | undefined;
}) {
  // The name and the channels come from one object, so the name above a
  // number is that number's: current for a visible shelter, both from the
  // first reveal otherwise (RUI4-F1).
  const { displayName, contact } = reveal.shelterContact;
  const footnote = contactsFootnoteOf(reveal);
  const primaryAction = primaryContactAction(contact.primary);

  return (
    <>
      <div className="flex items-start gap-4">
        <div className="flex-1 flex flex-col gap-2">
          <span className="text-body text-ink-2">
            {uk.reveal.youAskedAbout.replace("{name}", () => animalName)}
          </span>
          <h2
            ref={headingRef}
            id="reveal-heading"
            tabIndex={-1}
            className="text-display-l text-ink outline-none"
          >
            {uk.reveal.title}
          </h2>
          <span className="text-body text-ink-2">{uk.reveal.subtitle}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={uk.preview.close}
          data-testid="reveal-close"
          className="size-12 flex-none rounded-field bg-line text-body text-ink-2 focus-ring"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col desktop:flex-row gap-4">
        <div className="flex-1 min-w-0 bg-line rounded-field p-4 flex flex-col gap-2">
          <span className="text-body text-ink">{displayName}</span>
          {allChannels(contact).map((channel) => (
            <span
              key={`${channel.kind}:${contactChannelText(channel)}`}
              data-testid="reveal-contact-row"
              className="flex items-center min-h-14 px-4 rounded-field bg-surface text-body text-ink break-all"
            >
              {contactChannelText(channel)}
            </span>
          ))}
          <span className="flex items-center min-h-14 px-4 text-body text-ink-2">
            {cityName
              ? `${uk.location.lineAtShelter.replace("{city}", () => cityName)} · ${uk.reveal.meetingPlace}`
              : uk.reveal.meetingPlace}
          </span>
          {footnote !== null && <span className="text-caption text-ink-2">{footnote}</span>}
        </div>

        <div className="flex-1 min-w-0 bg-line rounded-field p-4 flex flex-col gap-3">
          <span className="text-body text-ink">{uk.reveal.reflectionHeading}</span>
          <span className="text-body text-ink-2">{uk.reveal.reflection1}</span>
          <span className="text-body text-ink-2">{uk.reveal.reflection2}</span>
          <span className="text-body text-ink-2">{uk.reveal.reflection3}</span>
        </div>
      </div>

      <div className="flex flex-col desktop:flex-row gap-2 desktop:items-center">
        {primaryAction && (
          <a
            href={primaryAction.href}
            target={primaryAction.external ? "_blank" : undefined}
            rel={primaryAction.external ? "noopener" : undefined}
            data-testid="reveal-primary-action"
            className="min-h-14 flex-1 flex items-center justify-center rounded-field bg-ink text-label text-on-ink focus-ring"
          >
            {primaryAction.label}
          </a>
        )}
        {secondaryAction && (
          <button
            type="button"
            onClick={secondaryAction.onClick}
            data-testid="reveal-back-to-gallery"
            className="min-h-14 text-label text-ink-2 underline focus-ring rounded-field"
          >
            {secondaryAction.label}
          </button>
        )}
      </div>
    </>
  );
}
