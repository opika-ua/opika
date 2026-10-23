import type { AnimalDetailView, PublicShelterView } from "@opika/contracts";
import { donationHost, hasAnyDocumentEvidence } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import Link from "next/link";
import { REGISTRY_HAS_NO_REAL_SHELTERS } from "../../seo-flags";
import { Footer } from "../chrome/Footer";
import { SiteHeader } from "../chrome/SiteHeader";
import { FOCUS_RING } from "../controls/controls";
import { SaveButton } from "../likes/SaveButton";
import { shelterPagePath } from "../shelters/shelter-url";
import { CoatFact } from "./CoatFact";
import { DetailPhotoGallery } from "./DetailPhotoGallery";
import { animalLocationLine, animalSubtitle } from "./detail-text";
import { FreshnessBlock } from "./FreshnessBlock";
import { spayNeuterRow, vaccinationRow } from "./medical-labels";
import { RevealFlow } from "./RevealFlow";

/**
 * "Перевірено вручну · на сайті з {year} року" — the calendar year the shelter's
 * record was created, in UTC so the server's time zone can't move it. A count of
 * years floored from the creation date (the earlier wording) read «0 років» for a
 * shelter's whole first year (audit 2026-10-22 #21); a year can't. Deliberately
 * no site name in the sentence: it was a brand string in the catalogue.
 */
function sinceYear(createdAt: Date): number {
  return createdAt.getUTCFullYear();
}

/** The subtitle's own type, shared by the fur row under it rather than a style of its own. */
const SUBTITLE_TEXT = "text-[15px]/[22px] text-rg-ink-2";

interface AnimalDetailScreenProps {
  animal: AnimalDetailView;
  shelter: PublicShelterView;
  /** Resolved by the caller (`cities.list`), same pattern as the gallery's `AnimalCard` — this component never fetches. */
  cityName: string | null;
  /** O-12 (`docs/observations.md`): where "← Усі тварини · м. {city}" actually
   * goes — the gallery filtered to this animal's city, built by the caller
   * through `galleryHref` (`/tvaryny` unfiltered only if the city couldn't
   * be resolved). Every back-navigation on this screen shares it: the
   * header's two links and the "Не зараз" button all mean the same "back to
   * where I was," not three independent destinations. */
  backToGalleryHref: string;
}

/**
 * `docs/design/README.md`'s addendum, frames D1 (1920)/D2 (360) —
 * `Opika Registry Frames.dc.html`, opened directly per
 * `docs/standing-constraints.md`'s "when a mock exists, open the mock
 * file." One DOM tree reflowing by breakpoint (`tablet:`/`desktop:`),
 * matching the gallery's own approach: a Server Component cannot know the
 * client's width, and this page must render correctly with no JS.
 *
 * Real deviations from the mock, all recorded rather than silently
 * resolved — see this phase's PR body for the full account:
 * 1. The subtitle is 3 segments (species · age · size), not the mock's 4
 *    ("Метис · 2 роки · середня · стерилізація не записана"). Two changes,
 *    not one: "Метис" (breed) is dropped because `Animal` has no breed
 *    field at all; the trailing sterilisation clause is dropped because
 *    that fact already gets its own full row in the medical section below
 *    — repeating it in the subtitle risked the two disagreeing the moment
 *    either one changed independently.
 * 2. The medical section renders two rows (vaccination, spayNeuter), not
 *    the mock's three ("Сказ" / "Комплексне щеплення" / "Стерилізація") —
 *    `medical-labels.ts`'s own comment has the full reasoning.
 * 3. ~~The header carries only the back link, not the mock's own
 *    logo+wordmark beside it.~~ **Reversed in Phase T, and the reasoning
 *    that stood here was wrong.** It argued against "repeating the wordmark
 *    a second time on every route" while itself noting that mock D1 shows
 *    both — so the mock had already settled it, and this deviated from it
 *    knowingly. The design critique found the cost: this URL is the one
 *    people paste into Telegram, and it arrived with no brand, no promise
 *    text, and no route to «Про проєкт» (critique E1/B2). The header is now
 *    the shared `SiteHeader`, which carries the wordmark and site nav on
 *    every surface but the deck.
 */
