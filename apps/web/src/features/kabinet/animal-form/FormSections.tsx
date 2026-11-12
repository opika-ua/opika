"use client";

import "../../../zod-client-config";
import type { AgeEstimateInput, KabinetAnimalView } from "@opika/contracts";
import {
  AGE_DATE_MAX_YEARS_BACK,
  type AgeBucket,
  type AgeEstimate,
  ANIMAL_DESCRIPTION_MAX_CHARACTERS,
  ANIMAL_NAME_MAX_CHARACTERS,
  type AnimalSex,
  type AnimalSpecies,
  ageBucketOf,
  ageSpanOf,
  COAT_COLOUR_CUSTOM_MAX_CHARACTERS,
  COAT_COLOURS,
  COAT_LENGTHS,
  type CoatColour,
  type CoatLength,
  calendarDateYearsBefore,
  characterCount,
  DECLARED_AGE_RANGES,
  declaredAtOfCalendarDate,
  declaredRangeSpan,
  instantOfCalendarDate,
  isAgeEstimateUncertain,
  kyivCalendarDateOf,
  MEDICAL_NOTES_MAX_CHARACTERS,
  type MedicalState,
  type PublishGap,
  SIZE_BUCKETS,
  type SizeBucket,
  TEMPERAMENT_CUSTOM_MAX_CHARACTERS,
  TEMPERAMENT_TRAITS,
  type TemperamentTrait,
  type VaccinationStatus,
} from "@opika/domain";
import {
  ageSpanLabel,
  ageWordFor,
  colourFilterLabel,
  fillTemplate,
  temperamentLabelFor,
  uk,
} from "@opika/i18n";
import { Chip } from "../../../ui/Chip";
import { DateField } from "../../../ui/DateField";
import { type Segment, SegmentedControl, TextArea, TextField } from "../../../ui/form";
import { ChipGroup } from "../../../ui/groups";
import { Heading } from "../../../ui/Heading";
import { Panel } from "../../../ui/Panel";
import { Text } from "../../../ui/Text";
import { MEDICAL_VALUE_TEXT, rowSource, vaccinationRow } from "../../animal-detail/medical-labels";
import { countPhrase } from "../shared/count-phrase";
import { DATE_FIELD_LABELS } from "../shared/kabinet-date";
import type { AgeMode, FieldProblem, FormValues } from "./form-values";
import { ageInputOf } from "./form-values";
import { bucketRange, dateEndingSentenceOf, sizeHint } from "./labels";

/**
 * The form's fields, grouped the way a volunteer thinks about the animal (kabinet redesign
 * Phase 2 PR 3): «Основне» (what makes a card publishable), «Про тварину» (how to describe it),
 * «Здоровʼя». Each group is the body of a `FormSection`; the photos have their own file.
 * Presentational: the form owns the values and passes a setter; a group only says what changed.
 * Built from the kit: few choices (up to four) are a segmented control, many (the ten
 * temperaments, the twelve colours) are chips that wrap, so an optional field never costs a
 * screen of 48px rows.
 */

const t = uk.kabinet.animalForm;
const integer = new Intl.NumberFormat("uk");

/** «· потрібно для публікації» after a label, while its field is empty (the caller decides when). */
export const withTag = (label: string, tagged: boolean) =>
  tagged ? (
    <>
      {label}
      <RequiredTag />
    </>
  ) : (
    label
  );

export function RequiredTag() {
  return <span className="text-caption text-ink-2"> · {t.publish.requiredTag}</span>;
}

export type SectionProps = {
  values: FormValues;
  set: (change: Partial<FormValues>) => void;
  /** The problems to show now (after a field is left, or a save is tried). */
  problems: readonly FieldProblem[];
  disabled: boolean;
  /** Publish gaps whose label wears the «потрібно для публікації» tag (empty on a card already published). */
  required?: readonly PublishGap["kind"][];
};

