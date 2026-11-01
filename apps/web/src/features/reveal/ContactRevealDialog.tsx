"use client";

import type { ContactRevealView } from "@opika/contracts";
import { allChannels, type ContactChannel } from "@opika/domain";
import { fillTemplate, ukPublic as uk } from "@opika/i18n/public";
import { useEffect, useState } from "react";
import { Button } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { Icon, type IconName } from "../../ui/Icon";
import { Mascot } from "../../ui/Mascot";
import { Modal } from "../../ui/Modal";
import { Photo } from "../../ui/Photo";
import { THROTTLED_COPY } from "./throttled-copy";
import type { RevealErrorReason, RevealState } from "./useReveal";

/**
 * One action row per channel the shelter gave: its label, the link that does the thing, and an icon.
 * `external` links open in a new tab (Telegram, website); `tel:`, `mailto:` and `viber:` hand off to
 * the phone's own app. The row's visible value is `contactChannelText`; `copyLabel` names the copy
 * button for a screen reader (it starts with the visible «Копіювати», WCAG 2.5.3) and is null where
 * a copy makes no sense (a website is opened, not pasted).
 */
function channelAction(channel: ContactChannel): {
  label: string;
  href: string;
  external: boolean;
  icon: IconName;
  copyLabel: string | null;
  copyValue: string;
} {
  switch (channel.kind) {
    case "phone":
      return {
        label: uk.reveal.call,
        href: `tel:${channel.e164}`,
        external: false,
        icon: "phone",
        copyLabel: uk.reveal.copyPhoneLabel,
        copyValue: channel.e164,
      };
    case "telegram":
      return {
        label: uk.reveal.writeTelegram,
        href: `https://t.me/${channel.handle}`,
        external: true,
        icon: "send",
        copyLabel: uk.reveal.copyTelegramLabel,
        copyValue: `@${channel.handle}`,
      };
    case "viber":
      return {
        label: uk.reveal.writeViber,
        href: `viber://chat?number=${encodeURIComponent(channel.e164)}`,
        external: false,
        icon: "chat",
        copyLabel: uk.reveal.copyViberLabel,
        copyValue: channel.e164,
      };
    case "email":
      return {
        label: uk.reveal.writeEmail,
        href: `mailto:${channel.address}`,
        external: false,
        icon: "mail",
        copyLabel: uk.reveal.copyEmailLabel,
        copyValue: channel.address,
      };
    case "website":
      return {
        label: uk.reveal.openWebsite,
        href: channel.url,
        external: true,
        icon: "globe",
        copyLabel: null,
        copyValue: channel.url,
      };
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
 * A Viber number and a phone number are both bare `+380…` strings; what tells the rows apart
 * is their label («Подзвонити» / «Написати у Viber») and icon, not the value.
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
      return channel.e164;
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
   * The text button at the bottom, absent for a surface where dismissing should never navigate
   * anywhere: the deck must survive a reveal ("no exit back to the gallery", R3, Phase R). The
   * animal page passes one; it only closes the dialog, like the ✕.
   */
  secondaryAction?: { label: string; onClick: () => void } | undefined;
}

/**
 * The reveal, on the kit Modal: a native `<dialog>` opened with `showModal()`. That puts it in the
 * top layer (above the animal overlay's own ✕ and prev/next, which a `fixed z-60` div inside the
 * overlay's clipped frame never covered) and makes everything behind it inert, so Esc, Tab, Back
 * and the backdrop all belong to this dialog alone and focus returns to the opener on close.
 * The caller owns *when* this mounts (only for `"error"`/`"open"`).
 *
 * A bottom sheet on a phone, a centred card from tablet. The «Перед тим як писати» section is a
 * disclosure: open from `desktop`, closed on a phone so the contacts stay above the fold.
 */
export function ContactRevealDialog({
  state,
  onClose,
  onRetry,
  secondaryAction,
}: ContactRevealDialogProps) {
  if (state.kind === "error") {
    return <RevealError reason={state.reason} onClose={onClose} onRetry={onRetry} />;
  }
  return (
    <RevealContent
      animalName={state.animalName}
      cityLabel={state.cityLabel ?? state.cityName}
      cityName={state.cityName}
      reveal={state.reveal}
      onClose={onClose}
      secondaryAction={secondaryAction}
    />
  );
}

/**
 * `reason` picks the copy - `uk.errors.rateLimited` has no `eyebrow`
 * (`"eyebrow" in copy` guards it) and no retry button at all, rendered
 * conditionally rather than pointed at `uk.errors.loadFailed.action`: a
 * reveal-budget refusal cannot succeed on retry before the window resets,
 * so offering one would be a false affordance, not a convenience.
 * `"action" in copy` states the actual rule ("no retry only for a refusal with no
 * action copy") and narrows `copy` for TypeScript; `offline` is the retryable case.
 */
function RevealError({
  reason,
  onClose,
  onRetry,
}: {
  reason: RevealErrorReason;
  onClose: () => void;
  onRetry: () => void;
}) {
  const copy = reason === "tooManyRequests" ? THROTTLED_COPY : uk.errors[reason];
  return (
    <Modal
      open
      onClose={onClose}
      title={copy.title}
      closeLabel={uk.preview.close}
      dialogTestId="reveal-dialog"
      closeTestId="reveal-close"
    >
      {"eyebrow" in copy && <span className="text-caption text-ink-2">{copy.eyebrow}</span>}
      {"body" in copy && <span className="text-body text-ink-2">{copy.body}</span>}
      {"action" in copy && (
        <Button size="lg" onClick={onRetry} data-testid="reveal-retry">
          {copy.action}
        </Button>
      )}
    </Modal>
  );
}

const DESKTOP_QUERY = "(min-width: 1024px)";

function RevealContent({
  animalName,
  cityLabel,
  cityName,
  reveal,
  onClose,
  secondaryAction,
}: {
  animalName: string;
  cityLabel: string | null;
  cityName: string | null;
  reveal: ContactRevealView;
  onClose: () => void;
  secondaryAction?: { label: string; onClick: () => void } | undefined;
}) {
  // The name and the channels come from one object, so the name above a
  // number is that number's: current for a visible shelter, both from the
  // first reveal otherwise (RUI4-F1).
  const { displayName, contact } = reveal.shelterContact;
  const footnote = contactsFootnoteOf(reveal);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  // Mounted only after a click, so `window` is there; the section starts open on a desktop only.
  const [reflectionOpen, setReflectionOpen] = useState(
    () => typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches,
  );

  // The confirmation clears itself; it is never kept for the next open.
  useEffect(() => {
    if (copiedKey === null) return;
    const timer = setTimeout(() => setCopiedKey(null), 2000);
    return () => clearTimeout(timer);
  }, [copiedKey]);

  const copy = async (key: string, value: string) => {
    if (typeof navigator.clipboard?.writeText !== "function") return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
    } catch {
      // No clipboard permission or an insecure context: the value is on screen to copy by hand.
    }
  };

  const photo = reveal.animalSnapshot.primaryPhoto;

  return (
    <Modal
      open
      onClose={onClose}
      title={uk.reveal.title}
      description={uk.reveal.subtitle}
      closeLabel={uk.preview.close}
      dialogTestId="reveal-dialog"
      closeTestId="reveal-close"
      perched={
        <>
          <Mascot kind="cat" pose="sit" variant="collar" size={48} />
          <Mascot kind="dog" pose="sit" size={48} />
        </>
      }
      header={
        <div className="flex items-center gap-4">
          <Photo
            src={photo?.storageKey ?? null}
            alt=""
            sizes="56px"
            aspect="square"
            className="size-14 flex-none rounded-field"
          />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-label font-bold text-ink">{animalName}</span>
            <span className="text-body text-ink-2">
              <span>{displayName}</span>
              {cityLabel ? <span>{` · ${cityLabel}`}</span> : null}
            </span>
          </div>
        </div>
      }
    >
      <ul className="flex flex-col gap-3">
        {allChannels(contact).map((channel, index) => {
          const action = channelAction(channel);
          const key = `${channel.kind}:${contactChannelText(channel)}`;
          const filled = index === 0;
          return (
            <li
              key={key}
              data-testid="reveal-contact-row"
              className={cx(
                "flex min-h-15 items-center gap-2 rounded-field border-2 pr-2 pl-4",
                filled ? "border-ink bg-ink text-on-ink" : "border-line bg-surface text-ink",
              )}
            >
              <a
                href={action.href}
                target={action.external ? "_blank" : undefined}
                rel={action.external ? "noopener" : undefined}
                data-testid={filled ? "reveal-primary-action" : undefined}
                className="flex min-h-15 min-w-0 flex-1 items-center gap-3 rounded-field focus-ring"
              >
                <Icon name={action.icon} />
                <span className="flex min-w-0 flex-col">
                  <span className="text-label">{action.label}</span>
                  <span
                    className={cx("break-all text-body", filled ? "text-on-ink" : "text-ink-2")}
                  >
                    {contactChannelText(channel)}
                  </span>
                </span>
              </a>
              {action.copyLabel === null ? null : (
                <button
                  type="button"
                  aria-label={action.copyLabel}
                  onClick={() => void copy(key, action.copyValue)}
                  className={cx(
                    "hidden min-h-target shrink-0 cursor-pointer items-center rounded-pill border-2 px-4 text-label focus-ring desktop:inline-flex",
                    filled ? "border-on-ink text-on-ink" : "border-ink text-ink",
                  )}
                >
                  {copiedKey === key ? uk.reveal.copied : uk.reveal.copy}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <span role="status" aria-live="polite" className="sr-only">
        {copiedKey === null ? "" : uk.reveal.copied}
      </span>

      <div className="flex flex-col gap-1">
        <span className="text-body text-ink-2">
          {cityName
            ? `${fillTemplate(uk.location.lineAtShelter, { place: cityName })} · ${uk.reveal.meetingPlace}`
            : uk.reveal.meetingPlace}
        </span>
        {footnote !== null && <span className="text-caption text-ink-2">{footnote}</span>}
      </div>

      <details
        open={reflectionOpen}
        onToggle={(event) => setReflectionOpen(event.currentTarget.open)}
        className="group border-t border-line pt-1"
      >
        <summary className="flex min-h-target cursor-pointer list-none items-center justify-between gap-4 rounded-field text-label text-ink focus-ring">
          {uk.reveal.reflectionHeading}
          <Icon name="chevron-down" className="transition-transform group-open:rotate-180" />
        </summary>
        <ul className="flex list-disc flex-col gap-2 pt-2 pb-2 pl-5 text-body text-ink-2">
          <li>{uk.reveal.reflection1}</li>
          <li>{uk.reveal.reflection2}</li>
          <li>{uk.reveal.reflection3}</li>
        </ul>
      </details>

      {secondaryAction && (
        <Button
          variant="ghost"
          onClick={secondaryAction.onClick}
          data-testid="reveal-back-to-gallery"
          className="self-center"
        >
          {secondaryAction.label}
        </Button>
      )}
    </Modal>
  );
}
