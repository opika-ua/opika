import { uk } from "@opika/i18n";
import { SiteHeader } from "../../features/chrome/SiteHeader";

/**
 * The subject only. The root layout's `title.template` («%s — Opika») appends
 * the product name — spelling it out here too rendered «Для притулків — Opika —
 * Opika», caught by reading the served HTML rather than by any assertion.
 */
export const metadata = { title: uk.forShelters.title };

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
const h = uk.forShelters.headings;
/**
 * `whitespace-pre-line` so a section's own paragraph breaks survive as one
 * catalogue string. The alternative — a key per paragraph — would triple the
 * key count and let a translator silently drop one, which is exactly the shape
 * of loss `messages.test.ts`'s parity check exists to catch and cannot see
 * inside a single string.
 */
const BODY = "text-[17px]/[26px] text-rg-ink whitespace-pre-line";

/**
 * A real `<h2>` under the page's `<h1>`, not a styled paragraph — the whole
 * value of the headings is to a reader who is not reading linearly, and a
 * screen-reader user navigating by heading gets nothing from a bold `<p>`.
 */
function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-bold text-[19px]/[26px] tracking-[-0.02em] text-rg-ink">{heading}</h2>
      {children}
    </section>
  );
}

export default function ForSheltersPage() {
  return (
    <div className="font-rg min-h-dvh bg-rg-page">
      <SiteHeader />

      <div className="max-w-[640px] mx-auto p-4 tablet:p-6 desktop:py-16 flex flex-col gap-6">
        <h1 className="font-bold text-[34px]/[38px] desktop:text-[44px]/[46px] tracking-[-0.035em] text-rg-ink">
          {uk.forShelters.title}
        </h1>

        <Section heading={h.whatThisIs}>
          <p className="text-[19px]/[28px] text-rg-ink">{uk.forShelters.whatThisIs}</p>
        </Section>
        <Section heading={h.cost}>
          <p className={BODY}>{uk.forShelters.cost}</p>
        </Section>
        <Section heading={h.whatHappensToAnimals}>
          <p className={BODY}>{uk.forShelters.whatHappensToAnimals}</p>
        </Section>
        <Section heading={h.whoContactsWhom}>
          <p className={BODY}>{uk.forShelters.whoContactsWhom}</p>
          <p className={BODY}>{uk.forShelters.noObligation}</p>
        </Section>
        <Section heading={h.money}>
          <p className={BODY}>{uk.forShelters.money}</p>
        </Section>
        <Section heading={h.verification}>
          <p className={BODY}>{uk.forShelters.verification}</p>
          <p className={BODY}>{uk.forShelters.verificationOpenToVolunteers}</p>
        </Section>
        {/*
          §6 ends on «Ваш другий номер телефону — не рекомендація» — the only
          sentence on the page that anticipates someone gaming the process. It
          earns its place by proving the verification is enforced rather than
          merely described, but it means §6 closes on fraud. §7 opening on
          «потрібно небагато» is what recovers the tone, in one line. Keep
          these two adjacent.
        */}
        <Section heading={h.whatToPrepare}>
          <p className={BODY}>{uk.forShelters.whatToPrepare}</p>
        </Section>

        {/*
          §8 is the paragraph the argument document marks as needing the most
          care — no shelter has been asked for a freshness sentence before, so
          the reason has to land or the request reads as strange. Given the
          page's one piece of emphasis for that reason, using the same
          `bg-rg-fill` block the freshness display itself uses, so the
          explanation and the thing it explains share a surface.
        */}
        <Section heading={h.whyThatSentence}>
          <div
            data-testid="why-that-sentence"
            className="bg-rg-fill rounded-rg-button p-4 flex flex-col gap-2"
          >
            <p className={BODY}>{uk.forShelters.whyThatSentence}</p>
          </div>
        </Section>
        <Section heading={h.whenAnimalFindsHome}>
          <p className={BODY}>{uk.forShelters.whenAnimalFindsHome}</p>
        </Section>
        {/*
          The largest unspoken objection on the page, and previously unanswered
          in eleven sections: what happens if they change their mind. It is the
          first question anyone asks before handing their data to a stranger
          with a website, and the answer is one of the strongest things the
          project can say.
        */}
        <Section heading={h.howToLeave}>
          <p className={BODY}>{uk.forShelters.howToLeave}</p>
        </Section>
        <Section heading={h.whoIsBehindThis}>
          <p className={BODY}>{uk.forShelters.whoIsBehindThis}</p>
        </Section>

        {/*
          `hello@opika.org.ua` is live and receives mail (Cloudflare Email
          Routing, delivery tested 2026-09-02) — the same address
          `app/pro/page.tsx` renders. It mattered more here than there: a
          shelter is *sent* to this page rather than stumbling on it, and a
          page whose entire purpose is "write to us" is worse than absent if
          the address bounces. That gate is satisfied, not outstanding.
        */}
        <Section heading={h.howToStart}>
          <p className={BODY}>
            {uk.forShelters.howToStart.replace("{contact}", "hello@opika.org.ua")}
          </p>
        </Section>
      </div>
    </div>
  );
}
