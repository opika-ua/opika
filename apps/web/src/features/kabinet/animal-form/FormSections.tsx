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
  characterCount,
  instantOfCalendarDate,
  isAgeEstimateUncertain,
  type MedicalState,
  SIZE_BUCKETS,
  type SizeBucket,
  type VaccinationStatus,
} from "@opika/domain";
import { ageBucketLabel, fillTemplate, uk } from "@opika/i18n";
import { vaccinationRow } from "../../animal-detail/medical-labels";
import { type Segment, SegmentedControl, TextAreaField, TextField } from "../../controls/controls";
import { CAPTION, CARD, CARD_TITLE, INNER } from "../profile-edit/styles";
import type { AgeMode, FieldProblem, FormValues } from "./form-values";
import { ageInputOf } from "./form-values";
import { bucketRange, longDateOf, sizeHint } from "./labels";

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
    </section>
  );
}

export function AgeSection({
  values,
  set,
  problems,
  disabled,
  storedAge,
  now,
}: SectionProps & { storedAge: KabinetAnimalView["age"]; now: Date }) {
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
  // The card's own word, from what the fields say now (his answer 9: quoted as it is).
  const label =
    input === null || dateProblem
      ? null
      : ageBucketLabel(
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
                  declaredAt: instantOfCalendarDate(input.asOf),
                },
            now,
          ),
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
      {uncertain && storedAge !== null && storedAge.kind === "declared_bucket" ? (
        <p className={CAPTION}>
          {fillTemplate(t.age.uncertain, {
            when: longDateOf(storedAge.declaredAt),
            label: ageBucketLabel(ageBucketOf(storedAge, now)),
          })}
        </p>
      ) : null}
    </section>
  );
}

/** The counter turns into a polite announcement only near the cap, not on every keystroke. */
const ANNOUNCE_WITHIN = 100;

export function DescriptionSection({ values, set, problems, disabled }: SectionProps) {
  const count = characterCount(values.description);
  const over = count - ANIMAL_DESCRIPTION_MAX_CHARACTERS;
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
            <span
              aria-live={
                ANIMAL_DESCRIPTION_MAX_CHARACTERS - count <= ANNOUNCE_WITHIN ? "polite" : "off"
              }
            >
              {over > 0
                ? fillTemplate(t.description.counterOver, { over: integer.format(over) })
                : fillTemplate(t.description.counter, {
                    count: integer.format(count),
                    max: integer.format(ANIMAL_DESCRIPTION_MAX_CHARACTERS),
                  })}
            </span>
          </>
        }
        onChange={(event) => set({ description: event.currentTarget.value })}
      />
    </section>
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
