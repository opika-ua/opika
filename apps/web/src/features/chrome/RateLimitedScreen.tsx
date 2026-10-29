import { uk } from "@opika/i18n";
import { buttonClass } from "../../ui/Button";
import { Heading } from "../../ui/Heading";
import { MAIN_LANDMARK } from "../../ui/landmark";
import { Panel } from "../../ui/Panel";

/**
 * RL-F1: a public page whose read was refused for rate, the animal page's
 * first and, since designer round 1 (S6), the shelter page's too. Before
 * this, the animal page turned every failure into its 404, so a rate limit
 * read «Цієї картки більше немає. … Це не помилка — просто картки тут більше
 * немає.», which was false. His sentence only (it says nothing about the
 * animal or the shelter, which may well still be there), and the 404's own
 * «Усі тварини» link to the gallery (the same words and destination, so no
 * new string). A plain anchor: a document load is a fresh try, which is what
 * the sentence asks for.
 *
 * Answered with 200 and `noindex` (the page's metadata), not 429: a page
 * render streams after its status is sent, so only `proxy.ts` can answer
 * 429, and it does for the per-IP limit, before the page runs.
 */
export function RateLimitedScreen() {
  return (
    <main
      {...MAIN_LANDMARK}
      className="flex min-h-dvh items-center justify-center bg-page p-4 tablet:p-6"
    >
      {/* Sunken: surface is near-identical to the page, so only the fill makes the card visible. Ink text, since ink-2 is 4.1:1 on it. */}
      <Panel
        tone="sunken"
        padding="lg"
        className="flex w-full max-w-xl flex-col items-start gap-4 text-ink shadow-float"
      >
        <Heading level={1} look="title">
          {uk.detail.rateLimited}
        </Heading>
        <a href="/tvaryny" className={buttonClass("primary")}>
          {uk.detail.notFound.action}
        </a>
      </Panel>
    </main>
  );
}
