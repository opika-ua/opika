"use client";

import type { KabinetAnimalView } from "@opika/contracts";
import {
  AGE_BUCKETS,
  AGE_DATE_MAX_YEARS_BACK,
  ANIMAL_DESCRIPTION_MAX_CHARACTERS,
  ANIMAL_NAME_MAX_CHARACTERS,
  type AnimalSex,
  type AnimalSpecies,
  ageBucketOf,
  COAT_COLOUR_CUSTOM_MAX_CHARACTERS,
  COAT_COLOURS,
  COAT_LENGTHS,
  type CoatColour,
  type CoatLength,
  characterCount,
  declaredAtOfCalendarDate,
  instantOfCalendarDate,
  isAgeEstimateUncertain,
  type MedicalState,
  SIZE_BUCKETS,
  type SizeBucket,
  TEMPERAMENT_CUSTOM_MAX_CHARACTERS,
  TEMPERAMENT_TRAITS,
  type TemperamentTrait,
  type VaccinationStatus,
} from "@opika/domain";
import { ageWordFor, colourFilterLabel, fillTemplate, temperamentLabelFor, uk } from "@opika/i18n";
import { vaccinationRow } from "../../animal-detail/medical-labels";
import {
  CheckboxOption,
  type Segment,
  SegmentedControl,
  TextAreaField,
  TextField,
} from "../../controls/controls";
import { CAPTION, CARD, CARD_TITLE, INNER } from "../profile-edit/styles";
import type { AgeMode, FieldProblem, FormValues } from "./form-values";
import { ageInputOf } from "./form-values";
import { bucketRange, dateEndingSentenceOf, sizeHint } from "./labels";

/**
 * K3's four field sections (KABINET K3: one page, not a wizard), each a card
 * with a heading that names its region. Presentational: the form owns the
 * values and passes a setter; a section only says what changed. Styled only
 * through the shared controls and tokens (Test logic, not looks).
 */

const t = uk.kabinet.animalForm;
const integer = new Intl.NumberFormat("uk");

export type SectionProps = {
  values: FormValues;
  set: (change: Partial<FormValues>) => void;
  /** The problems to show now (after a field is left, or a save is tried). */
  problems: readonly FieldProblem[];
  disabled: boolean;
};

