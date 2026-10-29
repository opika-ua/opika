import type { AnimalDetailView, PublicShelterView } from "@opika/contracts";
import { donationHost, hasAnyDocumentEvidence, textIn } from "@opika/domain";
import {
  colourChipLabel,
  fillTemplate,
  sexWordFor,
  sizeLabel,
  temperamentLabelFor,
  uk,
} from "@opika/i18n";
import { freshnessLabel } from "@opika/ui";
import Image from "next/image";
import Link from "next/link";
import { REGISTRY_HAS_NO_REAL_SHELTERS } from "../../seo-flags";
import { Avatar } from "../../ui/Avatar";
import { LinkButton } from "../../ui/Button";
import { Chip } from "../../ui/Chip";
import { Heading } from "../../ui/Heading";
import { MetaLine } from "../../ui/MetaLine";
import { Text } from "../../ui/Text";
import { SiteHeader } from "../chrome/SiteHeader";
import { chipDisplayLabel, similarAnimalsHref, similarAnimalsLabel } from "../gallery/filter-url";
import { SaveButton } from "../likes/SaveButton";
import { shelterPagePath } from "../shelters/shelter-url";
import { DetailPhotoGallery } from "./DetailPhotoGallery";
import { spayNeuterRow, vaccinationRow } from "./medical-labels";
import { RevealFlow } from "./RevealFlow";
import { ShareButton } from "./ShareButton";

// The Figma panel's 1084px on the spacing scale (271 x 4px).
const PANEL_WIDTH = "max-w-271";

interface AnimalDetailScreenProps {
  animal: AnimalDetailView;
  shelter: PublicShelterView;
  /** Resolved by the caller (`cities.list`), same pattern as the gallery's `AnimalCard` - this component never fetches. */
  cityName: string | null;
}

/**
 * Full-page chrome (header, demo banner) around `AnimalDetailContent`, which the gallery's
 * overlay (`AnimalOverlay.tsx`) renders too. Prev/next lives only in the overlay: the full page
 * never fetches neighbours, and shows no back-link row (owner decision B).
 *
 * Deviations from the Figma frame (full list in the pet card PR 5 body): the meta line shows the
 * age bucket, not "N років" (the contract carries only the bucket); the freshness tag reuses
 * `freshnessLabel` verbatim, without the mock's colon.
 */
export function AnimalDetailScreen({
  // Defaulted so the tests of this screen's own content don't all need a prop they aren't
  // testing; the one real caller (`app/tvaryny/[animalId]/page.tsx`) always passes it.
  kabinetSignedIn = false,
  ...content
}: AnimalDetailScreenProps & { kabinetSignedIn?: boolean }) {
  return (
    <div className="min-h-dvh bg-page">
      <SiteHeader kabinetSignedIn={kabinetSignedIn} />

      <main>
        {/* The demo disclosure must be in the page body, not only in metadata: this route is the one shelters share into Telegram. */}
        {REGISTRY_HAS_NO_REAL_SHELTERS && (
          <div className="p-4 tablet:p-6 desktop:px-14">
            <span data-testid="detail-demo-banner">
              <Text as="span" look="hint">
                {uk.demo.bannerNotice}
              </Text>
            </span>
          </div>
        )}

        <div className="pt-6 desktop:pt-10">
          <AnimalDetailContent {...content} />
        </div>
      </main>
    </div>
  );
}

