import { uk } from "@opika/i18n";
import { Heading } from "../../ui/Heading";
import { Text } from "../../ui/Text";

/**
 * What the gallery's overlay shows when it has no animal to show. The full
 * page answers `not_found` with its 404 (`not-found.tsx`), `rate_limited`
 * with its own screen (`<RateLimitedScreen/>`, his sentence, RL-F1), and any
 * other failure with `/tvaryny/error.tsx`; the overlay sits over a gallery
 * that still works, so it says the same three things inside the dialog and
 * leaves ✕ to get back.
 *
 * - `not_found`: the 404's own copy (an animal adopted, withdrawn or paused
 *   between the gallery's render and the click, DR1-S4-T6).
 * - `rate_limited` (RL-F1): his sentence, and nothing about the card.
 * - `failed`: the gallery's error copy, whose body («Ваші фільтри
 *   збережені») is true here: the gallery behind is untouched.
 */
export type AnimalOverlayNotice = "not_found" | "rate_limited" | "failed";

const NOTICE: Record<AnimalOverlayNotice, { title: string; body: string | null }> = {
  not_found: { title: uk.detail.notFound.title, body: uk.detail.notFound.body },
  rate_limited: { title: uk.detail.rateLimited, body: null },
  failed: { title: uk.galleryError.title, body: uk.galleryError.body },
};

const NOTICE_FRAME = "flex flex-col gap-4 p-4 tablet:p-6";

/** The overlay's accessible name in this state. */
export function overlayNoticeTitle(kind: AnimalOverlayNotice): string {
  return NOTICE[kind].title;
}

export function AnimalOverlayNoticeView({ kind }: { kind: AnimalOverlayNotice }) {
  const { title, body } = NOTICE[kind];
  return (
    <div className={NOTICE_FRAME}>
      <Heading level={2}>{title}</Heading>
      {body && <Text className="text-ink-2">{body}</Text>}
    </div>
  );
}
