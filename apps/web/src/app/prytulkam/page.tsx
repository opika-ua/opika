import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { WORDMARK } from "../../brand";
import { ContentPageLayout } from "../../features/chrome/ContentPageLayout";
import { kabinetSessionCookiePresent } from "../../features/chrome/kabinet-signed-in";
import { SIGN_IN_PAGE_PATH } from "../../features/kabinet/routes";
import { LinkButton } from "../../ui/Button";
import { Heading } from "../../ui/Heading";
import { Panel } from "../../ui/Panel";
import { Text } from "../../ui/Text";

/**
 * The subject. The root layout's `title.template` («%s - Opika») appends
 * the product name - spelling it out here too rendered «Для притулків - Opika -
 * Opika», caught by reading the served HTML rather than by any assertion.
 *
 * `description`/`openGraph` are an explicit override (Option B, 2026-09-06,
 * see `docs/observations.md`) - without one this page would inherit the
 * root layout's default, which swaps to the demo-data disclosure while
 * `REGISTRY_HAS_NO_REAL_SHELTERS`. This is the link Oleksii actually sends
 * to shelters, and that disclosure was never meant to reach it specifically
 * - a scope decided, not an oversight. `uk.forShelters.whatThisIs` is the
 * page's own existing, already-shipped §1 sentence (the first paragraph
 * under the `<h1>`) - used verbatim, not trimmed, and not a new key. A full
 * `openGraph` object, not just `description` - Next replaces a parent's
 * `openGraph` wholesale rather than deep-merging it once a child sets any
 * part of it (same gotcha `/tvaryny/[animalId]/page.tsx` already has its
 * own note on). No `title` inside `openGraph`, deliberately: unlike the
 * nested object as a whole, Next resolves a missing `openGraph.title` from
 * the page's own already-templated `title` («Для притулків - Opika»),
 * exactly the string above - setting it explicitly here would instead
 * freeze it at the untemplated subject, dropping the brand name from the
 * one link-preview headline this page's own comment already flags as
 * having failed the same way once (PR #53 review, caught by rebuilding and
 * diffing the served `og:title`, not by inspection).
 */
export const metadata: Metadata = {
  title: uk.forShelters.title,
  description: uk.forShelters.whatThisIs,
  alternates: { canonical: "/prytulkam" },
  openGraph: {
    type: "website",
    siteName: WORDMARK,
    locale: "uk_UA",
    description: uk.forShelters.whatThisIs,
  },
};

/**
 * «Для притулків» - Phase T, closing critique finding E3.
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
 * order a volunteer's questions actually arrive in - notably cost second,
 * because it is what they are bracing for and every later sentence reads
 * differently once it is answered. That document is the spec for what each
 * paragraph must establish and what it must not claim; this file is only its
 * layout.
 *
 * ## ⚠ The copy is not written
 *
 * Every string below is a `COPY_PENDING` placeholder. The Ukrainian is
 * written by the maintainer, *from* the argument document's structure rather
 * than translated from its English - sentence-by-sentence translation is how
 * calques get in, and the copy critique (D3) already found one construction
 * in the live catalogue that reads translated. `prytulkam.test.tsx` reports
 * how many remain, so the count is visible rather than discovered on the
 * live page.
 *
 * ## No mock exists
 *
 * `docs/design/README.md` has no frame and no prose for a shelter-facing
 * page - this is the first surface in the project the design handoff does not
 * describe at all. Composed rather than invented: the page shell, width,
 * type scale and spacing are «Про проєкт»'s (`app/pro/page.tsx`), which is
 * itself the design's own established treatment for a static text page; the
 * one emphasised block reuses the sunken Panel surface the freshness block
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
 * catalogue string. The alternative - a key per paragraph - would triple the
 * key count and let a translator silently drop one, which is exactly the shape
 * of loss `messages.test.ts`'s parity check exists to catch and cannot see
 * inside a single string.
 */
function Body({ children }: { children: React.ReactNode }) {
  return (
    <Text look="lead" className="whitespace-pre-line text-ink-2">
      {children}
    </Text>
  );
}

/**
 * A real `<h2>` under the page's `<h1>`, not a styled paragraph - the whole
 * value of the headings is to a reader who is not reading linearly, and a
 * screen-reader user navigating by heading gets nothing from a bold `<p>`.
 */
function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <Heading level={2} look="title">
        {heading}
      </Heading>
      {children}
    </section>
  );
}

