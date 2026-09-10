"use client";

import type { ContactRevealView } from "@opika/contracts";
import { allChannels, type ContactChannel } from "@opika/domain";
import { uk } from "@opika/i18n";
import type { RevealState } from "./use-reveal-flow";

/**
 * The dialog's own primary action, keyed on whichever channel the shelter
 * actually gave as `primary` — the shelter's own stated preference, not
 * this component's guess. The mock's R1/R2 frames only ever show the
 * Telegram case, but real seed data has phone-primary shelters. Found by
 * looking at a real rendered reveal, not assumed: a phone-only shelter
 * left the dialog with no primary action at all before this existed.
 *
 * `viber`/`website` return `null` rather than a guessed deep-link scheme
 * this codebase has never used anywhere else, and no fallback to a
 * *different* channel's action is attempted — the contact rows below list
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
 * Every channel the shelter gave, not just `contact.primary` — the mock's
 * own R1/R2 frames show two rows for one shelter ("+380 67 123 45 67" and
 * "@domivka_brovary"), and today's seed data puts the phone in `primary`
 * and Telegram in `additional` for every shelter that has both. Keying the
 * rows off `primary` alone dropped the Telegram handle from every real
 * reveal, and rendered nothing at all for a `viber`/`website`-primary
 * shelter — an empty dialog that had still spent one of the adopter's 30
 * daily reveals.
 *
 * `allChannels` (packages/domain) is the domain's own primary-then-additional
 * ordering; the mock's row order is the same.
 *
 * "Viber" is written out because a Viber number and a phone number are both
 * bare `+380…` strings — two identical-looking rows with nothing to tell
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

export interface RevealDialogProps {
  state: RevealState;
  animalName: string;
  cityName: string | null;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  dialogRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onRetry: () => void;
  /**
   * The detail page's own copy names its destination ("Повернутися до
   * галереї") because that is where closing the dialog actually returns
   * to. The deck has no accurate translation of that sentence yet — "back
   * to the gallery" is false when the trigger was the deck, and inventing
   * new Ukrainian copy is a Tier 1 gate this row doesn't cross unasked.
   * Omitting the link (not relabelling it) is the standing-constraints
   * "removing is not the same gate as adding" move: the ✕ close button
   * (unconditional, `uk.actions.notNow` as its label) already closes the
   * dialog either way, so nothing is lost, only a redundant, geographically
   * wrong second control.
   */
  showBackLink?: boolean;
}

/**
 * docs/design/README.md's addendum, frames R1 (1920, modal)/R2 (360,
 * full-screen) — `Opika Registry Frames.dc.html`, opened directly.
 *
 * Presentational only — no data fetching, no session state. Extracted from
 * `RevealFlow.tsx` (2026-09-10) so the deck's gesture-parity reveal
 * (right-drag doing what «Написати» does) can render the same dialog the
 * detail page does, rather than a second, drifting copy of it. The detail
 * page's own rendered output is unchanged by this extraction —
 * `RevealFlow.test.tsx` covers that.
 */
export function RevealDialog({
  state,
  animalName,
  cityName,
  headingRef,
  dialogRef,
  onClose,
  onRetry,
  showBackLink = true,
}: RevealDialogProps) {
  return (
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
          <RevealError headingRef={headingRef} onClose={onClose} onRetry={onRetry} />
        )}
        {state.kind === "open" && (
          <RevealContent
            animalName={animalName}
            cityName={cityName}
            reveal={state.reveal}
            headingRef={headingRef}
            onClose={onClose}
            showBackLink={showBackLink}
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
 */
function RevealError({
  headingRef,
  onClose,
  onRetry,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
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
          <h2
            ref={headingRef}
            id="reveal-heading"
            tabIndex={-1}
            className="text-[26px]/[30px] font-bold text-rg-ink outline-none"
          >
            {copy.title}
          </h2>
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
  showBackLink,
}: {
  animalName: string;
  cityName: string | null;
  reveal: ContactRevealView;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
  showBackLink: boolean;
}) {
  const shelter = reveal.shelterSnapshot;
  const dateLabel = new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(reveal.revealedAt);
  const primaryAction = primaryContactAction(shelter.contact.primary);

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
          {allChannels(shelter.contact).map((channel) => (
            <span
              key={`${channel.kind}:${contactChannelText(channel)}`}
              data-testid="reveal-contact-row"
              className="flex items-center min-h-14 px-4 rounded-rg-button bg-rg-surface text-[17px] text-rg-ink break-all"
            >
              {contactChannelText(channel)}
            </span>
          ))}
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
        {primaryAction && (
          <a
            href={primaryAction.href}
            target={primaryAction.external ? "_blank" : undefined}
            rel={primaryAction.external ? "noopener" : undefined}
            data-testid="reveal-primary-action"
            className="min-h-14 flex-1 flex items-center justify-center rounded-rg-button bg-rg-ink text-[15px] font-medium text-rg-surface focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
          >
            {primaryAction.label}
          </a>
        )}
        {showBackLink && (
          <button
            type="button"
            onClick={onClose}
            data-testid="reveal-back-to-gallery"
            className="min-h-14 text-[15px] text-rg-ink-2 underline focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px] rounded-rg-button"
          >
            {uk.reveal.backToFeed}
          </button>
        )}
      </div>
    </>
  );
}