/** A problem's message, in his words; also what the error summary lists. */
export const problemText = (
  problems: readonly FieldProblem[],
  field: FieldProblem["field"],
): string | null => {
  const problem = problems.find((p) => p.field === field);
  if (problem === undefined) return null;
  switch (problem.key) {
    case "nameRequired":
      return t.validation.nameRequired;
    case "nameBrace":
      return t.validation.nameBrace;
    case "nameTooLong":
      return fillTemplate(t.validation.nameTooLong, {
        max: integer.format(ANIMAL_NAME_MAX_CHARACTERS),
      });
    case "speciesRequired":
      return t.validation.speciesRequired;
    case "descriptionTooLong":
      return fillTemplate(t.validation.descriptionTooLong, {
        max: integer.format(ANIMAL_DESCRIPTION_MAX_CHARACTERS),
      });
    case "medicalNotesTooLong":
      return fillTemplate(t.validation.medicalNotesTooLong, {
        max: integer.format(MEDICAL_NOTES_MAX_CHARACTERS),
      });
    case "requiredOnceListed":
      return t.errors.requiredOnceListed;
    case "birthDateFuture":
      return t.validation.birthDateFuture;
    case "asOfFuture":
      return t.validation.asOfFuture;
    case "dateTooOld":
      return fillTemplate(t.validation.dateTooOld, {
        years: countPhrase(AGE_DATE_MAX_YEARS_BACK, uk.kabinet.units.years),
      });
    case "dateIncomplete":
      return uk.kabinet.dateField.incomplete;
    case "dateNoSuchDate":
      return uk.kabinet.dateField.noSuchDate;
    case "overLimit":
      return fillTemplate(t.description.counterOver, { over: integer.format(problem.over) });
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled problem; unreachable at runtime */
    default: {
      const unreachable: never = problem;
      return unreachable;
    }
  }
};

/** A label with a short form on a phone and the full one from tablet width; one accessible name. */
const Responsive = ({ short, full }: { short: string; full: string }) => (
  <>
    <span className="tablet:hidden">{short}</span>
    <span className="hidden tablet:inline">{full}</span>
  </>
);

const SPECIES: readonly Segment<AnimalSpecies>[] = [
  { value: "dog", label: uk.detail.speciesDog },
  { value: "cat", label: uk.detail.speciesCat },
];

/** Full words on every width (his answer 8); «Не записано» is the standing rule's own word. */
const SEX: readonly Segment<AnimalSex>[] = [
  { value: "male", label: t.who.sexMale },
  { value: "female", label: t.who.sexFemale },
  { value: "unknown", label: uk.kabinet.profileNotRecorded },
];

const SIZE_NAME: Record<SizeBucket, string> = {
  small: uk.filters.sizeSmall,
  medium: uk.filters.sizeMedium,
  large: uk.filters.sizeLarge,
};

/** «Не вказано» is a segment of its own, standing for null (`FormValues.coatLength`). */
type CoatSegment = CoatLength | "unknown";
const COAT: readonly Segment<CoatSegment>[] = [
  ...COAT_LENGTHS.map((coat) => ({ value: coat, label: t.coat[coat] })),
  { value: "unknown", label: t.coat.unknown },
];

/**
 * The colour as a category, not one animal's chip: the kabinet chooses which
 * colour an animal is, so each option is the filter's word (`colourFilterLabel`).
 * «Інше» opens the shelter's own words; «Не вказано» stands for null, as fur's.
 */
type ColourChoice = CoatColour | "other" | "unknown";
const COLOUR: readonly { value: ColourChoice; label: string }[] = [
  ...COAT_COLOURS.map((colour) => ({ value: colour, label: colourFilterLabel(colour) })),
  { value: "other", label: t.colour.other },
  { value: "unknown", label: t.colour.unknown },
];

const AGE_NAME: Record<AgeBucket, string> = {
  baby: uk.filters.ageBaby,
  young: uk.filters.ageYoung,
  adult: uk.filters.ageAdult,
  senior: uk.filters.ageSenior,
};

/** The age the server stores for this input (`ageOfInput`'s rule), so the preview is the card's. */
const estimateOfInput = (input: AgeEstimateInput, now: Date): AgeEstimate => {
  switch (input.kind) {
    case "birth_date":
      return { kind: "birth_date", date: instantOfCalendarDate(input.date), precision: "day" };
    case "declared_bucket":
      return {
        kind: "declared_bucket",
        bucket: input.bucket,
        declaredAt: declaredAtOfCalendarDate(input.asOf, now),
      };
    case "declared_range":
      return {
        kind: "declared_range",
        range: input.range,
        declaredAt: declaredAtOfCalendarDate(input.asOf, now),
      };
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = input;
      return unreachable;
    }
  }
};

/** The card's age text: a range's span, else the bucket word agreeing with the sex (Q9). */
const cardAgeText = (estimate: AgeEstimate, sex: AnimalSex, now: Date): string => {
  const span = ageSpanOf(estimate, now);
  return span === null ? ageWordFor(ageBucketOf(estimate, now), sex) : ageSpanLabel(span);
};

/**
 * «Основне»: what a card cannot be published without, in the order a volunteer knows it: the
 * name, the kind of animal, sex, size, age. The first four are quick taps; age is the one that
 * needs a decision, so it sits last, in its own outlined block.
 */