const problemText = (
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
    case "requiredOnceListed":
      return t.errors.requiredOnceListed;
    case "birthDateFuture":
      return t.validation.birthDateFuture;
    case "asOfFuture":
      return t.validation.asOfFuture;
    case "dateTooOld":
      return fillTemplate(t.validation.dateTooOld, {
        years: integer.format(AGE_DATE_MAX_YEARS_BACK),
      });
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
type ColourSegment = CoatColour | "other" | "unknown";
const COLOUR: readonly Segment<ColourSegment>[] = [
  ...COAT_COLOURS.map((colour) => ({ value: colour, label: colourFilterLabel(colour) })),
  { value: "other", label: t.colour.other },
  { value: "unknown", label: t.colour.unknown },
];

const AGE_NAME: Record<(typeof AGE_BUCKETS)[number], string> = {
  baby: uk.filters.ageBaby,
  young: uk.filters.ageYoung,
  adult: uk.filters.ageAdult,
  senior: uk.filters.ageSenior,
};

export function WhoSection({ values, set, problems, disabled }: SectionProps) {
  return (
    <section aria-labelledby="who-title" className={CARD}>
      <h2 id="who-title" className={CARD_TITLE}>
        {t.who.title}
      </h2>
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
        legend={t.who.sexLabel}
        segments={SEX}
        value={values.sex}
        disabled={disabled}
        onChange={(sex) => set({ sex })}
      />
      <SegmentedControl
        name="animal-size"
        legend={t.who.sizeLabel}
        segments={SIZE_BUCKETS.map((size) => ({
          value: size,
          label: SIZE_NAME[size],
          hint: sizeHint(size),
        }))}
        value={values.size}
        hint={t.who.sizeNote}
        disabled={disabled}
        onChange={(size) => set({ size })}
      />
      <SegmentedControl
        name="animal-coat"
        legend={t.coat.label}
        segments={COAT}
        value={values.coatLength ?? "unknown"}
        disabled={disabled}
        onChange={(coat) => set({ coatLength: coat === "unknown" ? null : coat })}
      />
      <SegmentedControl
        name="animal-colour"
        legend={t.colour.title}
        segments={COLOUR}
        value={values.colour ?? "unknown"}
        disabled={disabled}
        onChange={(colour) => set({ colour: colour === "unknown" ? null : colour })}
      />
      {values.colour === "other" ? (
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
      ) : null}
    </section>
  );
}

export function AgeSection({
  values,
  set,
  problems,
  disabled,
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
      value: "declared_bucket",
      label: <Responsive short={t.age.modeBucketShort} full={t.age.modeBucket} />,
    },
  ];
  const input = ageInputOf(values);
  const dateProblem =
    problems.find((p) => p.field === (values.ageMode === "birth_date" ? "birthDate" : "asOf")) !==
    undefined;
  // The card's own word, from what the fields say now, the sex included (his
  // answer 9: quoted as it is; Q9: the card's word agrees with the sex).
  const label =
    input === null || dateProblem
      ? null
      : ageWordFor(
          ageBucketOf(
            input.kind === "birth_date"
              ? {
                  kind: "birth_date",
                  date: instantOfCalendarDate(input.date),
                  precision: "day",
                }
              : {
                  kind: "declared_bucket",
                  bucket: input.bucket,
                  declaredAt: declaredAtOfCalendarDate(input.asOf, now),
                },
            now,
          ),
          values.sex,
        );
  const uncertain =
    storedAge !== null &&
    storedAge.kind === "declared_bucket" &&
    isAgeEstimateUncertain(storedAge, now);
  return (
    <section aria-labelledby="age-title" className={CARD}>
      <h2 id="age-title" className={CARD_TITLE}>
        {t.age.title}
      </h2>
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
        <TextField
          id="animal-birth-date"
          type="date"
          label={t.age.birthDateLabel}
          value={values.birthDate}
          error={problemText(problems, "birthDate")}
          disabled={disabled}
          onChange={(event) => set({ birthDate: event.currentTarget.value })}
        />
      ) : (
        <div className={`flex flex-col gap-4 ${INNER}`}>
          <SegmentedControl
            name="animal-age-bucket"
            legend={t.age.bucketLabel}
            segments={AGE_BUCKETS.map((bucket) => ({
              value: bucket,
              label: `${AGE_NAME[bucket]} · ${bucketRange(bucket)}`,
            }))}
            value={values.bucket}
            disabled={disabled}
            onChange={(bucket) => set({ bucket })}
          />
          <TextField
            id="animal-as-of"
            type="date"
            label={t.age.asOfLabel}
            hint={t.age.asOfHint}
            value={values.asOf}
            error={problemText(problems, "asOf")}
            disabled={disabled}
            onChange={(event) => set({ asOf: event.currentTarget.value })}
          />
        </div>
      )}
      {label !== null ? (
        <p className={CAPTION}>{fillTemplate(t.age.adopterSees, { label })}</p>
      ) : null}
      {uncertain &&
      stored !== null &&
      storedAge !== null &&
      storedAge.kind === "declared_bucket" ? (
        <p className={CAPTION}>
          {fillTemplate(t.age.uncertain, {
            when: dateEndingSentenceOf(storedAge.declaredAt),
            // «Тепер на картці»: the saved card, so the saved sex, not the form's unsaved one.
            label: ageWordFor(ageBucketOf(storedAge, now), stored.sex),
          })}
        </p>
      ) : null}
    </section>
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
 * colour or a temperament. Its accessible name is «Інше - Своїми словами»,
 * two approved strings: the checkbox or radio that opens it is already
 * «Інше», and a screen reader would otherwise announce two controls with one
 * name. The visible label stays in the name (WCAG 2.5.3, label in name).
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
      aria-label={`${label} - ${placeholder}`}
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

