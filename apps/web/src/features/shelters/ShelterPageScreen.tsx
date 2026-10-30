import { donationHost, type GallerySort, NO_FILTERS, pluralizeUk } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import Image from "next/image";
import { useId } from "react";
import { REGISTRY_HAS_NO_REAL_SHELTERS } from "../../seo-flags";
import { buttonClass, LinkButton } from "../../ui/Button";
import { Container } from "../../ui/Container";
import { cx } from "../../ui/cx";
import { Heading } from "../../ui/Heading";
import { Pagination } from "../../ui/Pagination";
import { Toggle } from "../../ui/Toggle";
import { SiteHeader } from "../chrome/SiteHeader";
import { ActiveFilterChips } from "../gallery/ActiveFilterChips";
import { ArrowKeyGrid } from "../gallery/ArrowKeyGrid";
import { activeFilterChips, activeFilterCount } from "../gallery/active-filters";
import { cardCityId } from "../gallery/card-text";
import { FilterSheet } from "../gallery/FilterSheet";
import { type CitySlugsById, NO_PLACE_IDS, resetFiltersHref } from "../gallery/filter-url";
import { GalleryCard } from "../gallery/GalleryCard";
import { GalleryControlBlock } from "../gallery/GalleryControlBlock";
import { GalleryFilterDropdowns, SpeciesToggle } from "../gallery/GalleryFilterDropdowns";
import { hasPagination } from "../gallery/gallery-pagination";
import { NoMatch } from "../gallery/NoMatch";
import { ReplaceNav } from "../gallery/ReplaceNav";
import { ShelterLogoAvatar } from "./ShelterLogoAvatar";
import { ShelterWordsSection } from "./ShelterWordsSection";
import { isLongShelterName } from "./shelter-identity";
import type { ShelterPageView } from "./shelter-page-load";
import { shelterPageHref, shelterPagePath } from "./shelter-url";
import { shelterWordsOf } from "./shelter-words";

/** The shelter page parses no filters, so `GalleryCard`'s href gets the "never consulted" pair (as the saved page). */
const EMPTY_CITY_SLUGS: CitySlugsById = new Map();

/**
 * The shelter page (option A): back link, identity (logo, name, city, trust line, donate pill, and the
 * shelter's own words as a quote; each left out without data), then the heading, sort, grid and
 * pagination of its discoverable animals, or a dashed note when it has none. Date sorts only and no engagement figure
 * anywhere (commitments 1 and 2); every control is a plain link, so it works without JS.
 */