export function BasicsFields({
  values,
  set,
  problems,
  disabled,
  required = [],
  stored,
  now,
}: SectionProps & { stored: Pick<KabinetAnimalView, "age" | "sex"> | null; now: Date }) {
  const storedAge = stored?.age ?? null;
  const modes: readonly Segment<AgeMode>[] = [
    {
      value: "birth_date",
      label: <Responsive short={t.age.modeBirthDateShort} full={t.age.modeBirthDate} />,
    },
    {
      value: "declared",
      label: <Responsive short={t.age.modeBucketShort} full={t.age.modeBucket} />,
    },
  ];
  const input = ageInputOf(values);
  const dateProblem =
    problems.find((p) => p.field === (values.ageMode === "birth_date" ? "birthDate" : "asOf")) !==
    undefined;
  // The card's own text, from what the fields say now, the sex included (his
  // answer 9: quoted as it is; Q9: the card's word agrees with the sex).
  const label =
    input === null || dateProblem
      ? null
      : cardAgeText(estimateOfInput(input, now), values.sex, now);
  const uncertain =
    storedAge !== null &&
    storedAge.kind === "declared_bucket" &&
    isAgeEstimateUncertain(storedAge, now);
  // Both age dates: not after today in Kyiv, not more than 30 years back (`ageDateProblem`).
  const today = kyivCalendarDateOf(now);
  const earliest = calendarDateYearsBefore(today, AGE_DATE_MAX_YEARS_BACK);
  return (
    <>
      <TextField
        id="animal-name"
        label={t.who.nameLabel}
        hint={t.who.nameHint}
        placeholder={t.who.namePlaceholder}
        value={values.name}
        error={problemText(problems, "name")}
        disabled={disabled}
        autoComplete="off"
        onChange={(event) => set({ name: event.currentTarget.value })}
      />
      <SegmentedControl
        name="animal-species"
        legend={t.who.speciesLabel}
        segments={SPECIES}
        value={values.species}
        error={problemText(problems, "species")}
        disabled={disabled}
        onChange={(species) => set({ species })}
      />
      <SegmentedControl
        name="animal-sex"
        legend={withTag(t.who.sexLabel, required.includes("sex"))}
        segments={SEX}
        value={values.sex}
        disabled={disabled}
        onChange={(sex) => set({ sex })}
      />
      <SegmentedControl
        name="animal-size"
        legend={withTag(t.who.sizeLabel, required.includes("size"))}
        segments={SIZE_BUCKETS.map((size) => ({
          value: size,
          label: SIZE_NAME[size],
          // Which kilograms a size means depends on the species: none until one is chosen.
          ...(values.species === null ? {} : { hint: sizeHint(values.species, size) }),
        }))}
        value={values.size}
        hint={t.who.sizeNote}
        disabled={disabled}
        onChange={(size) => set({ size })}
      />
      <Panel tone="outline" padding="lg" className="flex flex-col gap-5">
        <Heading level={3} look="body-l">
          {withTag(t.age.title, required.includes("age"))}
        </Heading>
        <SegmentedControl
          name="animal-age-mode"
          legend={t.age.modeLabel}
          segments={modes}
          value={values.ageMode}
          hint={t.age.modeNote}
          disabled={disabled}
          onChange={(ageMode) => set({ ageMode })}
        />
        {values.ageMode === "birth_date" ? (
          <DateField
            id="animal-birth-date"
            legend={t.age.birthDateLabel}
            labels={DATE_FIELD_LABELS}
            value={values.birthDate}
            today={today}
            min={earliest}
            error={problemText(problems, "birthDate")}
            disabled={disabled}
            onChange={(birthDate) => set({ birthDate })}
          />
        ) : (
          <>
            {/* Six ranges as wrapping radio chips: six segments don't fit a 360px phone. */}
            <ChipGroup name="animal-age-bucket" legend={t.age.bucketLabel} disabled={disabled}>
              {DECLARED_AGE_RANGES.map((range) => (
                <Chip
                  key={range}
                  kind="option"
                  type="radio"
                  name="animal-age-bucket"
                  value={range}
                  checked={values.range === range}
                  onChange={() => set({ range })}
                >
                  {ageSpanLabel(declaredRangeSpan(range, 0))}
                </Chip>
              ))}
              {values.legacyBucket !== null ? (
                // A stored bucket keeps its own label (Q5): converting it would invent precision.
                <Chip
                  kind="option"
                  type="radio"
                  name="animal-age-bucket"
                  value={values.legacyBucket}
                  checked={values.range === null}
                  onChange={() => set({ range: null })}
                >
                  {`${AGE_NAME[values.legacyBucket]} · ${bucketRange(values.legacyBucket)}`}
                </Chip>
              ) : null}
            </ChipGroup>
            <DateField
              id="animal-as-of"
              legend={t.age.asOfLabel}
              labels={DATE_FIELD_LABELS}
              hint={t.age.asOfHint}
              value={values.asOf}
              today={today}
              min={earliest}
              error={problemText(problems, "asOf")}
              disabled={disabled}
              onChange={(asOf) => set({ asOf })}
            />
          </>
        )}
        {label !== null ? (
          <Text look="hint">{fillTemplate(t.age.adopterSees, { label })}</Text>
        ) : null}
        {uncertain &&
        stored !== null &&
        storedAge !== null &&
        storedAge.kind === "declared_bucket" ? (
          <Text look="hint">
            {fillTemplate(t.age.uncertain, {
              when: dateEndingSentenceOf(storedAge.declaredAt),
              // «Тепер на картці»: the saved card, so the saved sex, not the form's unsaved one.
              label: ageWordFor(ageBucketOf(storedAge, now), stored.sex),
            })}
          </Text>
        ) : null}
      </Panel>
    </>
  );
}

