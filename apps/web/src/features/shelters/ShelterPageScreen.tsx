import { donationHost } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { useId } from "react";
import { REGISTRY_HAS_NO_REAL_SHELTERS } from "../../seo-flags";
import { Footer } from "../chrome/Footer";
import { SiteHeader } from "../chrome/SiteHeader";
import { buttonClass } from "../controls/controls";
import { AnimalCard } from "../gallery/AnimalCard";
import { ArrowKeyGrid } from "../gallery/ArrowKeyGrid";
import { cardCityId } from "../gallery/card-text";
import { PaginationNav } from "../gallery/GalleryPagination";
import { hasPagination } from "../gallery/gallery-pagination";
import { SortLinks } from "../gallery/SortControl";
import { ShelterWordsSection } from "./ShelterWordsSection";
import type { ShelterPageView } from "./shelter-page-load";
import { shelterPageHref } from "./shelter-url";
import { shelterWordsOf } from "./shelter-words";

/** As the gallery: the first row's photos load eagerly (`tvaryny/page.tsx`'s `PRIORITY_ROW_SIZE`). */
const PRIORITY_ROW_SIZE = 2;

/**
 * The shelter page (designer round 1, §1 and S6; no mock frame, so §1's prose
 * is the specification). Top to bottom: the name as the page's only `h1`, the
 * city (city only, like every pre-reveal view), «Слова притулку», the
 * donation link with its domain shown before the tap (commitment 5), and the
 * shelter's discoverable animals as gallery cards.
 *
 * The list offers the gallery's two date sorts and its numbered pagination,
 * and nothing else (commitment 1: no featured, pinned or shelter-chosen
 * order). It shows inventory only: no view, save or inquiry count anywhere
 * (commitment 2), so a shelter reading its own page learns nothing about
 * adopters. Every control is a plain link: the page works without JS, like
 * the gallery.
 */
export function ShelterPageScreen({
  shelter,
  cityName,
  animals,
  cityNames,
  query,
  // Defaulted here (not in `SiteHeader`) for the same reason
  // `AnimalDetailScreen` defaults it — the real caller always passes it.
  kabinetSignedIn = false,
}: ShelterPageView & { kabinetSignedIn?: boolean }) {
  const animalsHeadingId = useId();
  const words = shelterWordsOf(shelter);
  const hrefFor = (sort: typeof query.sort, page: number) =>
    shelterPageHref(shelter.id, sort, page);

  return (
    <div className="font-rg min-h-dvh bg-rg-page">
      <SiteHeader kabinetSignedIn={kabinetSignedIn} />

      {/* The D-2 demo disclosure, visible in the body as on the gallery and the animal page. */}
      {REGISTRY_HAS_NO_REAL_SHELTERS && (
        <div className="px-group pt-group tablet:px-section">
          <span data-testid="shelter-demo-banner" className="text-sm text-rg-ink-3">
            {uk.demo.bannerNotice}
          </span>
        </div>
      )}

      {/*
        Review of 6825ffd, finding 1: the animal list used to sit in its own
        `<div>`, outside `<main>` — a screen-reader user jumping to the main
        landmark landed in a region with no animals in it. One `<main>` now
        wraps both blocks; the two different width treatments (batch B's
        note below still explains why they differ) stay as inner wrappers.
      */}
      <main className="flex flex-col">
        <div className="mx-auto flex max-w-6xl flex-col gap-section p-group tablet:p-section">
          <div className="flex flex-col gap-label">
            <h1 className="text-4xl font-bold tracking-tight text-rg-ink">{shelter.displayName}</h1>
            {cityName !== null && (
              <p className="text-base text-rg-ink-2">
                {fillTemplate(uk.cardMeta.atShelter, { city: cityName })}
              </p>
            )}
          </div>

          <ShelterWordsSection words={words} headingLevel={2} />

          {shelter.donation && (
            <a
              href={shelter.donation.url}
              target="_blank"
              rel="noopener"
              data-testid="donate-link"
              className={`${buttonClass("secondary")} justify-between gap-row self-start`}
            >
              <span>{uk.detail.donateShelter}</span>
              <span className="text-rg-ink-2">{donationHost(shelter.donation)} ↗</span>
            </a>
          )}
        </div>

        {/*
          Designer feedback batch B: the grid itself now matches the
          gallery's own columns, gaps and per-breakpoint max-widths exactly
          (including `ultrawide:grid-cols-6`, missing before), so cards end
          up the same size on both pages. Outside `max-w-6xl` on purpose —
          that cap, fine for the name/words/donation prose above, is
          narrower than the gallery's own "wide" and "ultrawide" targets
          and would have clipped the grid right back to looking shrunk.

          His follow-up correction (screenshot, red line): the heading and
          sort control have to share the grid's own left edge, not just
          this wrapper's. The per-breakpoint max-width and `mx-auto` sit
          here, on `<section>` itself, so every child — heading, sort,
          skip link, grid, pagination — sits inside the exact same box
          instead of the heading sitting at a wider edge while only the
          grid (previously centred on its own, one level down) was
          narrower.
        */}
        <div className="p-group tablet:px-section tablet:pb-section">
          <section
            aria-labelledby={animalsHeadingId}
            className="mx-auto flex w-full flex-col gap-group desktop:max-w-[960px] wide:max-w-[1320px] ultrawide:max-w-[1992px]"
          >
            <h2 id={animalsHeadingId} className="text-2xl font-medium text-rg-ink">
              {fillTemplate(uk.shelterPage.animalsHeading, {
                count: String(animals.totalMatching),
              })}
            </h2>

            {animals.totalMatching === 0 ? (
              <p className="text-base text-rg-ink-2">{uk.shelterPage.noAnimals}</p>
            ) : (
              <>
                <SortLinks
                  sort={query.sort}
                  hrefFor={(sort) => hrefFor(sort, 1)}
                  visibility="flex"
                />

                {hasPagination(animals.totalPages) && (
                  <a
                    href="#pagination"
                    className={`sr-only focus:not-sr-only ${buttonClass("primary")} self-start`}
                  >
                    {uk.pagination.skipLink}
                  </a>
                )}

                <ArrowKeyGrid
                  element="ul"
                  labelledBy={animalsHeadingId}
                  className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3 wide:grid-cols-4 ultrawide:grid-cols-6 gap-4 desktop:gap-6"
                >
                  {animals.items.map((card, index) => (
                    <li key={card.id} className="flex flex-col">
                      <AnimalCard
                        card={card}
                        cityName={cityNames.get(cardCityId(card)) ?? null}
                        priority={index < PRIORITY_ROW_SIZE}
                        hideCityInMeta
                      />
                    </li>
                  ))}
                </ArrowKeyGrid>

                <PaginationNav
                  page={animals.page}
                  totalPages={animals.totalPages}
                  pageHref={(page) => hrefFor(query.sort, page)}
                />
              </>
            )}
          </section>
        </div>
      </main>

      <div className="mx-auto max-w-6xl p-group tablet:p-section">
        <Footer />
      </div>
    </div>
  );
}
