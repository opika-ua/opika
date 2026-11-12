import type { AnimalDetailView, PublicShelterView } from "@opika/contracts";
import { donationHost, hasAnyDocumentEvidence, textIn } from "@opika/domain";
import {
  ageSpanLabel,
  ageWordFor,
  animalFactsParts,
  colourChipLabel,
  fillTemplate,
  sexWordFor,
  sizeWordFor,
  temperamentLabelFor,
  uk,
} from "@opika/i18n";
import { freshnessLabel } from "@opika/ui";
import Image from "next/image";
import Link from "next/link";
import { REGISTRY_HAS_NO_REAL_SHELTERS } from "../../seo-flags";
import { Avatar } from "../../ui/Avatar";
import { buttonLookClass } from "../../ui/Button";
import { Chip } from "../../ui/Chip";
import { Container } from "../../ui/Container";
import { Heading } from "../../ui/Heading";
import { Icon } from "../../ui/Icon";
import { LinkedText } from "../../ui/LinkedText";
import { MAIN_LANDMARK } from "../../ui/landmark";
import { MetaLine } from "../../ui/MetaLine";
import { BOTTOM_BAR } from "../../ui/sticky-bar";
import { Text } from "../../ui/Text";
import { SiteHeader } from "../chrome/SiteHeader";
import { chipDisplayLabel, similarAnimalsHref, similarAnimalsLabel } from "../gallery/filter-url";
import { SaveButton } from "../likes/SaveButton";
import { PauseNotice } from "../shelters/PauseNotice";
import { shelterPagePath } from "../shelters/shelter-url";
import { DetailPhotoGallery } from "./DetailPhotoGallery";
import { MedicalStatus } from "./MedicalStatus";
import { spayNeuterRow, vaccinationRow } from "./medical-labels";
import { RevealFlow } from "./RevealFlow";
import { ShareButton } from "./ShareButton";
import { STRIP_SLOTS, stripLayoutFor } from "./strip-layout";

// Below desktop the panel is a single column of at most 640px (centred on a tablet, the whole width
// on a phone); from desktop it fills its place on the page grid (columns 2-11).
const PANEL_WIDTH = "max-w-160 desktop:max-w-none";
// From desktop each section of the sheet is its own 12-column grid with the page's gutter, so photos,
// story and health share column edges.
const SHEET_GRID = "desktop:grid desktop:grid-cols-page desktop:gap-x-gutter";

interface AnimalDetailScreenProps {
  animal: AnimalDetailView;
  shelter: PublicShelterView;
  /** Resolved by the caller (`cities.byIds`), same pattern as the gallery's `AnimalCard` - this component never fetches. */
  cityName: string | null;
  /** The place as a meta line prints it, for the contact reveal (kind prefix, oblast where ambiguous). */
  cityPlace: string | null;
}

/**
 * Full-page chrome (header, demo banner) around `AnimalDetailContent`, which the gallery's
 * overlay (`AnimalOverlay.tsx`) renders too. Prev/next lives only in the overlay: the full page
 * never fetches neighbours, and shows no back-link row (owner decision B).
 *
 * Deviations from the Figma frame (full list in the pet card PR 5 body): the meta line shows a
 * declared range's span («3–4 роки»), else the age bucket, not "N років"; the freshness tag reuses
 * `freshnessLabel` verbatim, without the mock's colon.
 */