/**
 * The counter turns into a polite announcement only near the cap, not on
 * every keystroke: within 100 characters (the description), or a quarter of
 * a short cap (10 of a custom temperament's 40, 7 of a custom colour's 30),
 * where 100 would be every keystroke.
 */
const ANNOUNCE_WITHIN = 100;

/**
 * «{count} з {max} символів», or «Зайвих символів: {over}» past the cap: the
 * description's counter, which every capped text on this form reuses.
 * Counted as the server counts (`characterCount`).
 */
function CharacterCounter({ text, max }: { text: string; max: number }) {
  const count = characterCount(text);
  const over = count - max;
  return (
    <span aria-live={max - count <= Math.min(ANNOUNCE_WITHIN, max / 4) ? "polite" : "off"}>
      {over > 0
        ? fillTemplate(t.description.counterOver, { over: integer.format(over) })
        : fillTemplate(t.description.counter, {
            count: integer.format(count),
            max: integer.format(max),
          })}
    </span>
  );
}

/**
 * A short text in the shelter's own words, under its own cap: «Інше» for a
 * colour or a temperament. Its accessible name is «Інше – Своїми словами»,
 * two approved strings: the chip that opens it is already «Інше», and a
 * screen reader would otherwise announce two controls with one name. The
 * visible label stays in the name (WCAG 2.5.3, label in name).
 */