export function AnimalDetailScreen({
  animal,
  shelter,
  cityName,
  backToGalleryHref,
}: AnimalDetailScreenProps) {
  const showDocuments =
    animal.documentReadiness.kind === "tracked" && hasAnyDocumentEvidence(animal.documentReadiness);

  const subtitle = animalSubtitle(animal);
  const locationLine = animalLocationLine(animal, cityName);

  return (
    <div className="font-rg min-h-dvh bg-rg-page">
      <SiteHeader />

      {/*
        The gallery's own visible carrier of the D-2 demo disclosure
        (`tvaryny/page.tsx`) needed the identical fix here — found by the
        reviewer, not caught in the first pass: this route is the one
        `/prytulkam` itself tells a shelter to expect shared into Telegram,
        so a visitor reaching it directly (not via the gallery) saw no demo
        disclosure at all, same gap, same reason (`description`/
        `og:description` are metadata, never page body). See `seo-flags.ts`'s
        own correction comment on `REGISTRY_HAS_NO_REAL_SHELTERS` for the
        full history.
      */}
      {REGISTRY_HAS_NO_REAL_SHELTERS && (
        <div className="p-4 tablet:p-6 desktop:px-8 desktop:max-w-[1200px] desktop:mx-auto">
          <span data-testid="detail-demo-banner" className="text-[13px]/[18px] text-rg-ink-3">
            {uk.demo.bannerNotice}
          </span>
        </div>
      )}

      {/*
        O-8 (`docs/observations.md`): this used to render inside `SiteHeader`
        via its `leading` slot, beside the wordmark, where it read as a site
        navigation item rather than the page's own back-link. Moved below
        the header, above the content, left-aligned — the same "never two
        navigations at once" direction `docs/design/README.md`'s deck-chrome
        section states for the gallery/deck split, applied here to header
        nav vs. page-own navigation instead of gallery nav vs. deck nav.

        `min-h-12` (48), not the `min-h-11` (44) these carried before:
        docs/design/README.md:200 sets 48 as the minimum touch target
        *anywhere*, and calls it a civic-trust metric rather than the WCAG
        floor. Same rule as the header-height fix (critique A2) and found in
        the same pass, one component over.

        Horizontal padding matches the content column immediately below
        (`p-4 tablet:p-6`, desktop's own `desktop:px-8` starts at the same
        breakpoint) so the back-link's left edge lines up with the photo and
        text columns it sits above, not with the header's wider padding.
      */}
      <div className="p-4 tablet:p-6 desktop:px-8 desktop:pt-6 desktop:max-w-[1200px] desktop:mx-auto">
        {/*
          Not prefetched, like every link back to the gallery here: each
          prefetch of a `/tvaryny` URL is charged to the visitor's per-IP
          budget in `proxy.ts`, and in the gallery's overlay these links are
          on screen the moment a card opens (DR1-S4-T3's reason, S4b).
        */}
        <Link
          href={backToGalleryHref}
          prefetch={false}
          data-testid="back-to-list"
          className="min-h-12 inline-flex items-center gap-1.5 rounded-rg-button bg-rg-fill px-4 text-[15px] font-medium text-rg-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px] desktop:hidden"
        >
          {uk.feed.backToList}
        </Link>
        <Link
          href={backToGalleryHref}
          prefetch={false}
          data-testid="back-to-list-desktop"
          className="hidden desktop:inline-flex min-h-12 items-center text-[15px] text-rg-ink-2 rounded-rg-button focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
        >
          {uk.detail.backToListIn.replace("{city}", () => cityName ?? "")}
        </Link>
      </div>

      <div className="desktop:max-w-[1200px] desktop:mx-auto p-4 tablet:p-6 desktop:py-10 desktop:px-8 desktop:flex desktop:gap-10 desktop:items-start">
        {/* Photo column — sticky on desktop, fixed-height strip on mobile. */}
        <div className="desktop:w-[560px] desktop:flex-none desktop:sticky desktop:top-10 flex flex-col gap-2">
          <DetailPhotoGallery photos={animal.photos} altFallback={animal.name} />
        </div>

        {/* Content column */}
        <div className="flex-1 min-w-0 flex flex-col gap-6 mt-4 desktop:mt-0">
          <div className="flex flex-col gap-1">
            {/*
              The save toggle (designer round 1, S7; DR1-D8) sits beside the name, not in the
              "Не зараз" / "Написати" row below: those two are the swipe-equivalent choice this
              page offers, and a bookmark is a lighter, independent "come back to this" mark, not
              a third option in that choice (DR1-D8's own reasoning for keeping it off the deck
              card applies to crowding that specific row, not to the page as a whole). No mock
              frame for this screen exists; this placement is the builder's call, reversible.
            */}
            <div className="flex items-start justify-between gap-3">
              <h1
                data-testid="animal-name"
                className="font-bold text-[34px]/[38px] desktop:text-[44px]/[46px] tracking-[-0.03em] text-rg-ink"
              >
                {animal.name}
              </h1>
              <SaveButton animalId={animal.id} animalName={animal.name} />
            </div>
            <span className={SUBTITLE_TEXT}>{subtitle}</span>
            <CoatFact coatLength={animal.coatLength} className={SUBTITLE_TEXT} />
          </div>

          {/*
            Freshness quote block — a separate card below the name, on both
            mobile and desktop, matching the mock's D1 (1920) and D2 (360)
            frames exactly: neither ever overlays freshness on the photo.
            An earlier version of this screen also overlaid a redundant
            freshness-pips-only cluster on the mobile photo (duplicating
            this block's own pips for no reason, and incidentally occupying
            the mock's actual photo-dot-indicator corner) — removed when
            `DetailPhotoGallery.tsx`'s real dot indicator needed that corner
            for what the mock actually puts there. See O-22,
            `docs/observations.md`, for the full account.
          */}
          {/*
            The pips and the day count only. The shelter's sentence that sat
            under them moved to the shelter page (designer round 1, S6;
            Oleksii's DR1-Q1, verbatim: "the shelter’s freshness sentence
            leaves the deck and animal pages and shows only on the shelter
            page. «Оновлено … тому» stays on every card."). The shelter row
            below links there.
          */}
          <FreshnessBlock freshness={animal.freshness} />

          <div className="flex gap-2">
            {/*
              Real navigation back to the gallery, not an inert button — a
              reviewer finding, caught by checking for an onClick/href
              rather than trusting the visible label: this used to be a
              `<button>` with neither, the same "renders but does nothing"
              failure standing-constraints was written for
              (`/discovery`'s dead swipe gesture). Unlike the deck, this
              page has no "next card" to advance to on decline — "Не
              зараз" here means "not this one, back to the list," so it
              goes to the same place the header's own back link does.
              Not `swipes.record`: that call is deck-scoped today (a
              browsing context this page isn't), and inventing a second
              meaning for it here is a product decision this fix isn't
              making.
            */}
            <Link
              href={backToGalleryHref}
              prefetch={false}
              data-testid="not-now-button"
              className="min-h-14 flex-1 flex items-center justify-center rounded-rg-button bg-rg-fill text-[15px] font-medium text-rg-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
            >
              {uk.actions.notNow}
            </Link>
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
            {/*
              The shelter row is a link to the shelter page (designer round 1,
              S6), where its own words are. Its accessible name is his
              `detail.shelterRowLink`; the visible name and badge stay as they
              were. Not prefetched, like every link here: a prefetch of a
              `/prytulky` URL is charged to the visitor's per-IP budget
              (`proxy.ts`).
            */}
            <Link
              href={shelterPagePath(shelter.id)}
              prefetch={false}
              aria-label={fillTemplate(uk.detail.shelterRowLink, { name: shelter.displayName })}
              className={`flex min-h-target items-center gap-3 rounded-rg-button ${FOCUS_RING}`}
            >
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
                {/*
                  D-2 (seo-flags.ts's own comment on REGISTRY_HAS_NO_REAL_SHELTERS):
                  this badge asserts something true about a *verified* shelter —
                  fictional while the flag is true, which it is on production
                  today. Suppressed rather than shown for a shelter that doesn't
                  exist.
                */}
                {!REGISTRY_HAS_NO_REAL_SHELTERS && (
                  <span className="text-[13px]/[18px] text-rg-ink-3">
                    {fillTemplate(uk.detail.shelterVerifiedYears, {
                      year: String(sinceYear(shelter.createdAt)),
                    })}
                  </span>
                )}
              </div>
            </Link>

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

      <div className="p-4 tablet:p-6 desktop:px-8 desktop:max-w-[1200px] desktop:mx-auto">
        <Footer />
      </div>
    </div>
  );
}

/**
 * Stacked (label above status), not side-by-side: the medical column
 * shares its row with the fixed-width "Де живе" column at desktop
 * (`w-65`), which leaves it real but narrow — a side-by-side layout with
 * "Комплексне щеплення" as the label overlapped its own status text at
 * 1920, caught by looking at the actual rendered screenshot, not assumed
 * from the JSX. Stacking removes the width budget entirely rather than
 * trimming it closer to a number that might collide again with a longer
 * translation later.
 */
function MedicalRowView({ row }: { row: ReturnType<typeof vaccinationRow> }) {
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className={`w-1 h-4 mt-1 rounded-rg-chip flex-none ${row.barClassName}`}
      />
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[15px]/[22px] text-rg-ink">{row.label}</span>
        <span
          className={`text-[13px]/[18px] ${row.barClassName === "bg-rg-registry" ? "font-medium text-rg-registry" : row.barClassName === "bg-rg-ink-3" ? "text-rg-ink-2" : "text-rg-ink-3"}`}
        >
          {row.statusText}
        </span>
      </div>
    </div>
  );
}
