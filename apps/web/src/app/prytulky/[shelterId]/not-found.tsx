import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { buttonClass } from "../../../features/controls/controls";

/**
 * A shelter page that has nothing to show: an unknown id, or a shelter that
 * isn't verified (designer round 1, S6). No new copy: «НЕ ЗНАЙДЕНО» is true of
 * any address, and «Усі тварини» leads to the gallery, both the animal 404's
 * own strings. That 404's title and body speak of a card («Цієї картки більше
 * немає»), which is false here, so they are not used; a fuller shelter
 * wording is Oleksii's to write, if he wants one.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function NotFound() {
  return (
    <main className="font-rg flex min-h-dvh items-center justify-center bg-rg-page p-section">
      <div className="flex w-full max-w-xl flex-col items-start gap-group rounded-rg-card bg-rg-surface p-screen">
        <h1 className="text-2xl font-bold tracking-tight text-rg-ink">
          {uk.detail.notFound.eyebrow}
        </h1>
        <a href="/tvaryny" className={buttonClass("primary")}>
          {uk.detail.notFound.action}
        </a>
      </div>
    </main>
  );
}