export function AnimalDetailScreen({
  // Defaulted so the tests of this screen's own content don't all need a prop they aren't
  // testing; the one real caller (`app/tvaryny/[animalId]/page.tsx`) always passes it.
  kabinetSignedIn = false,
  backToGalleryHref = "/tvaryny",
  ...content
}: AnimalDetailScreenProps & { kabinetSignedIn?: boolean; backToGalleryHref?: string }) {
  return (
    <div className="flex min-h-dvh flex-col bg-page">
      <SiteHeader kabinetSignedIn={kabinetSignedIn} current="animals" />

      <main {...MAIN_LANDMARK} className="flex flex-1 flex-col">
        {/* The demo disclosure must be in the page body, not only in metadata: this route is the one shelters share into Telegram. */}
        {REGISTRY_HAS_NO_REAL_SHELTERS && (
          <Container className="pt-4 tablet:pt-6">
            <span data-testid="detail-demo-banner">
              <Text as="span" look="hint">
                {uk.demo.bannerNotice}
              </Text>
            </span>
          </Container>
        )}

        {/* Below desktop the full page has no ✕ and no prev/next (those belong to the overlay), so the way out is this link. */}
        <div className="mx-auto w-full max-w-160 px-4 tablet:px-6 desktop:hidden">
          <Link
            href={backToGalleryHref}
            prefetch={false}
            className="inline-flex min-h-target items-center gap-1 rounded-field text-label focus-ring"
          >
            <Icon name="chevron-left" size="sm" />
            {uk.detail.notFound.action}
          </Link>
        </div>
        {/* From desktop the panel sits on page columns 2-11, the same place as the overlay's sheet. */}
        <div className="flex flex-1 flex-col desktop:block desktop:pt-10">
          <div className="flex flex-1 flex-col desktop:mx-auto desktop:box-content desktop:grid desktop:max-w-content desktop:grid-cols-page desktop:gap-x-gutter desktop:px-margin">
            <div className="flex flex-1 flex-col desktop:col-span-10 desktop:col-start-2">
              <AnimalDetailContent {...content} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * Registered names usually already open with the word («Притулок «Добрі лапи»»), and the template
 * adds it again; such a name is its own label (it also keeps the visible text inside the name).
 */
export function shelterRowLabel(displayName: string): string {
  return /^притулок(\s|$)/iu.test(displayName.trim())
    ? displayName
    : fillTemplate(uk.detail.shelterRowLink, { name: displayName });
}

/** The animal itself, with no page chrome: shared by the full page and the gallery overlay. */
export function AnimalDetailContent({
  animal,
  shelter,
  cityName,
  cityPlace,
}: AnimalDetailScreenProps) {
  const showDocuments =
    animal.documentReadiness.kind === "tracked" && hasAnyDocumentEvidence(animal.documentReadiness);
  const customTemperament = animal.temperament.find((entry) => entry.kind === "custom");
  const slots = STRIP_SLOTS[stripLayoutFor(animal.photos.length)];

  return (
    <div
      className={`mx-auto flex w-full flex-1 max-desktop:min-h-full ${PANEL_WIDTH} flex-col gap-4 px-4 pb-0 tablet:px-6 desktop:gap-12 desktop:p-10`}
    >
      {/* Header. Below desktop its wrappers dissolve (`contents`) so the action bar can stick to the
          bottom of the whole panel, not of the header. */}
      <div className={`flex flex-col gap-4 max-desktop:contents ${SHEET_GRID} desktop:gap-y-4`}>
        {/* From desktop the name and the actions share a line while both fit; otherwise the actions
            drop below, still right-aligned, rather than squeezing the name until a word breaks. */}
        <div className="flex flex-col gap-6 desktop:col-span-12 desktop:flex-row desktop:flex-wrap desktop:items-start desktop:justify-between max-desktop:contents">
          <div className="flex min-w-0 flex-col gap-1">
            <Heading level={1} look="display-l" className="break-words desktop:text-display-xl">
              {animal.name}
            </Heading>
            <MetaLine parts={metaParts(animal)} />
          </div>
          {/* Wraps onto two lines on a phone rather than overflowing; «Дати сімʼю» stays the one primary action. */}
          {/* Phone: the bar that is always on screen (sticky to the bottom of the panel's scroll), «Дати сімʼю» taking the width and two 52px circles; from desktop, the header's own row, right-aligned. */}
          <div
            {...BOTTOM_BAR}
            data-testid="action-bar"
            className="sticky bottom-0 z-10 order-last -mx-4 mt-auto flex items-center gap-2.5 border-line border-t bg-surface px-4 pt-3 pb-inset tablet:-mx-6 tablet:px-6 desktop:static desktop:order-none desktop:m-0 desktop:ml-auto desktop:flex-none desktop:flex-wrap desktop:justify-end desktop:gap-4 desktop:border-0 desktop:bg-transparent desktop:p-0"
          >
            {animal.availability.kind === "paused" ? null : (
              <RevealFlow
                animalId={animal.id}
                animalName={animal.name}
                cityName={cityPlace}
                cityLabel={cityName}
              />
            )}
            <ShareButton animalId={animal.id} animalName={animal.name} />
            <SaveButton animalId={animal.id} animalName={animal.name} />
          </div>
        </div>

        {animal.availability.kind === "paused" && (
          <div className="desktop:col-span-8">
            <PauseNotice
              reason={shelter.availability.kind === "paused" ? shelter.availability.reason : null}
            />
          </div>
        )}

        {/* The meta row: one dotted line from desktop; stacked on a phone. */}
        <div className="flex flex-col gap-4 desktop:col-span-8 desktop:flex-row desktop:flex-wrap desktop:items-center desktop:gap-x-3 desktop:gap-y-2">
          {/* Wraps the reserved chip below the freshness one when there is no room. */}
          <div className="flex flex-wrap items-center gap-2">
            <span data-testid="freshness-block" className="w-fit">
              <Chip kind="info">{freshnessLabel(animal.freshness)}</Chip>
            </span>
            {shelter.verification === "listed_before_verification" && (
              <span data-testid="under-review-badge" className="w-fit">
                <Chip kind="info">{uk.underReview.card}</Chip>
              </span>
            )}
            {animal.listingKind === "reserved" && (
              <span data-testid="reserved-badge" className="w-fit">
                <Chip kind="status" tone="reserved">
                  {uk.reserved.badge}
                </Chip>
              </span>
            )}
          </div>
          <MetaDot />
          <div className="flex min-w-0 items-center justify-between gap-3 desktop:justify-start">
            <Link
              href={shelterPagePath(shelter.id)}
              prefetch={false}
              aria-label={shelterRowLabel(shelter.displayName)}
              className="inline-flex min-h-target min-w-0 items-center gap-3 rounded-field focus-ring"
            >
              {shelter.logo === null ? (
                <Avatar kind="initials" name={shelter.displayName} />
              ) : (
                <Avatar kind="logo" src={shelter.logo.storageKey} />
              )}
              {/* A long name wraps, never cut short (owner, 2026-11-12); the city keeps its place. */}
              <Text as="span" look="label" className="min-w-0 break-words">
                {shelter.displayName}
              </Text>
            </Link>
            {cityName && (
              <>
                <MetaDot />
                <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap desktop:gap-2">
                  <Image
                    src="/pet-card/icon-location.svg"
                    alt=""
                    aria-hidden="true"
                    width={32}
                    height={32}
                    unoptimized
                    className="size-6 desktop:size-8"
                  />
                  <span data-testid="shelter-city">
                    <Text as="span" look="label" className="text-accent-text">
                      {cityName}
                    </Text>
                  </span>
                </span>
              </>
            )}
          </div>
          {/* No dot before it: the outline sets it apart, and when it wraps no dot is left at a line's end. */}
          {shelter.donation && (
            <SupportLink url={shelter.donation.url} host={donationHost(shelter.donation)} />
          )}
        </div>
      </div>

      {/* The body: photos, «Про мене», the story and the health block, placed by photo count
          (`strip-layout.ts`). Below desktop it dissolves into the phone's single column. */}
      <div className={`max-desktop:contents ${SHEET_GRID} desktop:gap-y-12 ${slots.body}`}>
        <DetailPhotoGallery photos={animal.photos} altFallback={animal.name} slot={slots.photos} />

        <div
          data-columns={slots.about.columns}
          className={`flex flex-col gap-4 max-desktop:pt-2 ${slots.about.className}`}
        >
          <Heading level={2}>{uk.detail.aboutMeHeading}</Heading>
          <div className="flex flex-wrap gap-2">
            <FilterableChipLink
              species={animal.species}
              dimension="ages"
              value={animal.ageBucket}
              visibleText={capitalised(
                animal.ageSpan === null
                  ? ageWordFor(animal.ageBucket, animal.sex)
                  : ageSpanLabel(animal.ageSpan),
              )}
            />
            <SexChip species={animal.species} sex={animal.sex} />
            <FilterableChipLink
              species={animal.species}
              dimension="sizes"
              value={animal.size}
              visibleText={capitalised(sizeWordFor(animal.size, animal.sex))}
            />
            {animal.temperament
              .filter((entry) => entry.kind === "preset")
              .map((entry) => (
                <PlainChip key={entry.trait} text={temperamentLabelFor(entry.trait, animal.sex)} />
              ))}
            {customTemperament?.kind === "custom" && (
              <PlainChip text={textIn(customTemperament.text, "uk")} />
            )}
            {animal.colour?.kind === "preset" && (
              <PlainChip text={colourChipLabel(animal.colour.colour)} />
            )}
            {animal.colour?.kind === "custom" && (
              <PlainChip text={textIn(animal.colour.text, "uk")} />
            )}
            {animal.coatLength && <PlainChip text={COAT_WORDS[animal.coatLength]} />}
            {showDocuments && animal.documentReadiness.kind === "tracked" && (
              <>
                {animal.documentReadiness.microchip.kind === "present" && (
                  <PlainChip text={uk.documents.chipPresent} />
                )}
                {animal.documentReadiness.rabiesVaccination.kind === "present" && (
                  <PlainChip text={uk.documents.rabiesPresent} />
                )}
              </>
            )}
          </div>
        </div>

        {/* Моя історія / Медичний стан: stacked on a phone; from desktop each takes its own slot. */}
        <div className="flex flex-col gap-13 desktop:contents">
          <div
            data-columns={slots.story.columns}
            className={`flex flex-1 flex-col gap-3 ${slots.story.className}`}
          >
            <Heading level={2}>{uk.detail.myStoryHeading}</Heading>
            <Text look="lead" className="text-ink-2">
              <LinkedText text={textIn(animal.description, "uk")} />
            </Text>
          </div>
          <div data-columns={slots.medical.columns} className={slots.medical.className}>
            <MedicalStatus
              rows={[vaccinationRow(animal.vaccination), spayNeuterRow(animal.spayNeuter)]}
              notes={animal.medicalNotes === null ? null : textIn(animal.medicalNotes, "uk")}
            />
          </div>
        </div>
      </div>

      {/* Footer divider */}
      <div className="flex items-center justify-center gap-10 pt-2">
        <Image
          src="/pet-card/divider-left.svg"
          alt=""
          aria-hidden="true"
          width={431}
          height={6}
          unoptimized
          className="h-auto min-w-0 flex-1"
        />
        <Image
          src="/pet-card/mascot-divider.svg"
          alt=""
          aria-hidden="true"
          width={63}
          height={60}
          unoptimized
          className="h-15 w-auto flex-none"
        />
        <Image
          src="/pet-card/divider-right.svg"
          alt=""
          aria-hidden="true"
          unoptimized
          width={431}
          height={6}
          className="h-auto min-w-0 flex-1"
        />
      </div>
    </div>
  );
}

/** The meta row's separator, from desktop only (a phone stacks the parts). */
function MetaDot() {
  return (
    <span aria-hidden="true" className="size-1 shrink-0 rounded-pill bg-ink-2 max-desktop:hidden" />
  );
}

/**
 * Commitment 5: donations are external links to the shelter's own payment page, with the domain
 * visible before the tap (owner, 2026-11-12: plain text after the pill, wrapping below it when the
 * line is full; the pill itself never wraps or stretches).
 */
function SupportLink({ url, host }: { url: string; host: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      data-testid="donate-link"
      className="inline-flex min-h-target w-fit max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-field focus-ring"
    >
      <span className={`${buttonLookClass("secondary")} whitespace-nowrap`}>
        {uk.detail.donateShelter}
        <span aria-hidden="true">↗</span>
      </span>
      <Text as="span" look="hint" className="break-all">
        {host}
      </Text>
    </a>
  );
}
/** Species, sex, age bucket and size: the shared facts line, same as every other animal surface. */
function metaParts(animal: AnimalDetailView): string[] {
  return animalFactsParts({
    species: animal.species,
    sex: animal.sex,
    ageBucket: animal.ageBucket,
    ageSpan: animal.ageSpan,
    size: animal.size,
  });
}

/** «Про мене» chips keep their own capitalised look (UX review #14 is out of scope here). */
const capitalised = (word: string): string =>
  word.charAt(0).toLocaleUpperCase("uk") + word.slice(1);

/** Coat length's own words, no longer read through `chipDisplayLabel` (gallery filter
 * restructure removed the fur filter, which that function served): the two words
 * themselves stay public, under `uk.filters.*` still, since this chip is their only
 * remaining caller - see that key's own comment in `uk.ts`. */
const COAT_WORDS: Record<NonNullable<AnimalDetailView["coatLength"]>, string> = {
  short: uk.filters.coatShort,
  long: uk.filters.coatLong,
};

/** A non-filterable fact, as plain text (A6 - custom «Інше» values and the medical facts). */
function PlainChip({ text }: { text: string }) {
  return <Chip kind="fact">{text}</Chip>;
}

/** The sex chip joins ages/sizes as a filterable chip; omitted for "unknown" (no word to show, and "more like this: not recorded" answers nothing). */
function SexChip({
  species,
  sex,
}: {
  species: AnimalDetailView["species"];
  sex: AnimalDetailView["sex"];
}) {
  const word = sexWordFor(sex);
  return word === null ? null : (
    <FilterableChipLink species={species} dimension="sexes" value={sex} visibleText={word} />
  );
}

/** A filterable chip (A6): a link to the gallery filtered to the animal's species plus this
 * one fact, accessible name via `similarAnimalsLabel`. `visibleText` overrides the default
 * (`chipDisplayLabel`) for temperament, whose visible chip uses the sex-matched singular form,
 * not the plural the accessible name reads. */
function FilterableChipLink<D extends Parameters<typeof chipDisplayLabel>[0]["dimension"]>({
  species,
  dimension,
  value,
  visibleText,
}: {
  species: AnimalDetailView["species"];
  dimension: D;
  value: Extract<Parameters<typeof chipDisplayLabel>[0], { dimension: D }>["value"];
  visibleText?: string;
}) {
  const chip = { dimension, value } as Parameters<typeof chipDisplayLabel>[0];
  return (
    <Chip
      kind="fact"
      href={similarAnimalsHref(species, chip)}
      aria-label={similarAnimalsLabel(species, chip, visibleText)}
    >
      {visibleText ?? chipDisplayLabel(chip)}
    </Chip>
  );
}
