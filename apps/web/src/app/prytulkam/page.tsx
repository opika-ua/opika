import { uk } from "@opika/i18n";
import { SiteHeader } from "../../features/chrome/SiteHeader";

export const metadata = { title: `${uk.forShelters.title} — Opika` };

/**
 * «Для притулків» — Phase T, closing critique finding E3.
 *
 * The first surface in this project written for shelters rather than
 * adopters, and the page an outreach message links to. Before it, a volunteer
 * who visited found nothing addressed to them and no description of the one
 * thing that differentiates this project; the only contact surface anywhere
 * was a developer mailto on «Про проєкт», itself reachable from exactly one
 * link at the bottom of one page.
 *
 * ## Structure, and why it is this structure
 *
 * Section order is fixed by `docs/prytulkam-argument.md` and follows the
 * order a volunteer's questions actually arrive in — notably cost second,
 * because it is what they are bracing for and every later sentence reads
 * differently once it is answered. That document is the spec for what each
 * paragraph must establish and what it must not claim; this file is only its
 * layout.
 *
 * ## ⚠ The copy is not written
 *
 * Every string below is a `COPY_PENDING` placeholder. The Ukrainian is
 * written by the maintainer, *from* the argument document's structure rather
 * than translated from its English — sentence-by-sentence translation is how
 * calques get in, and the copy critique (D3) already found one construction
 * in the live catalogue that reads translated. `prytulkam.test.tsx` reports
 * how many remain, so the count is visible rather than discovered on the
 * live page.
 *
 * ## No mock exists
 *
 * `docs/design/README.md` has no frame and no prose for a shelter-facing
 * page — this is the first surface in the project the design handoff does not
 * describe at all. Composed rather than invented: the page shell, width,
 * type scale and spacing are «Про проєкт»'s (`app/pro/page.tsx`), which is
 * itself the design's own established treatment for a static text page; the
 * one emphasised block reuses the `bg-rg-fill` surface the freshness block
 * and filter chips already use. No new visual idiom is introduced here.
 *
 * Section headings are deliberately absent rather than invented: headings are
 * copy, and inventing Ukrainian ones would be exactly the composition this
 * page is supposed to leave to a native speaker. If the finished text wants
 * them, they are keys to add, not a layout change.
 */
export default function ForSheltersPage() {
  return (
    <div className="font-rg min-h-dvh bg-rg-page">
      <SiteHeader />

      <div className="max-w-[640px] mx-auto p-4 tablet:p-6 desktop:py-16 flex flex-col gap-6">
        <h1 className="font-bold text-[34px]/[38px] desktop:text-[44px]/[46px] tracking-[-0.035em] text-rg-ink">
          {uk.forShelters.title}
        </h1>

        <p className="text-[19px]/[28px] text-rg-ink">{uk.forShelters.whatThisIs}</p>
        <p className="text-[17px]/[26px] text-rg-ink">{uk.forShelters.cost}</p>
        <p className="text-[17px]/[26px] text-rg-ink">{uk.forShelters.whatHappensToAnimals}</p>
        <p className="text-[17px]/[26px] text-rg-ink">{uk.forShelters.whoContactsWhom}</p>
        <p className="text-[17px]/[26px] text-rg-ink">{uk.forShelters.noObligation}</p>
        <p className="text-[17px]/[26px] text-rg-ink">{uk.forShelters.money}</p>
        <p className="text-[17px]/[26px] text-rg-ink">{uk.forShelters.verification}</p>
        <p className="text-[17px]/[26px] text-rg-ink">
          {uk.forShelters.verificationOpenToVolunteers}
        </p>
        <p className="text-[17px]/[26px] text-rg-ink">{uk.forShelters.whatToPrepare}</p>

        {/*
          §8 is the paragraph the argument document marks as needing the most
          care — no shelter has been asked for a freshness sentence before, so
          the reason has to land or the request reads as strange. Given the
          page's one piece of emphasis for that reason, using the same
          `bg-rg-fill` block the freshness display itself uses, so the
          explanation and the thing it explains share a surface.
        */}
        <div
          data-testid="why-that-sentence"
          className="bg-rg-fill rounded-rg-button p-4 flex flex-col gap-2"
        >
          <p className="text-[17px]/[26px] text-rg-ink">{uk.forShelters.whyThatSentence}</p>
        </div>

        <p className="text-[17px]/[26px] text-rg-ink">{uk.forShelters.whenAnimalFindsHome}</p>
        <p className="text-[17px]/[26px] text-rg-ink">{uk.forShelters.whoIsBehindThis}</p>

        {/*
          `hello@opika.org.ua` is live and receives mail (Cloudflare Email
          Routing, delivery tested 2026-09-02) — the same address
          `app/pro/page.tsx` renders. It mattered more here than there: a
          shelter is *sent* to this page rather than stumbling on it, and a
          page whose entire purpose is "write to us" is worse than absent if
          the address bounces. That gate is satisfied, not outstanding.
        */}
        <p className="text-[17px]/[26px] text-rg-ink pt-2">
          {uk.forShelters.howToStart.replace("{contact}", "hello@opika.org.ua")}
        </p>
      </div>
    </div>
  );
}
