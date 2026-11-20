import { fillTemplate, uk } from "@opika/i18n";
import type { ReactNode } from "react";
import { WORDMARK } from "../../brand";
import { Card } from "../../ui/Card";
import { Container } from "../../ui/Container";
import { Heading } from "../../ui/Heading";
import { Icon } from "../../ui/Icon";
import { Panel } from "../../ui/Panel";
import { Text } from "../../ui/Text";
import { SiteFooter } from "../chrome/SiteFooter";
import { SiteHeader } from "../chrome/SiteHeader";
import { OpenAnchoredDetails } from "./OpenAnchoredDetails";

const WHAT_THIS_IS = fillTemplate(uk.forShelters.whatThisIs, { site: WORDMARK });
const WHO_CONTACTS_WHOM = fillTemplate(uk.forShelters.whoContactsWhom, { site: WORDMARK });
const WHO_IS_BEHIND_THIS = fillTemplate(uk.forShelters.whoIsBehindThis, { site: WORDMARK });
/** The hero's lead from tablet up; a phone gets the one short line. */
const LEAD = fillTemplate(uk.registration.page.lead, { site: WORDMARK });

/** The questions' anchors: the hero's jump links and the consent line (`#pravyla`). */
export const QUESTION_ANCHORS = {
  verification: "perevirka",
  rules: "pravyla",
  questions: "pytannia",
} as const;

const h = uk.forShelters.headings;
const OVERLINE = "text-caption font-bold uppercase tracking-wider text-ink-2";

/**
 * /prytulkam with self-registration on (R2): the hero (pitch and card side by side on desktop; H1,
 * lead, card on a phone), «Як це працює», then every existing section, verbatim, as closed
 * questions in four groups.
 */
export function SelfRegistrationPage({
  kabinetSignedIn,
  card,
  whatToPrepare,
}: {
  kabinetSignedIn: boolean;
  card: ReactNode;
  /** §7 with A1's sentence swapped (`whatToPrepareFor(true)`). */
  whatToPrepare: string;
}) {
  const p = uk.registration.page;
  return (
    <div className="flex min-h-dvh flex-col bg-page">
      <SiteHeader kabinetSignedIn={kabinetSignedIn} current="forShelters" />
      <OpenAnchoredDetails />
      <Container as="main" className="flex flex-col gap-12 py-8 desktop:gap-16 desktop:py-14">
        <div className="grid grid-cols-1 gap-8 desktop:grid-cols-12 desktop:items-start desktop:gap-x-6">
          <div className="flex flex-col gap-5 desktop:col-span-5 desktop:pt-6">
            <Heading level={1} look="display-l" className="desktop:text-display-xl">
              {uk.forShelters.title}
            </Heading>
            <Text look="lead" className="text-ink-2 tablet:hidden">
              {p.leadShort}
            </Text>
            <Text look="lead" className="hidden text-ink-2 tablet:block">
              {LEAD}
            </Text>
            <ul className="hidden flex-col gap-3 desktop:flex">
              {p.benefits.map((benefit) => (
                <li key={benefit} className="flex items-baseline gap-3 text-body-l text-ink">
                  <span aria-hidden="true" className="size-3 shrink-0 bg-accent" />
                  {benefit}
                </li>
              ))}
            </ul>
            <p className="hidden flex-wrap items-center gap-x-2 text-body text-ink-2 desktop:flex">
              {(["verification", "rules", "questions"] as const).map((key, index) => (
                <span key={key} className="inline-flex items-center gap-x-2">
                  {index > 0 ? <span aria-hidden="true">·</span> : null}
                  <a
                    href={`#${QUESTION_ANCHORS[key]}`}
                    className="inline-flex min-h-target items-center text-ink underline underline-offset-4 focus-ring"
                  >
                    {`${p.jump[key]} ↓`}
                  </a>
                </span>
              ))}
            </p>
          </div>
          <div className="min-w-0 desktop:col-span-6 desktop:col-start-7">{card}</div>
        </div>
        <HowItWorks />
        <Questions whatToPrepare={whatToPrepare} />
      </Container>
      <SiteFooter />
    </div>
  );
}