export function DescriptionSection({ values, set, problems, disabled }: SectionProps) {
  return (
    <section aria-labelledby="description-title" className={CARD}>
      <h2 id="description-title" className={CARD_TITLE}>
        {t.description.title}
      </h2>
      <p className={CAPTION}>{t.description.prompt}</p>
      <TextAreaField
        id="animal-description"
        label={t.description.label}
        value={values.description}
        error={problemText(problems, "description")}
        disabled={disabled}
        hint={
          <>
            <span>{t.description.hint}</span>
            <CharacterCounter text={values.description} max={ANIMAL_DESCRIPTION_MAX_CHARACTERS} />
          </>
        }
        onChange={(event) => set({ description: event.currentTarget.value })}
      />
    </section>
  );
}

/**
 * «Характер»: any of the presets, in the order ticked, plus at most one entry
 * in the shelter's own words. Each preset reads in the form the card will
 * show for the sex chosen above, so the words change as the sex does (the
 * age word's rule: female → feminine, male and «Не записано» → masculine).
 * Optional, never a publish gap.
 */
export function TemperamentSection({ values, set, problems, disabled }: SectionProps) {
  const toggle = (trait: TemperamentTrait, on: boolean) =>
    set({
      temperamentTraits: on
        ? [...values.temperamentTraits.filter((ticked) => ticked !== trait), trait]
        : values.temperamentTraits.filter((ticked) => ticked !== trait),
    });
  return (
    <fieldset className={CARD} disabled={disabled} aria-describedby="temperament-hint">
      <legend className={`${CARD_TITLE} mb-4`}>{t.temperament.title}</legend>
      <p id="temperament-hint" className={CAPTION}>
        {t.temperament.hint}
      </p>
      <div className="flex min-w-0 flex-col gap-2">
        {TEMPERAMENT_TRAITS.map((trait) => (
          <CheckboxOption
            key={trait}
            name="animal-temperament"
            value={trait}
            label={temperamentLabelFor(trait, values.sex)}
            checked={values.temperamentTraits.includes(trait)}
            onChange={(event) => toggle(trait, event.currentTarget.checked)}
          />
        ))}
        <CheckboxOption
          name="animal-temperament"
          value="other"
          label={t.temperament.other}
          checked={values.temperamentOther}
          onChange={(event) => set({ temperamentOther: event.currentTarget.checked })}
        />
      </div>
      {values.temperamentOther ? (
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
      ) : null}
    </fieldset>
  );
}

const MEDICAL: readonly Segment<MedicalState>[] = [
  { value: "unknown", label: uk.medical.unknown },
  { value: "in_progress", label: uk.medical.inProgress },
  { value: "confirmed", label: t.health.confirm },
];

export function HealthSection({
  values,
  set,
  disabled,
  vaccination,
}: Omit<SectionProps, "problems"> & { vaccination: VaccinationStatus | null }) {
  const registry = vaccination?.source === "registry" ? vaccinationRow(vaccination) : null;
  return (
    <section aria-labelledby="health-title" className={CARD}>
      <h2 id="health-title" className={CARD_TITLE}>
        {t.health.title}
      </h2>
      {registry !== null ? (
        // N19: a registry fact renders read-only, with the public row's own treatment.
        <div className="flex flex-col gap-1">
          <p className="text-base font-medium text-rg-ink">{registry.label}</p>
          <p className={CAPTION}>{registry.statusText}</p>
          <p className={CAPTION}>{t.health.registryReadOnly}</p>
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
      <p className={CAPTION}>{t.health.unknownNote}</p>
    </section>
  );
}
