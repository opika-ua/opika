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
import { SiteHeader } from "../chrome/SiteHeader";
import { chipDisplayLabel, similarAnimalsHref, similarAnimalsLabel } from "../gallery/filter-url";
import { SaveButton } from "../likes/SaveButton";
import { ShelterLogoAvatar } from "../shelters/ShelterLogoAvatar";
import { shelterPagePath } from "../shelters/shelter-url";
import { DetailPhotoGallery } from "./DetailPhotoGallery";
import { spayNeuterRow, vaccinationRow } from "./medical-labels";
import { RevealFlow } from "./RevealFlow";
import { ShareButton } from "./ShareButton";

const FOCUS =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-brand-accent focus-visible:outline-offset-[3px]";

interface AnimalDetailScreenProps {
  animal: AnimalDetailView;
  shelter: PublicShelterView;
  /** Resolved by the caller (`cities.list`), same pattern as the gallery's `AnimalCard` - this component never fetches. */
  cityName: string | null;
}

/**
 * Pet card PR 5 (Figma `75:425`/`88:1929`), replacing the pre-redesign
 * `docs/design/README.md` addendum layout wholesale. `AnimalDetailScreen`
 * (full-page chrome: `SiteHeader`, the demo banner) and `AnimalDetailContent`
 * (the shared panel body, rendered by both this full page and the gallery's
 * overlay, `AnimalOverlay.tsx`) stay the two exports batch A split this file
 * into (2026-10-23) - minimising blast radius for their two callers - but
 * `AnimalDetailContent`'s own internals are a full rewrite, not a restyle.
 *
 * **The old "← Усі тварини" back-link row is gone entirely** (owner decision
 * B's reasoning: "whoever lands [on the full page] didn't come from the
 * gallery," and the Figma page reference shows nothing between the header
 * and the panel at all - no back link, no placeholder row kept only for
 * spacing). `backToGalleryHref`/`uk.detail.backToListIn` left with it;
 * `uk.feed.backToList` stays, still used by the deck and its own error page.
 *
 * **Prev/next now lives entirely in `AnimalOverlay.tsx`**, not here - this
 * screen renders no prev/next row at all, matching "hide prev/next entirely"
 * literally rather than keeping an always-invisible row for spacing parity
 * with the overlay. The full page genuinely never fetches neighbours
 * (`animal-page-load.ts` is unchanged by this PR), so there is no data this
 * screen could render even if it wanted to.
 *
 * Real deviations from the Figma frame, recorded rather than silently
 * resolved - see the PR body for the full account, including the
 * "Contrast deviations (owner override)" list (decision 10):
 * 1. The meta line shows the age *bucket*, not "N років" (owner decision 3 -
 *    the contract only carries `ageBucket`).
 * 2. The freshness tag reuses `freshnessLabel` verbatim ("Оновлено N днів
 *    тому"), not the Figma mock's literal "Оновлено: N днів тому" with a
 *    colon (owner decision 2 - follows the gallery's own mechanism exactly).
 * 3. The backdrop/tint behind the overlay is an approximated flat colour,
 *    not a literal two-layer composite - see `AnimalOverlay.tsx`'s own
 *    comment.
 */
export function AnimalDetailScreen({
  // Defaulted here (not in `SiteHeader`, which stays strict) purely so the
  // many existing tests exercising this screen's own content don't all need
  // a prop they aren't testing; the one real caller (`app/tvaryny/[animalId]/page.tsx`)
  // always passes the computed value explicitly.
  kabinetSignedIn = false,
  ...content
}: AnimalDetailScreenProps & { kabinetSignedIn?: boolean }) {
  return (
    <div className="font-brand-ui min-h-dvh bg-brand-page">
      <SiteHeader kabinetSignedIn={kabinetSignedIn} />

      {/*
        The gallery's own visible carrier of the D-2 demo disclosure
        (`tvaryny/page.tsx`) needed the identical fix here - found by the
        reviewer, not caught in the first pass: this route is the one
        `/prytulkam` itself tells a shelter to expect shared into Telegram,
        so a visitor reaching it directly (not via the gallery) saw no demo
        disclosure at all, same gap, same reason (`description`/
        `og:description` are metadata, never page body). See `seo-flags.ts`'s
        own correction comment on `REGISTRY_HAS_NO_REAL_SHELTERS` for the
        full history.
      */}
      {REGISTRY_HAS_NO_REAL_SHELTERS && (
        <div className="p-4 tablet:p-6 desktop:px-14">
          <span data-testid="detail-demo-banner" className="text-[13px]/[18px] text-brand-ink-2">
            {uk.demo.bannerNotice}
          </span>
        </div>
      )}

      <div className="pt-6 desktop:pt-10">
        <AnimalDetailContent {...content} />
      </div>
    </div>
  );
}