/** The animal itself, with no page chrome: shared by the full page and the gallery overlay. */
export function AnimalDetailContent({ animal, shelter, cityName }: AnimalDetailScreenProps) {
  const showDocuments =
    animal.documentReadiness.kind === "tracked" && hasAnyDocumentEvidence(animal.documentReadiness);
  const customTemperament = animal.temperament.find((entry) => entry.kind === "custom");

  return (
    <div className={`mx-auto flex ${PANEL_WIDTH} flex-col gap-13 p-4 tablet:p-6 desktop:p-10`}>
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-6 desktop:flex-row desktop:items-start desktop:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <Heading level={1} look="display-l" className="desktop:text-display-xl">
              {animal.name}
            </Heading>
            <MetaLine parts={metaParts(animal)} />
          </div>
          {/* Wraps onto two lines on a phone rather than overflowing; «Дати сімʼю» stays the one primary action. */}
          <div className="flex flex-none flex-wrap items-center gap-4">
            <RevealFlow animalId={animal.id} animalName={animal.name} cityName={cityName} />
            <ShareButton animalId={animal.id} animalName={animal.name} />
            <SaveButton animalId={animal.id} animalName={animal.name} />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <span data-testid="freshness-block">
            <Chip kind="info">{freshnessLabel(animal.freshness)}</Chip>
          </span>
          <div className="flex flex-wrap items-center gap-8">
            <Link
              href={shelterPagePath(shelter.id)}
              prefetch={false}
              aria-label={fillTemplate(uk.detail.shelterRowLink, { name: shelter.displayName })}
              className="inline-flex min-h-target items-center gap-3 rounded-field focus-ring"
            >
              {shelter.logo === null ? (
                <Avatar kind="initials" name={shelter.displayName} />
              ) : (
                <Avatar kind="logo" src={shelter.logo.storageKey} />
              )}
              <Text as="span" look="label">
                {shelter.displayName}
              </Text>
            </Link>
            {cityName && (
              <span className="inline-flex items-center gap-2">
                <Image
                  src="/pet-card/icon-location.svg"
                  alt=""
                  aria-hidden="true"
                  width={32}
                  height={32}
                  unoptimized
                />
                <span data-testid="shelter-city">
                  <Text as="span" look="label" className="text-accent">
                    {cityName}
                  </Text>
                </span>
              </span>
            )}
          </div>
        </div>
        {/* Commitment 5: donations are external links to the shelter's own payment page, domain visible before the tap. */}
        {shelter.donation && (
          <LinkButton
            variant="secondary"
            href={shelter.donation.url}
            target="_blank"
            rel="noopener"
            data-testid="donate-link"
            className="w-fit"
          >
            <span>{uk.detail.donateShelter}</span>
            <span className="text-ink-2">{donationHost(shelter.donation)} ↗</span>
          </LinkButton>
        )}
      </div>

      {/* Photo slider */}
      <DetailPhotoGallery photos={animal.photos} altFallback={animal.name} />

      {/* Про мене */}
      <div className="flex flex-col gap-4">
        <Heading level={2}>{uk.detail.aboutMeHeading}</Heading>
        <div className="flex flex-wrap gap-4">
          <FilterableChipLink species={animal.species} dimension="ages" value={animal.ageBucket} />
          <SexChip species={animal.species} sex={animal.sex} />
          <FilterableChipLink species={animal.species} dimension="sizes" value={animal.size} />
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
          <MedicalChip row={vaccinationRow(animal.vaccination)} />
          <MedicalChip row={spayNeuterRow(animal.spayNeuter)} />
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

      {/* Моя історія / Медичний стан */}
      <div className="flex flex-col gap-13 desktop:flex-row">
        <div className="flex flex-1 flex-col gap-3">
          <Heading level={2}>{uk.detail.myStoryHeading}</Heading>
          <Text look="lead" className="text-ink-2">
            {textIn(animal.description, "uk")}
          </Text>
        </div>
        {animal.medicalNotes !== null && (
          <div className="flex flex-1 flex-col gap-3">
            <Heading level={2}>{uk.detail.medicalHeading}</Heading>
            <Text look="lead" className="text-ink-2">
              {textIn(animal.medicalNotes, "uk")}
            </Text>
          </div>
        )}
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

/** Sex, age bucket and size: the gallery card's three facts, composed here from the detail view. */
function metaParts(animal: AnimalDetailView): string[] {
  return [
    sexWordFor(animal.sex),
    chipDisplayLabel({ dimension: "ages", value: animal.ageBucket }),
    sizeLabel(animal.size),
  ].filter((part): part is string => Boolean(part));
}

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
  return (
    <Chip kind="info" tone="outline">
      {text}
    </Chip>
  );
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

/** A medical fact chip (owner decision A3): always rendered, even unknown - the «Не записано»
 * rule applies to this fact specifically, unlike the other, omit-when-absent chips below. */
function MedicalChip({ row }: { row: ReturnType<typeof vaccinationRow> }) {
  return <PlainChip text={`${row.label}: ${row.statusText}`} />;
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
      kind="link"
      href={similarAnimalsHref(species, chip)}
      prefetch={false}
      aria-label={similarAnimalsLabel(species, chip)}
    >
      {visibleText ?? chipDisplayLabel(chip)}
    </Chip>
  );
}