function CustomTextField({
  id,
  label,
  placeholder,
  value,
  max,
  error,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  max: number;
  error: string | null;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <TextField
      id={id}
      label={label}
      aria-label={`${label} – ${placeholder}`}
      placeholder={placeholder}
      value={value}
      error={error}
      disabled={disabled}
      autoComplete="off"
      hint={<CharacterCounter text={value.trim()} max={max} />}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

/**
 * «Про тварину»: the description first (it is the one field here a card cannot be published
 * without), then the optional words people read and filter by: temperament, fur, colour. The
 * description's label is «Опис» because the section is already «Про тварину».
 */
export function AboutFields({ values, set, problems, disabled, required = [] }: SectionProps) {
  const toggle = (trait: TemperamentTrait, on: boolean) =>
    set({
      temperamentTraits: on
        ? [...values.temperamentTraits.filter((ticked) => ticked !== trait), trait]
        : values.temperamentTraits.filter((ticked) => ticked !== trait),
    });
  return (
    <>
      <div className="flex flex-col gap-2">
        <Text look="hint" id="animal-description-prompt">
          {t.description.prompt}
        </Text>
        <TextArea
          id="animal-description"
          label={withTag(t.description.title, required.includes("description"))}
          value={values.description}
          error={problemText(problems, "description")}
          disabled={disabled}
          describedBy={["animal-description-prompt"]}
          hint={
            <>
              <span>{t.description.hint}</span>
              <CharacterCounter text={values.description} max={ANIMAL_DESCRIPTION_MAX_CHARACTERS} />
            </>
          }
          onChange={(event) => set({ description: event.currentTarget.value })}
        />
      </div>

      <ChipGroup
        name="animal-temperament"
        legend={t.temperament.title}
        hint={t.temperament.hint}
        disabled={disabled}
        extra={
          values.temperamentOther ? (
            <CustomTextField
              id="animal-temperament-custom"
              label={t.temperament.other}
              placeholder={t.temperament.customPlaceholder}
              value={values.temperamentCustom}
              max={TEMPERAMENT_CUSTOM_MAX_CHARACTERS}
              error={problemText(problems, "temperamentCustom")}
              disabled={disabled}
              onChange={(temperamentCustom) => set({ temperamentCustom })}
            />
          ) : null
        }
      >
        {TEMPERAMENT_TRAITS.map((trait) => (
          <Chip
            key={trait}
            kind="option"
            type="checkbox"
            name="animal-temperament"
            value={trait}
            checked={values.temperamentTraits.includes(trait)}
            onChange={(event) => toggle(trait, event.currentTarget.checked)}
          >
            {temperamentLabelFor(trait, values.sex)}
          </Chip>
        ))}
        <Chip
          kind="option"
          type="checkbox"
          name="animal-temperament"
          value="other"
          checked={values.temperamentOther}
          onChange={(event) => set({ temperamentOther: event.currentTarget.checked })}
        >
          {t.temperament.other}
        </Chip>
      </ChipGroup>

      <SegmentedControl
        name="animal-coat"
        legend={t.coat.label}
        segments={COAT}
        value={values.coatLength ?? "unknown"}
        disabled={disabled}
        onChange={(coat) => set({ coatLength: coat === "unknown" ? null : coat })}
      />

      <ChipGroup
        name="animal-colour"
        legend={t.colour.title}
        disabled={disabled}
        extra={
          values.colour === "other" ? (
            <CustomTextField
              id="animal-colour-custom"
              label={t.colour.other}
              placeholder={t.colour.customPlaceholder}
              value={values.colourCustom}
              max={COAT_COLOUR_CUSTOM_MAX_CHARACTERS}
              error={problemText(problems, "colourCustom")}
              disabled={disabled}
              onChange={(colourCustom) => set({ colourCustom })}
            />
          ) : null
        }
      >
        {COLOUR.map((colour) => (
          <Chip
            key={colour.value}
            kind="option"
            type="radio"
            name="animal-colour"
            value={colour.value}
            checked={(values.colour ?? "unknown") === colour.value}
            onChange={() => set({ colour: colour.value === "unknown" ? null : colour.value })}
          >
            {colour.label}
          </Chip>
        ))}
      </ChipGroup>
    </>
  );
}

const MEDICAL: readonly Segment<MedicalState>[] = [
  { value: "unknown", label: uk.medical.unknown },
  { value: "in_progress", label: uk.medical.inProgress },
  { value: "confirmed", label: t.health.confirm },
];

/**
 * «Здоровʼя»: the two structured facts (vaccination, spay/neuter) that feed the public chip row,
 * then the shelter's own free-text note, which the public page shows under «Медичний стан». All
 * optional; «Не записано» is an honest answer, never an error.
 */
export function HealthFields({
  values,
  set,
  problems,
  disabled,
  vaccination,
}: SectionProps & { vaccination: VaccinationStatus | null }) {
  const registry = vaccination?.source === "registry" ? vaccinationRow(vaccination) : null;
  return (
    <>
      <Heading level={3} look="body-l">
        {t.health.title}
      </Heading>
      {registry !== null ? (
        // N19: a registry fact renders read-only, with the public row's own treatment.
        <div className="flex flex-col gap-1">
          <Text look="label">{registry.label}</Text>
          <Text look="hint">{MEDICAL_VALUE_TEXT[registry.value]}</Text>
          <Text look="hint">{rowSource(registry)}</Text>
          <Text look="hint">{t.health.registryReadOnly}</Text>
        </div>
      ) : (
        <SegmentedControl
          name="animal-vaccination"
          legend={uk.medical.vaccination}
          segments={MEDICAL}
          value={values.vaccination}
          disabled={disabled}
          onChange={(state) => set({ vaccination: state })}
        />
      )}
      <SegmentedControl
        name="animal-spay-neuter"
        legend={uk.medical.spayNeuter}
        segments={MEDICAL}
        value={values.spayNeuter}
        disabled={disabled}
        onChange={(state) => set({ spayNeuter: state })}
      />
      <Text look="hint">{t.health.unknownNote}</Text>
      <TextArea
        id="animal-medical-notes"
        label={t.medicalNotes.title}
        value={values.medicalNotes}
        error={problemText(problems, "medicalNotes")}
        disabled={disabled}
        hint={
          <>
            <span>{t.medicalNotes.hint}</span>
            <span className="block">{t.medicalNotes.publicNote}</span>
            <CharacterCounter text={values.medicalNotes} max={MEDICAL_NOTES_MAX_CHARACTERS} />
          </>
        }
        onChange={(event) => set({ medicalNotes: event.currentTarget.value })}
      />
    </>
  );
}
