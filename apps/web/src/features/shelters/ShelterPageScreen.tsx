import { donationHost, NO_FILTERS } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import Image from "next/image";
import Link from "next/link";
import { useId } from "react";
import { REGISTRY_HAS_NO_REAL_SHELTERS } from "../../seo-flags";
import { Footer } from "../chrome/Footer";
import { SiteHeader } from "../chrome/SiteHeader";
import { ArrowKeyGrid } from "../gallery/ArrowKeyGrid";
import { cardCityId } from "../gallery/card-text";
import type { CitySlugsById } from "../gallery/filter-url";
import { GalleryCard } from "../gallery/GalleryCard";
import { PaginationNav } from "../gallery/GalleryPagination";
import { hasPagination } from "../gallery/gallery-pagination";
import { SortLinks } from "../gallery/SortControl";
import { ShelterLogoAvatar } from "./ShelterLogoAvatar";
import type { ShelterPageView } from "./shelter-page-load";
import { shelterPageHref } from "./shelter-url";
import { shelterWordsOf } from "./shelter-words";

const FOCUS =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-brand-accent focus-visible:outline-offset-[3px]";

/** As the gallery: the first row's photos load eagerly (`tvaryny/page.tsx`'s own `PRIORITY_ROW_SIZE`). */
const PRIORITY_ROW_SIZE = 2;

/**
 * `GalleryCard`'s own href (`animalPageHref`) needs a `FeedFilters` and a
 * city-slug map the same way the gallery does, but the shelter page parses
 * no filters from its URL at all (DR1-D3) - `NO_FILTERS` and an empty map
 * are the same "provably never consulted" pair `filter-url.ts`'s own
 * `NO_CITY_SLUGS` constant already uses for `resetFiltersHref`/
 * `similarAnimalsHref`, for the identical reason: `NO_FILTERS.cities` is
 * always `{ kind: "any" }`, so the city-slug lookup can never fire.
 */
const EMPTY_CITY_SLUGS: CitySlugsById = new Map();

/**
 * The shelter page (designer round 1, §1 and S6; pet card PR 6's wireframe,
 * Figma `euz4JGfpToY31VJY7ppVj9` node `87:1525` - a grey-box layout, not a
 * finished frame, so its block sizes are followed and its fills are this
 * page's own existing data and copy, not invented). Top to bottom: a back
 * link to the gallery, the shelter's logo/name/city (the pet card's own
 * shelter-row treatment: `ShelterLogoAvatar`, the location icon, the city in
 * `brand-accent`), three facts in a column to the right of that block
 * (verification, animal count, donation - each left out when there's no
 * data), the shelter's own words below in the pet card's body-text style,
 * then the heading + sort + grid + pagination for its discoverable animals.
 *
 * The list offers the gallery's two date sorts and its numbered pagination,
 * and nothing else (commitment 1: no featured, pinned or shelter-chosen
 * order). It shows inventory only: no view, save or inquiry count anywhere
 * (commitment 2), so a shelter reading its own page learns nothing about
 * adopters. Every control is a plain link: the page works without JS, like
 * the gallery.
 *
 * **Deviation from the wireframe (recorded, not silently resolved):** the
 * frame's logo circle is 246px. `ShelterLogoAvatar`'s largest rendered size
 * today is 160px (pet card PR 3b); upscaling a 160px source to 246px would
 * blur it, so this renders at 160px. A larger logo variant is a separate R2
 * pipeline change for later, not this PR's.
 *
 * **Decision taken:** the wireframe's sort box names `GallerySortToggle`,
 * which is being restyled concurrently by another PR and (per that PR's own
 * description) builds its hrefs rooted at `/tvaryny` - using it here would
 * both navigate a sort click off this shelter's page entirely and break
 * this screen's own pinned test ("offers the gallery's two date sorts, each
 * leading back to this shelter's page"). `SortLinks` (`SortControl.tsx`) is
 * kept instead: it is the sort control already wired to `shelterPageHref`,
 * unedited either way, and the one that actually keeps a sort change on
 * this shelter's own page. Flagged in the PR description for the filter
 * agent to weigh in on once its own PR lands.
 */
