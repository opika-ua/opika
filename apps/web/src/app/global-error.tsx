"use client";

import { ukPublic as uk } from "@opika/i18n/public";
import { useEffect } from "react";
import { reportClientError } from "../observability/load-client";
import { MAIN_LANDMARK } from "../ui/landmark";
import "./globals.css";

/**
 * Next renders this instead of the root layout when the layout itself throws, so it owns the page
 * shell. It reuses the gallery's approved error strings rather than adding copy, and plain markup
 * on the kit's tokens rather than the kit's components: this file is in every page's client graph,
 * and the screen those components build costs every page about 3.6 kB gzipped for a case that
 * almost never happens. The error goes to the reporter (a no-op without a DSN).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);

  return (
    <html lang="uk">
      <body style={{ margin: 0 }}>
        <meta name="robots" content="noindex, nofollow" />
        <main {...MAIN_LANDMARK} className="flex min-h-dvh items-center justify-center bg-page p-4">
          <div
            role="alert"
            data-testid="global-error"
            className="flex w-full max-w-140 flex-col items-start gap-4 rounded-panel bg-surface p-8"
          >
            <p className="text-ink-2 text-label uppercase tracking-wider">
              {uk.galleryError.eyebrow}
            </p>
            <h1 className="font-display text-display-l text-ink wrap-anywhere">
              {uk.galleryError.title}
            </h1>
            <p className="text-body-l text-ink-2">{uk.galleryError.body}</p>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                data-testid="global-error-retry"
                onClick={reset}
                className="focus-ring inline-flex min-h-target cursor-pointer items-center justify-center rounded-pill bg-ink px-6 font-bold text-label text-on-ink"
              >
                {uk.galleryError.action}
              </button>
              <a
                href="/tvaryny"
                data-testid="global-error-show-all"
                className="focus-ring inline-flex min-h-target items-center px-3 font-bold text-ink text-label underline"
              >
                {uk.galleryError.showAll}
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
