import { ukPublic as uk } from "@opika/i18n/public";
import { buttonClass } from "../../ui/Button";
import { MAIN_CONTENT_ID } from "../../ui/landmark";

/**
 * The first Tab stop on every page (root layout): hidden until it takes focus, then fixed above the
 * header. It targets the one `<main>` id (`ui/landmark.ts`); a plain `<a>`, not `next/link`, whose client-side hash navigation scrolls but never moves focus.
 * `focus-within` on the wrapper, because the clipped `sr-only` box must open up when the link inside
 * is focused.
 */
export function SkipLink() {
  return (
    <div className="sr-only focus-within:not-sr-only focus-within:fixed focus-within:top-2 focus-within:left-2 focus-within:z-(--z-toast)">
      <a href={`#${MAIN_CONTENT_ID}`} data-testid="skip-link" className={buttonClass("primary")}>
        {uk.nav.skipToContent}
      </a>
    </div>
  );
}