export function ShelterPageScreen({
  shelter,
  cityPlace,
  animals,
  cityNames,
  query,
  filterUi,
  kabinetSignedIn = false,
}: ShelterPageView & { kabinetSignedIn?: boolean }) {
  const animalsHeadingId = useId();
  const words = shelterWordsOf(shelter);
  const year = String(shelter.createdAt.getFullYear());
  // With filters on, the heading is the shelter's whole count and the filtered one has its own line.
  const animalsCountText = fillTemplate(uk.shelterPage.animalsHeading, {
    count: String(filterUi?.total ?? animals.totalMatching),
  });
  const withLong = (short: string, long: string) => `${short}. ${long}`;
  const { filters } = query;
  const basePath = shelterPagePath(shelter.id);
  const sortHref = (sort: GallerySort) => shelterPageHref(shelter.id, sort, 1, filters);
  const filtersOn = activeFilterCount(filters) > 0 || filters.species.kind !== "any";
  const countLine = fillTemplate(uk.shelterPage.countLine, {
    count: String(animals.totalMatching),
    animalWord: pluralizeUk(animals.totalMatching, uk.filters.animalWordAccusative),
  });
  const sortToggle = (
    <Toggle
      label={uk.filters.sortLabel}
      current={query.sort === "longest_waiting" ? 1 : 0}
      options={[
        {
          label: uk.filters.sortFreshestShort,
          href: sortHref("freshest"),
          ariaLabel: withLong(uk.filters.sortFreshestShort, uk.filters.sortFreshest),
        },
        {
          label: uk.filters.sortLongestWaitingShort,
          href: sortHref("longest_waiting"),
          ariaLabel: withLong(uk.filters.sortLongestWaitingShort, uk.filters.sortLongestWaiting),
        },
      ]}
    />
  );
  const heading = (
    <Heading level={2} id={animalsHeadingId}>
      {animalsCountText}
    </Heading>
  );

  return (
    <div className="min-h-dvh bg-page">
      <SiteHeader kabinetSignedIn={kabinetSignedIn} />

      {/* The D-2 demo disclosure, visible in the body as on the gallery and the animal page. */}
      {REGISTRY_HAS_NO_REAL_SHELTERS && (
        <Container className="pt-6">
          <span data-testid="shelter-demo-banner" className="text-caption text-ink-2">
            {uk.demo.bannerNotice}
          </span>
        </Container>
      )}

      {/* One `<main>` around the whole body, so the main landmark contains the animal list. */}
      <Container as="main" className="flex flex-col gap-13 pt-10 pb-10 desktop:pb-14">
        <LinkButton
          href="/tvaryny"
          variant="ghost"
          data-testid="shelter-back-link"
          className="w-fit self-start"
        >
          {uk.feed.backToList}
        </LinkButton>

        {/* Identity (option A): the logo beside the name; from `desktop` it is a left column. A name
            over 40 characters stacks under the logo on a phone. The wrapper below is `contents` on a
            phone so the name and the rest are direct flex items there, and a real column from `desktop`. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 desktop:flex-nowrap desktop:items-start desktop:gap-8">
          <ShelterLogoAvatar
            logo={shelter.logo}
            displayName={shelter.displayName}
            size="identity"
          />
          <div className="contents desktop:flex desktop:min-w-0 desktop:flex-1 desktop:flex-col desktop:gap-4">
            <Heading
              level={1}
              look="display-l"
              className={cx(
                "min-w-0 break-words desktop:max-w-190 desktop:flex-none desktop:basis-auto desktop:text-display-xl",
                isLongShelterName(shelter.displayName) ? "basis-full" : "flex-1",
              )}
            >
              {shelter.displayName}
            </Heading>
            <div className="flex basis-full flex-col gap-3 desktop:basis-auto desktop:flex-row desktop:flex-wrap desktop:items-center desktop:gap-x-4 desktop:gap-y-4">
              {cityPlace !== null && (
                <span className="inline-flex items-center gap-2">
                  <Image
                    src="/pet-card/icon-location.svg"
                    alt=""
                    aria-hidden="true"
                    width={32}
                    height={32}
                    unoptimized
                  />
                  <span className="text-body font-semibold text-accent-text desktop:text-body-l">
                    {fillTemplate(uk.cardMeta.atShelter, { place: cityPlace })}
                  </span>
                </span>
              )}
              <span aria-hidden="true" className="hidden h-6 w-0.5 bg-line desktop:block" />
              {/* Plain text, not chips; an unverified shelter shows the year alone. */}
              <span data-testid="shelter-trust-line" className="text-body text-ink-2">
                {shelter.verification === "verified" ? (
                  <span data-testid="shelter-verified-badge">
                    <span aria-hidden="true">✓ </span>
                    {fillTemplate(uk.detail.shelterVerifiedYears, { year })}
                  </span>
                ) : (
                  fillTemplate(uk.shelterPage.sinceYear, { year })
                )}
              </span>
              {/* Commitment 7: the shelter's sentence renders here and on no card or animal page. */}
              {words !== null && (
                <div className="basis-full desktop:order-last">
                  <ShelterWordsSection words={words} headingLevel={2} variant="quote" />
                </div>
              )}
              {shelter.donation && (
                <a
                  href={shelter.donation.url}
                  target="_blank"
                  rel="noopener"
                  data-testid="donate-link"
                  className={cx(buttonClass("secondary"), "w-fit")}
                >
                  <span>
                    {uk.detail.donateShelter}{" "}
                    <span className="text-ink-2">· {donationHost(shelter.donation)} ↗</span>
                  </span>
                </a>
              )}
            </div>
          </div>
        </div>

        {animals.totalMatching === 0 && filterUi === null ? (
          <div
            data-testid="shelter-no-animals"
            className="flex flex-col items-center gap-3 rounded-card border-2 border-dashed border-line px-4 py-8 text-center"
          >
            <p className="text-body-l text-ink-2">{uk.shelterPage.noAnimals}</p>
            <LinkButton href="/tvaryny" variant="ghost">
              {uk.detail.notFound.action}
            </LinkButton>
          </div>
        ) : (
          <section aria-labelledby={animalsHeadingId} className="flex flex-col gap-6">
            {filterUi === null ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                {heading}
                {animals.totalMatching > 1 && sortToggle}
              </div>
            ) : (
              <GalleryControlBlock
                title={heading}
                trailing={
                  <FilterSheet
                    filters={filters}
                    sort={query.sort}
                    placeIds={NO_PLACE_IDS}
                    citySlugs={EMPTY_CITY_SLUGS}
                    regionLabels={{}}
                    selectedCities={[]}
                    resultCount={animals.totalMatching}
                    counts={filterUi.counts}
                    scope={{ basePath }}
                  />
                }
                mobileSpecies={
                  filterUi.hasBothSpecies ? (
                    <ReplaceNav>
                      <SpeciesToggle
                        filters={filters}
                        sort={query.sort}
                        citySlugs={EMPTY_CITY_SLUGS}
                        basePath={basePath}
                        className="w-full"
                        testIdSuffix="-mobile"
                      />
                    </ReplaceNav>
                  ) : undefined
                }
                mobileSort={<ReplaceNav>{sortToggle}</ReplaceNav>}
                mobileChips={
                  <ReplaceNav>
                    <ActiveFilterChips
                      chips={activeFilterChips({
                        filters,
                        sort: query.sort,
                        citySlugs: EMPTY_CITY_SLUGS,
                        regionLabels: {},
                        selectedCities: [],
                        counts: filterUi.counts,
                        basePath,
                      })}
                      resetHref={resetFiltersHref(query.sort, basePath)}
                    />
                  </ReplaceNav>
                }
                mobileCount={
                  filtersOn ? (
                    <p aria-hidden="true" className="text-label text-ink-2">
                      {countLine}
                    </p>
                  ) : undefined
                }
              >
                <ReplaceNav>
                  <GalleryFilterDropdowns
                    filters={filters}
                    sort={query.sort}
                    citySlugs={EMPTY_CITY_SLUGS}
                    regionLabels={{}}
                    selectedCities={[]}
                    counts={filterUi.counts}
                    scope={{ basePath, showSpecies: filterUi.hasBothSpecies }}
                  />
                </ReplaceNav>
                <ReplaceNav>{sortToggle}</ReplaceNav>
              </GalleryControlBlock>
            )}
            {filterUi !== null && filtersOn && (
              <>
                <p aria-hidden="true" className="-mt-3 hidden text-label text-ink-2 desktop:block">
                  {countLine}
                </p>
                <span className="sr-only" aria-live="polite">
                  {countLine}
                </span>
              </>
            )}

            {animals.totalMatching === 0 && filterUi !== null ? (
              <NoMatch
                filters={filters}
                sort={query.sort}
                citySlugs={EMPTY_CITY_SLUGS}
                relaxations={filterUi.relaxations}
                basePath={basePath}
              />
            ) : (
              <>
                {hasPagination(animals.totalPages) && (
                  <a
                    href="#pagination"
                    className="sr-only focus:not-sr-only focus:mb-3 focus:inline-flex focus:min-h-target focus:items-center focus:rounded-field focus:bg-ink focus:px-4 focus:text-body focus:text-on-ink focus-ring"
                  >
                    {uk.pagination.skipLink}
                  </a>
                )}

                <ArrowKeyGrid
                  element="ul"
                  labelledBy={animalsHeadingId}
                  className="grid grid-cols-2 gap-x-3 gap-y-4 tablet:grid-cols-3 tablet:gap-4 desktop:grid-cols-4 desktop:gap-7.5"
                >
                  {animals.items.map((card, index) => (
                    <li key={card.id} className="flex flex-col">
                      <GalleryCard
                        card={card}
                        cityName={cityNames.get(cardCityId(card)) ?? null}
                        layout="stacked"
                        priority={index === 0}
                        filters={NO_FILTERS}
                        sort={query.sort}
                        citySlugs={EMPTY_CITY_SLUGS}
                      />
                    </li>
                  ))}
                </ArrowKeyGrid>

                {/* The skip link's target: focusable itself so the jump lands on the nav. */}
                <div id="pagination" tabIndex={-1} className="mt-6 pt-2">
                  <Pagination
                    page={animals.page}
                    totalPages={animals.totalPages}
                    hrefFor={(target) => shelterPageHref(shelter.id, query.sort, target, filters)}
                    navLabel={uk.pagination.navLabel}
                    prevLabel={uk.pagination.prev}
                    nextLabel={uk.pagination.next}
                    pageLabel={uk.pagination.pageLabel}
                    currentLabel={uk.pagination.current}
                    ofTotalLabel={fillTemplate(uk.pagination.ofTotal, {
                      total: String(animals.totalPages),
                    })}
                  />
                </div>
              </>
            )}
          </section>
        )}
      </Container>
    </div>
  );
}