export function ShelterPageScreen({
  shelter,
  cityName,
  animals,
  cityNames,
  query,
  // Defaulted here (not in `SiteHeader`) for the same reason
  // `AnimalDetailScreen` defaults it - the real caller always passes it.
  kabinetSignedIn = false,
}: ShelterPageView & { kabinetSignedIn?: boolean }) {
  const animalsHeadingId = useId();
  const wordsHeadingId = useId();
  const words = shelterWordsOf(shelter);
  const hrefFor = (sort: typeof query.sort, page: number) =>
    shelterPageHref(shelter.id, sort, page);
  const animalsCountText = fillTemplate(uk.shelterPage.animalsHeading, {
    count: String(animals.totalMatching),
  });

  return (
    <div className="font-brand-ui min-h-dvh bg-brand-page">
      <SiteHeader kabinetSignedIn={kabinetSignedIn} />

      {/* The D-2 demo disclosure, visible in the body as on the gallery and the animal page. */}
      {REGISTRY_HAS_NO_REAL_SHELTERS && (
        <div className="px-4 pt-6 tablet:px-6 desktop:px-14">
          <span data-testid="shelter-demo-banner" className="text-[13px]/[18px] text-brand-ink-2">
            {uk.demo.bannerNotice}
          </span>
        </div>
      )}

      {/*
        One `<main>` wraps the whole page body (review of 6825ffd, finding
        1): a screen-reader user jumping to the main landmark should land
        somewhere with the animal list in it, not a region that excludes it.
      */}
      <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-13 px-4 pt-10 pb-10 tablet:px-6 desktop:px-14 desktop:pb-14">
        <Link
          href="/tvaryny"
          data-testid="shelter-back-link"
          className={`inline-flex min-h-12 w-fit items-center rounded-brand-field text-[20px] font-medium text-brand-ink-2 hover:text-brand-ink ${FOCUS}`}
        >
          {uk.feed.backToList}
        </Link>

        {/* Logo, name, city - the pet card's own shelter-row treatment - plus the three facts column. */}
        <div className="flex flex-col gap-6 desktop:flex-row desktop:items-start desktop:justify-between">
          {/*
            `flex-1 min-w-0` on the logo+name group: it claims the row's
            space first at `desktop:`, so a long display-font name wraps
            between words (the brief's own "let it wrap to 2 lines") rather
            than competing with the facts column for the same shrinkable
            space. The facts column gets a fixed `desktop:w-70` instead of
            shrinking unpredictably alongside it.

            Below `tablet:` the logo stacks above the name instead of beside
            it - caught on a real 390px screenshot, not assumed: side by
            side at every width left only ~190px for the name column next to
            a 160px circle, which is narrower than the display font's own
            single letterforms at 48px and forced `scrollWidth` past
            `clientWidth` (a real horizontal overflow, measured 500px of
            content in a 390px viewport), not merely an ugly wrap.
          */}
          <div className="flex min-w-0 flex-1 flex-col items-start gap-4 tablet:flex-row tablet:gap-6">
            <ShelterLogoAvatar logo={shelter.logo} displayName={shelter.displayName} size={160} />
            <div className="flex min-w-0 flex-col gap-3 tablet:pt-2">
              <h1 className="min-w-0 break-words font-brand-display text-[36px] leading-none text-brand-ink tablet:text-[48px]">
                {shelter.displayName}
              </h1>
              {cityName !== null && (
                <span className="inline-flex items-center gap-2">
                  <Image
                    src="/pet-card/icon-location.svg"
                    alt=""
                    aria-hidden="true"
                    width={32}
                    height={32}
                    unoptimized
                  />
                  <span className="text-[20px] font-semibold text-brand-accent">
                    {fillTemplate(uk.cardMeta.atShelter, { city: cityName })}
                  </span>
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-start gap-2 text-[15px]/[20px] font-medium text-brand-ink-2 desktop:w-70 desktop:items-end desktop:text-right">
            {shelter.verification === "verified" && (
              <span data-testid="shelter-verified-badge">
                {fillTemplate(uk.detail.shelterVerifiedYears, {
                  year: String(shelter.createdAt.getFullYear()),
                })}
              </span>
            )}
            {animals.totalMatching > 0 && <span>{animalsCountText}</span>}
            {shelter.donation && (
              <a
                href={shelter.donation.url}
                target="_blank"
                rel="noopener"
                data-testid="donate-link"
                className={`inline-flex items-center gap-1 rounded-brand-field underline decoration-brand-line underline-offset-2 hover:text-brand-ink ${FOCUS}`}
              >
                <span>{uk.detail.donateShelter}</span>
                <span>· {donationHost(shelter.donation)} ↗</span>
              </a>
            )}
          </div>
        </div>

        {/*
          «Слова притулку» - a local rendering, not `ShelterWordsSection`:
          that component is shared with the kabinet's own voice preview
          (`profile-edit/VoiceSection.tsx`), outside this redesign's scope,
          so restyling it in place would re-skin a kabinet screen this PR
          was never asked to touch. Same data (`shelterWordsOf`), same
          structure (one labelled region, description then sentence, absent
          entirely when the shelter wrote neither) - the pet card's own body
          text style (20px, `brand-ink-2`) in place of the old panel.
        */}
        {words !== null && (
          <section
            aria-labelledby={wordsHeadingId}
            className="flex flex-col gap-3 rounded-brand-panel bg-brand-surface p-6"
          >
            <h2 id={wordsHeadingId} className="text-[20px] font-bold text-brand-ink">
              {uk.freshness.attribution}
            </h2>
            {words.description !== null && (
              <p className="whitespace-pre-line text-[20px]/[1.4] tracking-[0.2px] text-brand-ink-2">
                {words.description}
              </p>
            )}
            {words.sentence !== null && (
              <p
                data-testid="shelter-freshness-sentence"
                className="text-[20px]/[1.4] tracking-[0.2px] text-brand-ink-2"
              >
                «{words.sentence}»
              </p>
            )}
          </section>
        )}

        <section aria-labelledby={animalsHeadingId} className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 id={animalsHeadingId} className="text-[26px] font-bold text-brand-ink">
              {animalsCountText}
            </h2>
            {/*
              `SortLinks` (`SortControl.tsx`, unedited) carries `self-start`
              and two `whitespace-nowrap` sentences, so at narrow widths its
              own intrinsic content is wider than this row has room for -
              measured, not assumed: `document.documentElement.scrollWidth`
              exceeded `clientWidth` at 390px until this wrapper contained
              it. A `w-full overflow-x-auto` wrapper keeps the overflow a
              small scrollable region here rather than widening the whole
              page; it is not a fix to the component itself, which this PR
              doesn't own - flagged in the PR description for the filter
              agent.
            */}
            {animals.totalMatching > 0 && (
              <div className="w-full overflow-x-auto">
                <SortLinks
                  sort={query.sort}
                  hrefFor={(sort) => hrefFor(sort, 1)}
                  visibility="flex"
                />
              </div>
            )}
          </div>

          {animals.totalMatching === 0 ? (
            <p className="text-[20px]/[1.4] text-brand-ink-2">{uk.shelterPage.noAnimals}</p>
          ) : (
            <>
              {hasPagination(animals.totalPages) && (
                <a
                  href="#pagination"
                  className={`sr-only focus:not-sr-only focus:mb-3 focus:inline-flex focus:min-h-12 focus:items-center focus:rounded-brand-field focus:bg-brand-ink focus:px-4 focus:text-[15px] focus:text-brand-on-ink ${FOCUS}`}
                >
                  {uk.pagination.skipLink}
                </a>
              )}

              <ArrowKeyGrid
                element="ul"
                labelledBy={animalsHeadingId}
                className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-4 gap-4 desktop:gap-[30px]"
              >
                {animals.items.map((card, index) => (
                  <li key={card.id} className="flex flex-col">
                    <GalleryCard
                      card={card}
                      cityName={cityNames.get(cardCityId(card)) ?? null}
                      priority={index < PRIORITY_ROW_SIZE}
                      filters={NO_FILTERS}
                      sort={query.sort}
                      citySlugs={EMPTY_CITY_SLUGS}
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
      </main>

      <div className="mx-auto max-w-[1400px] px-4 pb-10 tablet:px-6 desktop:px-14">
        <Footer />
      </div>
    </div>
  );
}