function HowItWorks() {
  const steps = uk.registration.page.howItWorks;
  return (
    <section aria-labelledby="yak-tse-pratsiuie" className="flex flex-col gap-4">
      <h2 id="yak-tse-pratsiuie" className={OVERLINE}>
        {steps.title}
      </h2>
      <ol className="grid grid-cols-1 gap-4 tablet:grid-cols-3">
        {steps.steps.map((step, index) => (
          <li key={step.title}>
            <Card tone="outline" className="flex h-full flex-col gap-2 p-6">
              <span aria-hidden="true" className="font-display text-display-m text-accent">
                {index + 1}
              </span>
              <Heading level={3} look="body-l">
                {step.title}
              </Heading>
              <Text className="text-ink-2">{step.body}</Text>
            </Card>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A question's answer: the section's catalogue text as it is, paragraph breaks kept. */
function Answer({ children }: { children: ReactNode }) {
  return <Text className="whitespace-pre-line text-ink-2">{children}</Text>;
}

/** One question, closed by default; its text is in the HTML either way (SEO, no JS). */
function Question({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <details id={id} className="group scroll-mt-24">
      <summary className="flex min-h-target cursor-pointer list-none items-center justify-between gap-4 py-3 text-label text-ink focus-ring [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <Icon name="plus" className="shrink-0 group-open:hidden" />
        <Icon name="minus" className="hidden shrink-0 group-open:block" />
      </summary>
      <div className="flex flex-col gap-3 pb-4">{children}</div>
    </details>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card tone="outline" className="flex flex-col p-6">
      <Heading level={3} look="body-l" className="pb-3">
        {title}
      </Heading>
      <div className="flex flex-col divide-y divide-line border-line border-t">{children}</div>
    </Card>
  );
}

/** §1a: the existing sections, verbatim, grouped; «Як почати» is gone (the form replaces it). */
function Questions({ whatToPrepare }: { whatToPrepare: string }) {
  const q = uk.registration.page.questions;
  const r = uk.registration.rules;
  return (
    <section
      id={QUESTION_ANCHORS.questions}
      aria-labelledby="pytannia-title"
      className="flex scroll-mt-24 flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <p className={OVERLINE}>{q.overline}</p>
        <Heading level={2} look="display-m" id="pytannia-title">
          {q.title}
        </Heading>
      </div>
      <div className="grid grid-cols-1 gap-4 desktop:grid-cols-2 desktop:items-start">
        <Group title={q.groups.moneyContacts}>
          <Question title={h.cost}>
            <Answer>{uk.forShelters.cost}</Answer>
          </Question>
          <Question title={h.whoContactsWhom}>
            <Answer>{WHO_CONTACTS_WHOM}</Answer>
            <Answer>{uk.forShelters.noObligation}</Answer>
          </Question>
          <Question title={h.money}>
            <Answer>{uk.forShelters.money}</Answer>
          </Question>
        </Group>
        <Group title={q.groups.verificationRules}>
          <Question id={QUESTION_ANCHORS.verification} title={h.verification}>
            <Answer>{uk.forShelters.verification}</Answer>
            <Answer>{uk.forShelters.verificationOpenToVolunteers}</Answer>
          </Question>
          <Question title={h.whatToPrepare}>
            <Answer>{whatToPrepare}</Answer>
          </Question>
          <Question id={QUESTION_ANCHORS.rules} title={r.title}>
            <ul className="flex list-disc flex-col gap-2 pl-6">
              {r.items.map((item) => (
                <li key={item}>
                  <Text as="span" className="text-ink-2">
                    {item}
                  </Text>
                </li>
              ))}
            </ul>
            <Answer>{r.enforcement}</Answer>
          </Question>
        </Group>
        <Group title={q.groups.animalCards}>
          <Question title={h.whatHappensToAnimals}>
            <Answer>{uk.forShelters.whatHappensToAnimals}</Answer>
          </Question>
          <Question title={h.whyHowOften}>
            <Panel tone="sunken" className="flex flex-col gap-2">
              <Answer>{uk.forShelters.whyHowOften}</Answer>
            </Panel>
          </Question>
          <Question title={h.whenAnimalFindsHome}>
            <Answer>{uk.forShelters.whenAnimalFindsHome}</Answer>
          </Question>
        </Group>
        <Group title={q.groups.aboutProject}>
          <Question title={h.whatThisIs}>
            <Answer>{WHAT_THIS_IS}</Answer>
          </Question>
          <Question title={h.whoIsBehindThis}>
            <Answer>{WHO_IS_BEHIND_THIS}</Answer>
          </Question>
          <Question title={h.howToLeave}>
            <Answer>{uk.forShelters.howToLeave}</Answer>
          </Question>
        </Group>
      </div>
    </section>
  );
}
