"use client";

import { fillTemplate, uk } from "@opika/i18n";
import Link from "next/link";
import { Footer } from "../chrome/Footer";
import { SiteHeader } from "../chrome/SiteHeader";
import { buttonClass } from "../controls/controls";
import { AnimalCard } from "../gallery/AnimalCard";
import { useSavedCards } from "./useSavedCards";

interface SavedPageScreenProps {
  /** `cities.list`, resolved server-side — this screen never fetches it itself. */
  cityNames: Readonly<Record<string, string>>;
}

/**
 * S8, the saved page (`/zberezheni`). Client-rendered end to end: the list
 * of ids lives in `localStorage`, which does not exist on the server, so
 * there is nothing for a server render to do here beyond the shell in
 * `app/zberezheni/page.tsx` (metadata, and resolving `cityNames` once).
 *
 * No mock exists for this screen (`docs/designer-round-1.md` §4: "No mock
 * frame"), so its layout is the builder's call, listed under "Decisions
 * taken" in the PR — a plain list of gallery cards, his copy for every
 * state, nothing invented beyond arrangement.
 */
export function SavedPageScreen({ cityNames }: SavedPageScreenProps) {
  const { items, storageBlocked, removeSaved } = useSavedCards();

  return (
    <div className="font-rg min-h-dvh bg-rg-page">
      <SiteHeader />

      <div className="p-4 tablet:p-6 desktop:px-8 desktop:max-w-[1200px] desktop:mx-auto flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-bold text-[28px]/[34px] desktop:text-[34px]/[38px] tracking-[-0.03em] text-rg-ink">
            {uk.likes.title}
          </h1>
          <p className="text-[13px]/[18px] text-rg-ink-3">{uk.likes.deviceOnly}</p>
          {storageBlocked && (
            <p className="text-[13px]/[18px] text-rg-ink-3" data-testid="saved-storage-blocked">
              {uk.likes.storageBlocked}
            </p>
          )}
        </div>

        {items !== null && items.length === 0 && (
          <div
            data-testid="saved-empty"
            className="bg-rg-surface rounded-rg-card py-12 px-8 flex flex-col items-start gap-4"
          >
            <p className="text-[17px]/[26px] text-rg-ink-2 text-pretty">{uk.likes.empty}</p>
            <Link href="/tvaryny" className={buttonClass("primary")}>
              {uk.likes.emptyLink}
            </Link>
          </div>
        )}

        {items !== null && items.length > 0 && (
          <ul className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3 gap-4">
            {items.map((item) => (
              <li key={item.animalId} className="flex flex-col gap-2">
                {item.kind === "available" ? (
                  <AnimalCard
                    card={item.card}
                    cityName={cityNames[item.card.publicLocation?.cityId ?? ""] ?? null}
                  />
                ) : (
                  <div
                    data-testid="saved-unavailable"
                    className="bg-rg-fill rounded-rg-card p-4 text-[15px]/[22px] text-rg-ink-2"
                  >
                    {item.name
                      ? fillTemplate(uk.likes.unavailable, { name: item.name })
                      : uk.likes.unavailableUnnamed}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeSaved(item.animalId)}
                  data-testid="saved-remove"
                  className={`${buttonClass("secondary")} min-h-10 self-start`}
                >
                  {uk.likes.remove}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="p-4 tablet:p-6 desktop:px-8 desktop:max-w-[1200px] desktop:mx-auto">
        <Footer />
      </div>
    </div>
  );
}
