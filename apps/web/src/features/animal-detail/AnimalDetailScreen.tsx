import type { AnimalDetailView, PublicShelterView } from "@opika/contracts";
import { donationHost, hasAnyDocumentEvidence, pluralizeUk, textIn } from "@opika/domain";
import { ageBucketLabel, sizeLabel, uk } from "@opika/i18n";
import { freshnessLabel, freshnessPips } from "@opika/ui";
import Image from "next/image";
import Link from "next/link";
import { spayNeuterRow, vaccinationRow } from "./medical-labels";
import { RevealFlow } from "./RevealFlow";

const PHOTO_SIZES = "(max-width: 1023px) 100vw, 560px";

/**
 * "Перевірений вручну · {years} на Opika" — years is whole, floored, never
 * negative (a shelter created "today" reads as 0, not a fraction or a
 * negative from clock skew).
 */
function yearsOnOpika(createdAt: Date, now: Date): number {
  const years = (now.getTime() - createdAt.getTime()) / (365.2425 * 86_400_000);
  return Math.max(0, Math.floor(years));
}

function speciesLabel(species: AnimalDetailView["species"]): string {
  return species === "dog" ? uk.detail.speciesDog : uk.detail.speciesCat;
}

interface AnimalDetailScreenProps {
  animal: AnimalDetailView;
  shelter: PublicShelterView;
  now: Date;
  /** Resolved by the caller (`cities.list`), same pattern as the gallery's `AnimalCard` — this component never fetches. */
  cityName: string | null;
}

/**
 * `docs/design/README.md`'s addendum, frames D1 (1920)/D2 (360) —
 * `Opika Registry Frames.dc.html`, opened directly per
 * `docs/standing-constraints.md`'s "when a mock exists, open the mock
 * file." One DOM tree reflowing by breakpoint (`tablet:`/`desktop:`),
 * matching the gallery's own approach: a Server Component cannot know the
 * client's width, and this page must render correctly with no JS.
 *
 * Two real deviations from the mock, both recorded rather than silently
 * resolved — see this phase's PR body for the full account:
 * 1. The subtitle drops "Метис" (breed) — `Animal` has no breed field.
 * 2. The medical section renders two rows (vaccination, spayNeuter), not
 *    the mock's three ("Сказ" / "Комплексне щеплення" / "Стерилізація") —
 *    `medical-labels.ts`'s own comment has the full reasoning.
 */
