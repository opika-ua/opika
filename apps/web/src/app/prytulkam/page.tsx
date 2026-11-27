import { fillTemplate, uk } from "@opika/i18n";
import type { Metadata } from "next";
import { OPERATOR_CONTACT, WORDMARK } from "../../brand";
import { ContentPageLayout } from "../../features/chrome/ContentPageLayout";
import { kabinetSessionCookiePresent } from "../../features/chrome/kabinet-signed-in";
import { KabinetEntryLink } from "../../features/kabinet/KabinetEntryLink";
import { isSelfRegistrationEnabled } from "../../features/registration/flag";
import { RegistrationSection } from "../../features/registration/RegistrationSection";
import { RegistrationSignedIn } from "../../features/registration/RegistrationSignedIn";
import { registrationViewerOf } from "../../features/registration/registration-viewer";
import { SelfRegistrationPage } from "../../features/registration/SelfRegistrationPage";
import { seoMetadata, withSite } from "../../seo/page-metadata";
import { Heading } from "../../ui/Heading";
import { Panel } from "../../ui/Panel";
import { Text } from "../../ui/Text";

const WHAT_THIS_IS = fillTemplate(uk.forShelters.whatThisIs, { site: WORDMARK });
const WHO_CONTACTS_WHOM = fillTemplate(uk.forShelters.whoContactsWhom, { site: WORDMARK });
const WHO_IS_BEHIND_THIS = fillTemplate(uk.forShelters.whoIsBehindThis, { site: WORDMARK });

/**
 * SEO handoff B2's title and description, the same in every preview; this is the link Oleksii sends
 * to shelters, so it never takes the demo disclosure. With self-registration on, the description
 * names the 3-minute registration (`seo.forShelters.descriptionSelfRegistration`).
 */
export function forSheltersMetadata(selfRegistration: boolean): Metadata {
  const f = uk.seo.forShelters;
  return seoMetadata(
    withSite(f.title),
    withSite(selfRegistration ? f.descriptionSelfRegistration : f.description),
    "/prytulkam",
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return forSheltersMetadata(isSelfRegistrationEnabled());
}

/** A catalogue string's paragraph break (`Body` renders it with `whitespace-pre-line`). */
const PARAGRAPH = "\n\n";

/** A1's sentence in §7 (commitment #6), the paragraph self-registration replaces. */
const ACCESS_SENTENCE =
  "Доступ до кабінету я надсилаю сам – листом на адресу, яку ви мені вкажете.";

/**
 * §7 as the page shows it: with self-registration on, A1's paragraph becomes
 * `registration.whatToPrepareAccess` and nothing else moves. Throws if A1 is not a paragraph of
 * its own, so a reworded §7 can't silently keep the operator-only sentence.
 */
export function whatToPrepareFor(selfRegistration: boolean): string {
  if (!selfRegistration) return uk.forShelters.whatToPrepare;
  const paragraphs = uk.forShelters.whatToPrepare.split(PARAGRAPH);
  if (!paragraphs.includes(ACCESS_SENTENCE)) {
    throw new Error("forShelters.whatToPrepare lost A1's paragraph");
  }
  return paragraphs
    .map((paragraph) =>
      paragraph === ACCESS_SENTENCE ? uk.registration.whatToPrepareAccess : paragraph,
    )
    .join(PARAGRAPH);
}

/** §11, flag off only: with the flag on the form replaces «Як почати» (§1a). */
const HOW_TO_START = fillTemplate(uk.forShelters.howToStart, { contact: OPERATOR_CONTACT.email });

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
  const selfRegistration = isSelfRegistrationEnabled();
  // A2–A4: someone signed in gets their way in instead of a second registration.
  const viewer = selfRegistration
    ? await registrationViewerOf(kabinetSignedIn)
    : ({ kind: "anonymous" } as const);
  return renderForSheltersPage(kabinetSignedIn, {
    selfRegistration,
    registrationCard:
      viewer.kind === "anonymous" ? undefined : <RegistrationSignedIn viewer={viewer} />,
  });
}

/** The page body; exported so `page.test.tsx` can render it without a real request scope. */
export function renderForSheltersPage(
  kabinetSignedIn: boolean,
  {
    selfRegistration,
    registrationCard,
  }: { selfRegistration: boolean; registrationCard?: React.ReactNode } = {
    selfRegistration: false,
  },
) {
  if (selfRegistration) {
    return (
      <SelfRegistrationPage
        kabinetSignedIn={kabinetSignedIn}
        card={registrationCard ?? <RegistrationSection />}
        whatToPrepare={whatToPrepareFor(true)}
      />
    );
  }
  return (
    <ContentPageLayout
      kabinetSignedIn={kabinetSignedIn}
      current="forShelters"
      title={uk.forShelters.title}
    >
      {/*
        PW-2, his scope item 1: «Увійти в кабінет» → /kabinet/vkhid. Under the title, so a shelter
        already in the kabinet, sent here again, finds the way in without reading the page. A plain
        <a> (a full document load), never next/link: the kabinet gets its own headers.
      */}
      <KabinetEntryLink to="signIn" variant="secondary" className="self-start">
        {uk.forShelters.signInLink}
      </KabinetEntryLink>

      <Section heading={h.whatThisIs}>
        <Body>{WHAT_THIS_IS}</Body>
      </Section>
      <Section heading={h.cost}>
        <Body>{uk.forShelters.cost}</Body>
      </Section>
      <Section heading={h.whatHappensToAnimals}>
        <Body>{uk.forShelters.whatHappensToAnimals}</Body>
      </Section>
      <Section heading={h.whoContactsWhom}>
        <Body>{WHO_CONTACTS_WHOM}</Body>
        <Body>{uk.forShelters.noObligation}</Body>
      </Section>
      <Section heading={h.money}>
        <Body>{uk.forShelters.money}</Body>
      </Section>
      <Section heading={h.verification}>
        <Body>{uk.forShelters.verification}</Body>
        <Body>{uk.forShelters.verificationOpenToVolunteers}</Body>
      </Section>
      {/* §6 closes on fraud; §7's practical list right after it recovers the tone. Keep them adjacent. */}
      <Section heading={h.whatToPrepare}>
        <Body>{whatToPrepareFor(false)}</Body>
      </Section>

      {/*
          §8 is the paragraph the argument document marks as needing the most
          care - the reason for saying how often cards are updated has to land
          or the request reads as strange. Given the
          page's one piece of emphasis for that reason, using the same
          sunken Panel the freshness display itself uses, so the
          explanation and the thing it explains share a surface.
        */}
      <Section heading={h.whyHowOften}>
        <Panel tone="sunken" className="flex flex-col gap-2">
          <Body>{uk.forShelters.whyHowOften}</Body>
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
        <Body>{WHO_IS_BEHIND_THIS}</Body>
      </Section>

      {/*
          `OPERATOR_CONTACT.email` is live (Cloudflare Email Routing, tested 2026-09-02): a
          shelter is sent to this page, so a bouncing address would be worse than none.
        */}
      <Section heading={h.howToStart}>
        <Body>{HOW_TO_START}</Body>
      </Section>
    </ContentPageLayout>
  );
}