/**
 * Designer feedback batch D (2026-10-23): same trade as `/pro`'s own
 * comment on this - reading the kabinet cookie here makes this page
 * `force-dynamic` too, so the role-aware header doesn't flip-flop between
 * this page and the rest of the site for a signed-in admin. Split into
 * this thin async wrapper and `renderForSheltersPage` below for the same
 * reason `/pro` is: `cookies()` throws outside a real request scope.
 */
export const dynamic = "force-dynamic";

export default async function ForSheltersPage() {
  const kabinetSignedIn = await kabinetSessionCookiePresent();
  return renderForSheltersPage(kabinetSignedIn);
}

/** The page body; exported so `page.test.tsx` can render it without a real request scope. */
export function renderForSheltersPage(kabinetSignedIn: boolean) {
  return (
    <ContentPageLayout
      kabinetSignedIn={kabinetSignedIn}
      currentPage="prytulkam"
      title={uk.forShelters.title}
    >
      {/*
        PW-2, his scope item 1: «Увійти в кабінет» → /kabinet/vkhid. Under the title, so a shelter
        already in the kabinet, sent here again, finds the way in without reading the page.
      */}
      <LinkButton href={SIGN_IN_PAGE_PATH} variant="secondary" className="self-start">
        {uk.forShelters.signInLink}
      </LinkButton>

      <Section heading={h.whatThisIs}>
        <Body>{uk.forShelters.whatThisIs}</Body>
      </Section>
      <Section heading={h.cost}>
        <Body>{uk.forShelters.cost}</Body>
      </Section>
      <Section heading={h.whatHappensToAnimals}>
        <Body>{uk.forShelters.whatHappensToAnimals}</Body>
      </Section>
      <Section heading={h.whoContactsWhom}>
        <Body>{uk.forShelters.whoContactsWhom}</Body>
        <Body>{uk.forShelters.noObligation}</Body>
      </Section>
      <Section heading={h.money}>
        <Body>{uk.forShelters.money}</Body>
      </Section>
      <Section heading={h.verification}>
        <Body>{uk.forShelters.verification}</Body>
        <Body>{uk.forShelters.verificationOpenToVolunteers}</Body>
      </Section>
      {/*
          §6 ends on «Ваш другий номер телефону - не рекомендація» - the only
          sentence on the page that anticipates someone gaming the process. It
          earns its place by proving the verification is enforced rather than
          merely described, but it means §6 closes on fraud. §7 opening on
          «потрібно небагато» is what recovers the tone, in one line. Keep
          these two adjacent.
        */}
      <Section heading={h.whatToPrepare}>
        <Body>{uk.forShelters.whatToPrepare}</Body>
      </Section>

      {/*
          §8 is the paragraph the argument document marks as needing the most
          care - no shelter has been asked for a freshness sentence before, so
          the reason has to land or the request reads as strange. Given the
          page's one piece of emphasis for that reason, using the same
          sunken Panel the freshness display itself uses, so the
          explanation and the thing it explains share a surface.
        */}
      <Section heading={h.whyThatSentence}>
        <Panel tone="sunken" className="flex flex-col gap-2">
          <Body>{uk.forShelters.whyThatSentence}</Body>
        </Panel>
      </Section>
      <Section heading={h.whenAnimalFindsHome}>
        <Body>{uk.forShelters.whenAnimalFindsHome}</Body>
      </Section>
      {/*
          The largest unspoken objection on the page, and previously unanswered
          in eleven sections: what happens if they change their mind. It is the
          first question anyone asks before handing their data to a stranger
          with a website, and the answer is one of the strongest things the
          project can say.
        */}
      <Section heading={h.howToLeave}>
        <Body>{uk.forShelters.howToLeave}</Body>
      </Section>
      <Section heading={h.whoIsBehindThis}>
        <Body>{uk.forShelters.whoIsBehindThis}</Body>
      </Section>

      {/*
          `hello@opika.org.ua` is live and receives mail (Cloudflare Email
          Routing, delivery tested 2026-09-02) - the same address
          `app/pro/page.tsx` renders. It mattered more here than there: a
          shelter is *sent* to this page rather than stumbling on it, and a
          page whose entire purpose is "write to us" is worse than absent if
          the address bounces. That gate is satisfied, not outstanding.
        */}
      <Section heading={h.howToStart}>
        <Body>{uk.forShelters.howToStart.replace("{contact}", "hello@opika.org.ua")}</Body>
      </Section>
    </ContentPageLayout>
  );
}