/**
 * The gallery overlay and the full page both render exactly this: everything
 * the Figma panel specifies for the animal itself, with no page chrome - no
 * header, no demo banner, both of which the full page supplies around it
 * above, and the overlay's own backdrop/close-button/prev-next row supplies
 * instead (`AnimalOverlay.tsx`). No `neighbours` concept here at all - prev/
 * next is navigation chrome, not animal content, so it lives one level up in
 * whichever of the two callers actually has it.
 */
export function AnimalDetailContent({ animal, shelter, cityName }: AnimalDetailScreenProps) {
  const showDocuments =
    animal.documentReadiness.kind === "tracked" && hasAnyDocumentEvidence(animal.documentReadiness);
  const customTemperament = animal.temperament.find((entry) => entry.kind === "custom");

  return (
    <div className="mx-auto flex max-w-[1084px] flex-col gap-13 p-4 tablet:p-6 desktop:p-10">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-6 desktop:flex-row desktop:items-start desktop:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <h1
              data-testid="animal-name"
              className="text-[48px]/[1.15] font-bold tracking-[-0.01em] text-brand-ink"
            >
              {animal.name}
            </h1>
            <MetaLine animal={animal} />
          </div>
          {/*
            Pet card PR 5 follow-up: the save toggle moved here from beside
            the name, where it crowded the one piece of text that names the
            animal - the Figma reference has no save affordance to place at
            all, so this is a reversible UX call, not a deviation from a
            spec. Grouped with the two secondary/utility actions (share,
            same shape as `RevealFlow`/`ShareButton`'s own pills) rather
            than with the name (identity) or alone in a corner - «Дати
            сімʼю» stays the one unmistakably primary action, and «Поділитись»
            plus save read as one small cluster of "do something with this
            listing" actions beside it.
          */}
          <div className="flex flex-none items-center gap-4">
            <RevealFlow animalId={animal.id} animalName={animal.name} cityName={cityName} />
            <ShareButton animalId={animal.id} animalName={animal.name} />
            <SaveButton animalId={animal.id} animalName={animal.name} />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <span
            data-testid="freshness-block"
            className="inline-flex h-8 items-center rounded-[10px] bg-brand-line px-3 text-[16px] font-semibold text-brand-ink"
          >
            {freshnessLabel(animal.freshness)}
          </span>
          <div className="flex flex-wrap items-center gap-[30px]">
            <Link
              href={shelterPagePath(shelter.id)}
              prefetch={false}
              aria-label={fillTemplate(uk.detail.shelterRowLink, { name: shelter.displayName })}
              className={`inline-flex items-center gap-3.5 rounded-brand-field ${FOCUS}`}
            >
              <ShelterLogoAvatar logo={shelter.logo} displayName={shelter.displayName} />
              <span className="text-[20px] font-semibold text-brand-ink">
                {shelter.displayName}
              </span>
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
                <span
                  data-testid="shelter-city"
                  className="text-[20px] font-semibold text-brand-accent"
                >
                  {cityName}
                </span>
              </span>
            )}
          </div>
        </div>
        {/*
          Commitment 5 (`docs/standing-constraints.md`): donations are external links to the
          shelter's own payment page, domain visible before the tap. No frame in the Figma
          reference shows this state (its mock shelter carries no donation link), so keeping it
          is a decision taken, not a deviation from the design - a visual redesign was never
          asked to drop a real feature it just doesn't happen to mock. Placed under the header
          row rather than inside it, since the Figma header has no slot for it.
          `data-testid="donate-link"` unchanged for continuity with its existing test.
        */}
        {shelter.donation && (
          <a
            href={shelter.donation.url}
            target="_blank"
            rel="noopener"
            data-testid="donate-link"
            className={`inline-flex w-fit items-center gap-3 rounded-brand-field border-2 border-brand-line px-4 py-2 text-[16px] font-medium text-brand-ink ${FOCUS}`}
          >
            <span>{uk.detail.donateShelter}</span>
            <span className="text-brand-ink-2">{donationHost(shelter.donation)} ↗</span>
          </a>
        )}
      </div>

      {/* Photo slider */}
      <DetailPhotoGallery photos={animal.photos} altFallback={animal.name} />

      {/* Про мене */}
      <div className="flex flex-col gap-4">
        <h2 className="text-[26px] font-bold text-brand-ink">{uk.detail.aboutMeHeading}</h2>
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
          <h2 className="text-[26px] font-bold text-brand-ink">{uk.detail.myStoryHeading}</h2>
          {/*
            Decision 10 (contrast deviations, owner override): `brand-muted`
            is 2.66:1 on white, failing AA for body text. Shipped as designed
            anyway, per his instruction - see the PR body's own "Contrast
            deviations" list, which recommends `brand-ink-2` (5.4:1) as the fix.
          */}
          <p className="text-[20px]/[1.4] tracking-[0.2px] text-brand-muted">
            {textIn(animal.description, "uk")}
          </p>
        </div>
        {animal.medicalNotes !== null && (
          <div className="flex flex-1 flex-col gap-3">
            <h2 className="text-[26px] font-bold text-brand-ink">{uk.detail.medicalHeading}</h2>
            <p className="text-[20px]/[1.4] tracking-[0.2px] text-brand-muted">
              {textIn(animal.medicalNotes, "uk")}
            </p>
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

/** "Хлопчик · 5 років · середній" - sex, age bucket (owner decision 3 - the contract only
 * carries the bucket, never "N років") and size, the same three facts (and the same
 * gender-neutral age-bucket word) `cardFactsParts` already composes for the gallery card's
 * own meta line, just inlined here rather than coerced through `FeedCardView`'s shape. */
function MetaLine({ animal }: { animal: AnimalDetailView }) {
  const parts = [
    sexWordFor(animal.sex),
    chipDisplayLabel({ dimension: "ages", value: animal.ageBucket }),
    sizeLabel(animal.size),
  ].filter((part): part is string => Boolean(part));
  return (
    <span className="flex items-center gap-3 text-[20px]/[1.4] font-medium text-brand-ink-2">
      {parts.map((part, index) => (
        <span key={part} className="flex items-center gap-3">
          {index > 0 && (
            <span aria-hidden="true" className="h-1 w-[1.5px] shrink-0 bg-brand-ink-2" />
          )}
          {part}
        </span>
      ))}
    </span>
  );
}

const CHIP =
  "inline-flex h-13 items-center rounded-brand-field border-2 border-brand-line px-4 text-[20px] font-semibold text-brand-ink";

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
  return <span className={CHIP}>{text}</span>;
}

/** The sex chip: filterable since the gallery filter restructure, which reverses SF-D5
 * ("left non-filterable as a separate, unaddressed product question") - sex is one of
 * the four dimensions that restructure keeps as a real filter, so its chip joins
 * ages/sizes as a `FilterableChipLink`, same pattern, same species-plus-one-fact
 * question. Still omitted entirely for "unknown" - unaffected by filterability, the
 * same no-word-for-unknown contract `sexWordFor` already has (unlike `ageWordFor`,
 * which always has some word to fall back to) - a chip reading "more like this: not
 * recorded" would answer a question nobody asked. */
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

/** A filterable chip (A6): a `<Link>` to the gallery filtered to the animal's species plus this
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
    <Link
      href={similarAnimalsHref(species, chip)}
      prefetch={false}
      aria-label={similarAnimalsLabel(species, chip)}
      className={`${CHIP} ${FOCUS}`}
    >
      {visibleText ?? chipDisplayLabel(chip)}
    </Link>
  );
}