export function AnimalDetailScreen({ animal, shelter, now, cityName }: AnimalDetailScreenProps) {
  const photo = animal.photos[0] ?? null;
  const thumbnails = animal.photos.slice(1, 4);
  const fills = freshnessPips(animal.freshness.kind);
  const showDocuments =
    animal.documentReadiness.kind === "tracked" && hasAnyDocumentEvidence(animal.documentReadiness);
  const years = yearsOnOpika(shelter.createdAt, now);
  const yearsLabel = pluralizeUk(years, { one: "рік", few: "роки", many: "років" });

  const subtitle = [
    speciesLabel(animal.species),
    ageBucketLabel(animal.ageBucket),
    sizeLabel(animal.size),
  ].join(" · ");

  /**
   * `animal.publicLocation` is `null` for an animal still at its own
   * shelter — it inherits the shelter's `fuzzed_address` location (`CLAUDE
   * .md` decision #17). Non-null means fostered: `city`-precision only, no
   * coordinates at all, per that field's own doc comment on `Animal`.
   */
  const isFostered = animal.publicLocation !== null;
  const locationLine = (isFostered ? uk.location.lineFostered : uk.location.lineAtShelter).replace(
    "{city}",
    cityName ?? "",
  );

  return (
    <div className="font-rg min-h-dvh bg-rg-page">
      <header className="min-h-14 tablet:min-h-16 desktop:min-h-17 flex items-center gap-3 bg-rg-surface px-4 tablet:px-6 desktop:px-15">
        <Link
          href="/tvaryny"
          data-testid="back-to-list"
          className="min-h-11 inline-flex items-center gap-1.5 rounded-rg-button bg-rg-fill px-4 text-[15px] font-medium text-rg-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px] desktop:hidden"
        >
          {uk.feed.backToList}
        </Link>
        <Link
          href="/tvaryny"
          data-testid="back-to-list-desktop"
          className="hidden desktop:inline-flex min-h-11 items-center text-[15px] text-rg-ink-2 rounded-rg-button focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
        >
          {uk.detail.backToListIn.replace("{city}", cityName ?? "")}
        </Link>
      </header>

      <div className="desktop:max-w-[1200px] desktop:mx-auto p-4 tablet:p-6 desktop:py-10 desktop:px-8 desktop:flex desktop:gap-10 desktop:items-start">
        {/* Photo column — sticky on desktop, fixed-height strip on mobile. */}
        <div className="desktop:w-[560px] desktop:flex-none desktop:sticky desktop:top-10 flex flex-col gap-2">
          <div
            data-testid="detail-photo"
            className="relative w-full h-[380px] tablet:h-[480px] desktop:h-auto desktop:aspect-[4/5] rounded-rg-card overflow-hidden bg-rg-photo-placeholder"
          >
            {photo && (
              <Image
                src={photo.storageKey}
                alt={photo.alt?.uk ?? animal.name}
                fill
                sizes={PHOTO_SIZES}
                priority
                className="object-cover"
              />
            )}
            {/* Freshness pips overlay the photo on mobile only — desktop shows the freshness block below the name instead. */}
            <div
              aria-hidden="true"
              className="desktop:hidden absolute right-4 bottom-4 flex gap-1.5"
            >
              {fills.map((fill, i) => (
                <div
                  key={i}
                  className={`size-2 rounded-full ${fill === "empty" ? "bg-transparent border-[1.5px] border-rg-ink-3" : fill}`}
                />
              ))}
            </div>
          </div>

          {thumbnails.length > 0 && (
            <div className="hidden desktop:flex gap-2">
              {thumbnails.map((thumb, i) => (
                <div
                  key={i}
                  className="relative w-22 h-22 rounded-rg-photo overflow-hidden bg-rg-photo-placeholder"
                >
                  <Image src={thumb.storageKey} alt="" fill sizes="88px" className="object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Content column */}
        <div className="flex-1 min-w-0 flex flex-col gap-6 mt-4 desktop:mt-0">
          <div className="flex flex-col gap-1">
            <h1
              data-testid="animal-name"
              className="font-bold text-[34px]/[38px] desktop:text-[44px]/[46px] tracking-[-0.03em] text-rg-ink"
            >
              {animal.name}
            </h1>
            <span className="text-[15px]/[22px] text-rg-ink-2">{subtitle}</span>
          </div>

          {/* Freshness quote block — hidden on mobile above the fold since the photo overlay already shows pips; shown here on desktop, and on mobile below the name (design allows the block to repeat once the pips already appeared on the photo). */}
          <div
            data-testid="freshness-block"
            className="bg-rg-fill rounded-rg-button p-4 flex flex-col gap-2"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex gap-1.5" aria-hidden="true">
                {fills.map((fill, i) => (
                  <div
                    key={i}
                    className={`size-2.5 rounded-full ${fill === "empty" ? "bg-transparent border-[1.5px] border-rg-ink-3" : fill}`}
                  />
                ))}
              </div>
              <span className="text-[15px]/[22px] text-rg-ink">
                {freshnessLabel(animal.freshness)}
              </span>
            </div>
            {shelter.description.uk && (
              <span className="text-[17px]/[26px] text-rg-ink">
                “{textIn(shelter.description, "uk")}”
              </span>
            )}
            <span className="text-[13px]/[18px] text-rg-ink-3">{uk.freshness.attribution}</span>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              data-testid="not-now-button"
              className="min-h-14 flex-1 rounded-rg-button bg-rg-fill text-[15px] font-medium text-rg-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
            >
              {uk.actions.notNow}
            </button>
            <RevealFlow animalId={animal.id} animalName={animal.name} cityName={cityName} />
          </div>

          <div className="flex flex-col desktop:flex-row gap-6">
            <div className="flex-1 min-w-0 flex flex-col gap-3">
              <span className="text-[19px]/[24px] font-medium text-rg-ink">
                {uk.medical.heading}
              </span>
              <MedicalRowView row={vaccinationRow(animal.vaccination)} />
              <MedicalRowView row={spayNeuterRow(animal.spayNeuter)} />
              {showDocuments && (
                <div className="flex gap-2 pt-1">
                  {animal.documentReadiness.kind === "tracked" &&
                    animal.documentReadiness.microchip.kind === "present" && (
                      <span className="inline-flex min-h-7 items-center rounded-rg-chip bg-rg-fill px-3 text-[13px] text-rg-ink-2">
                        {uk.documents.chipPresent}
                      </span>
                    )}
                  {animal.documentReadiness.kind === "tracked" &&
                    animal.documentReadiness.rabiesVaccination.kind === "present" && (
                      <span className="inline-flex min-h-7 items-center rounded-rg-chip bg-rg-fill px-3 text-[13px] text-rg-ink-2">
                        {uk.documents.rabiesPresent}
                      </span>
                    )}
                </div>
              )}
            </div>

            <div className="desktop:w-65 desktop:flex-none flex flex-col gap-3">
              <span className="text-[19px]/[24px] font-medium text-rg-ink">
                {uk.location.heading}
              </span>
              <div className="bg-rg-fill-strong rounded-rg-button p-4 flex flex-col gap-2">
                <span className="text-[15px]/[22px] font-medium text-rg-ink">{locationLine}</span>
                <span className="text-[15px]/[22px] text-rg-ink-2">
                  {uk.location.noMapExplanation}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 pt-2">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="size-11 rounded-full bg-rg-fill inline-flex items-center justify-center text-[15px] font-medium text-rg-ink-2 flex-none"
              >
                {shelter.displayName.replace(/[«»]/g, "").trim().slice(0, 1)}
              </span>
              <div className="flex flex-col gap-0.5">
                <span className="text-[15px]/[22px] font-medium text-rg-ink">
                  {shelter.displayName}
                </span>
                <span className="text-[13px]/[18px] text-rg-ink-3">
                  {uk.detail.shelterVerifiedYears.replace("{years}", `${years} ${yearsLabel}`)}
                </span>
              </div>
            </div>

            {shelter.donation && (
              <a
                href={shelter.donation.url}
                target="_blank"
                rel="noopener"
                data-testid="donate-link"
                className="flex items-center justify-between gap-3 min-h-14 rounded-rg-button bg-rg-fill px-5 text-[15px] text-rg-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
              >
                <span>{uk.detail.donateShelter}</span>
                <span className="text-rg-ink-2">{donationHost(shelter.donation)} ↗</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MedicalRowView({ row }: { row: ReturnType<typeof vaccinationRow> }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className={`w-1 h-4 rounded-rg-chip flex-none ${row.barClassName}`}
      />
      <span className="flex-1 min-w-0 text-[15px]/[22px] text-rg-ink">{row.label}</span>
      <span
        className={`text-[15px]/[22px] ${row.barClassName === "bg-rg-registry" ? "font-medium text-rg-registry" : row.barClassName === "bg-rg-ink-3" ? "text-rg-ink-2" : "text-rg-ink-3"}`}
      >
        {row.statusText}
      </span>
    </div>
  );
}
