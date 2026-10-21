import { uk } from "@opika/i18n";
import { buttonClass } from "../controls/controls";

/**
 * What the gallery's overlay shows when it has no animal to show. The full
 * page answers `not_found` with its 404 (`not-found.tsx`) and a failure with
 * `/tvaryny/error.tsx`; the overlay sits over a gallery that still works, so
 * it says the same things inside the dialog and leaves ✕ to get back.
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

const NOTICE_FRAME = "font-rg flex flex-col gap-group p-group tablet:p-section";
const TITLE = "text-2xl font-bold tracking-tight text-rg-ink";
const BODY = "text-base text-rg-ink-2";

/** The overlay's accessible name in this state. */
export function overlayNoticeTitle(kind: AnimalOverlayNotice): string {
  return NOTICE[kind].title;
}

export function AnimalOverlayNoticeView({ kind }: { kind: AnimalOverlayNotice }) {
  const { title, body } = NOTICE[kind];
  return (
    <div className={NOTICE_FRAME}>
      <h2 className={TITLE}>{title}</h2>
      {body && <p className={BODY}>{body}</p>}
    </div>
  );
}

/**
 * RL-F1: the full page when `animals.byId` refused for rate. Before this,
 * the page turned every failure of that call into its 404, so a rate limit
 * read «Цієї картки більше немає. … Це не помилка — просто картки тут більше
 * немає.», which was false. His sentence only, and the 404's own «Усі
 * тварини» link to the gallery (the same words and destination, so no new
 * string). A plain anchor: a document load is a fresh try, which is what
 * the sentence asks for.
 *
 * Answered with 200 and `noindex` (the page's metadata), not 429: a page
 * render streams after its status is sent, so only `proxy.ts` can answer
 * 429, and it does for the per-IP limit, before the page runs.
 */
export function AnimalRateLimitedScreen() {
  return (
    <main className="font-rg flex min-h-dvh items-center justify-center bg-rg-page p-section">
      <div className="flex w-full max-w-xl flex-col items-start gap-group rounded-rg-card bg-rg-surface p-screen">
        <h1 className={TITLE}>{uk.detail.rateLimited}</h1>
        <a href="/tvaryny" className={buttonClass("primary")}>
          {uk.detail.notFound.action}
        </a>
      </div>
    </main>
  );
}
