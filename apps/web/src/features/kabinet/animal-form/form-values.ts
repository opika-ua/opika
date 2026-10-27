import type { AgeEstimateInput, AnimalPatchSchema, KabinetAnimalView } from "@opika/contracts";
import {
  type AgeBucket,
  type AnimalColour,
  type AnimalSex,
  type AnimalSpecies,
  ageDateProblem,
  animalDescriptionProblem,
  animalNameProblem,
  type CalendarDate,
  COAT_COLOUR_CUSTOM_MAX_CHARACTERS,
  type CoatColour,
  type CoatLength,
  characterCount,
  kyivCalendarDateOf,
  type LocalizedText,
  type MedicalState,
  type SizeBucket,
  TEMPERAMENT_CUSTOM_MAX_CHARACTERS,
  type Temperament,
  type TemperamentTrait,
} from "@opika/domain";
import type { z } from "zod";

/**
 * K3's form as the screen holds it, and the one translation each way:
 * `valuesOf` (what the server sent → the fields) and `patchOf` (the fields →
 * the smallest patch that says what changed). Pure, so the rules the form
 * follows are tested without a DOM.
 *
 * An unanswered fact is `null` (or an empty string for a text the person
 * types), never a stand-in value: a draft that hasn't been given a size
 * shows no size selected, and saving it sends no size (K-Q5, F-B1).
 */

export type AgeMode = "birth_date" | "declared_bucket";

export type FormValues = {
  name: string;
  /** Null only on `/nova` before the person chooses (K-Q5: a species creates the draft). */
  species: AnimalSpecies | null;
  sex: AnimalSex;
  size: SizeBucket | null;
  /** Null is «Не вказано», an answer in its own right: unlike size, it can be chosen again after a value (DR1-D10). */
  coatLength: CoatLength | null;
  ageMode: AgeMode;
  /** `YYYY-MM-DD`, or "" while not given. */
  birthDate: string;
  bucket: AgeBucket | null;
  /** `YYYY-MM-DD`; defaults to today in Kyiv (KAB:189: "defaults to today"). */
  asOf: string;
  /** The Ukrainian description as typed; blank means none. */
  description: string;
  /** The Ukrainian medical note as typed (pet card PR 5's «Медичний стан»); blank means none,
   * same blank↔null pattern as `description` - never required to publish (A3). */
  medicalNotes: string;
  /**
   * The presets ticked, in the order they were ticked: the order the card
   * shows and the database keeps. A stored temperament loads in its stored
   * order, so re-saving what the form shows is never a change.
   */
  temperamentTraits: readonly TemperamentTrait[];
  /** «Інше» ticked. Unticking keeps what was typed on screen but sends none of it. */
  temperamentOther: boolean;
  /** The custom entry as typed; blank, trimmed, means none. */
  temperamentCustom: string;
  /** Null is «Не вказано», like fur; "other" is the shelter's own words in `colourCustom`. */
  colour: CoatColour | "other" | null;
  /** The custom colour as typed; blank, trimmed, means none. */
  colourCustom: string;
  vaccination: MedicalState;
  spayNeuter: MedicalState;
};

export type AnimalPatch = z.infer<typeof AnimalPatchSchema>;

/** The fields for a new animal (`/nova`): nothing answered but the defaults the domain gives (D2). */
export const emptyValues = (today: CalendarDate): FormValues => ({
  name: "",
  species: null,
  sex: "unknown",
  size: null,
  coatLength: null,
  ageMode: "declared_bucket",
  birthDate: "",
  bucket: null,
  asOf: today,
  description: "",
  medicalNotes: "",
  temperamentTraits: [],
  temperamentOther: false,
  temperamentCustom: "",
  colour: null,
  colourCustom: "",
  vaccination: "unknown",
  spayNeuter: "unknown",
});

/**
 * The stored age as the form shows it: its date on Kyiv's calendar, the same
 * conversion the server uses to tell an unchanged age from a new one
 * (`sameAge`), so re-saving what the form shows is never a change.
 */
const storedAgeInputOf = (age: KabinetAnimalView["age"]): AgeEstimateInput | null => {
  if (age === null) return null;
  return age.kind === "birth_date"
    ? { kind: "birth_date", date: kyivCalendarDateOf(age.date) }
    : { kind: "declared_bucket", bucket: age.bucket, asOf: kyivCalendarDateOf(age.declaredAt) };
};

const ageFieldsOf = (
  age: KabinetAnimalView["age"],
  today: CalendarDate,
): Pick<FormValues, "ageMode" | "birthDate" | "bucket" | "asOf"> => {
  const stored = storedAgeInputOf(age);
  if (stored === null)
    return { ageMode: "declared_bucket", birthDate: "", bucket: null, asOf: today };
  return stored.kind === "birth_date"
    ? { ageMode: "birth_date", birthDate: stored.date, bucket: null, asOf: today }
    : { ageMode: "declared_bucket", birthDate: "", bucket: stored.bucket, asOf: stored.asOf };
};

/** The temperament's custom entry, which `TemperamentSchema` keeps last; null when there is none. */
const customTemperamentOf = (temperament: Temperament): LocalizedText | null => {
  const last = temperament.at(-1);
  return last?.kind === "custom" ? last.text : null;
};

const customColourOf = (colour: AnimalColour | null): LocalizedText | null =>
  colour?.kind === "custom" ? colour.text : null;

export const valuesOf = (view: KabinetAnimalView, today: CalendarDate): FormValues => {
  const customTemperament = customTemperamentOf(view.temperament);
  return {
    name: view.name,
    species: view.species,
    sex: view.sex,
    size: view.size,
    coatLength: view.coatLength,
    ...ageFieldsOf(view.age, today),
    description: view.description?.uk ?? "",
    medicalNotes: view.medicalNotes?.uk ?? "",
    temperamentTraits: view.temperament.flatMap((entry) =>
      entry.kind === "preset" ? [entry.trait] : [],
    ),
    temperamentOther: customTemperament !== null,
    temperamentCustom: customTemperament?.uk ?? "",
    colour:
      view.colour === null ? null : view.colour.kind === "preset" ? view.colour.colour : "other",
    colourCustom: customColourOf(view.colour)?.uk ?? "",
    vaccination: view.vaccination.state,
    spayNeuter: view.spayNeuter.state,
  };
};

const sameList = <T>(a: readonly T[], b: readonly T[]): boolean =>
  a.length === b.length && a.every((item, index) => item === b[index]);

/** Field by field, so a `/nova` form with nothing typed can be told from one with something in it, even before a name and a species exist to diff against. */
export function valuesEqual(a: FormValues, b: FormValues): boolean {
  return (Object.keys(a) as (keyof FormValues)[]).every((key) => {
    const left = a[key];
    const right = b[key];
    return Array.isArray(left) && Array.isArray(right) ? sameList(left, right) : left === right;
  });
}

/** The age the fields give, or null while the chosen mode isn't filled in. */
export const ageInputOf = (values: FormValues): AgeEstimateInput | null => {
  if (values.ageMode === "birth_date") {
    return values.birthDate === "" ? null : { kind: "birth_date", date: values.birthDate };
  }
  return values.bucket === null || values.asOf === ""
    ? null
    : { kind: "declared_bucket", bucket: values.bucket, asOf: values.asOf };
};

const sameAgeInput = (a: AgeEstimateInput | null, b: AgeEstimateInput | null): boolean => {
  if (a === null || b === null) return a === b;
  if (a.kind === "birth_date" && b.kind === "birth_date") return a.date === b.date;
  if (a.kind === "declared_bucket" && b.kind === "declared_bucket") {
    return a.bucket === b.bucket && a.asOf === b.asOf;
  }
  return false;
};

const isBlank = (text: string) => text.trim() === "";

/**
 * A custom text as the patch sends it: trimmed, and carrying the stored
 * English when the Ukrainian is unchanged, so ticking one more preset never
 * drops a translation the shelter didn't touch (the server keeps English only
 * beside the Ukrainian it translates, `textAfterEdit`).
 */
const customTextOf = (typed: string, stored: LocalizedText | null): LocalizedText => {
  const uk = typed.trim();
  return stored !== null && stored.uk === uk ? stored : { uk, en: null };
};

/** What the temperament fields say, as the domain value: the presets, then the custom entry, if any. */
export const temperamentOf = (values: FormValues, stored: Temperament): Temperament => [
  ...values.temperamentTraits.map((trait) => ({ kind: "preset" as const, trait })),
  ...(values.temperamentOther && !isBlank(values.temperamentCustom)
    ? [
        {
          kind: "custom" as const,
          text: customTextOf(values.temperamentCustom, customTemperamentOf(stored)),
        },
      ]
    : []),
];

/** What the colour fields say: a preset, the shelter's words, or nothing; a blank «Інше» is nothing. */
export const colourOf = (values: FormValues, stored: AnimalColour | null): AnimalColour | null => {
  if (values.colour === null) return null;
  if (values.colour !== "other") return { kind: "preset", colour: values.colour };
  return isBlank(values.colourCustom)
    ? null
    : { kind: "custom", text: customTextOf(values.colourCustom, customColourOf(stored)) };
};

const sameText = (a: LocalizedText | null, b: LocalizedText | null): boolean =>
  a === null || b === null
    ? a === b
    : a.uk === b.uk &&
      (a.en === null || b.en === null
        ? a.en === b.en
        : a.en.text === b.en.text && a.en.provenance === b.en.provenance);

const sameColour = (a: AnimalColour | null, b: AnimalColour | null): boolean => {
  if (a === null || b === null) return a === b;
  if (a.kind === "preset" && b.kind === "preset") return a.colour === b.colour;
  if (a.kind === "custom" && b.kind === "custom") return sameText(a.text, b.text);
  return false;
};

const sameTemperament = (a: Temperament, b: Temperament): boolean =>
  a.length === b.length &&
  a.every((entry, index) => {
    const other = b[index];
    if (other === undefined) return false;
    if (entry.kind === "preset" && other.kind === "preset") return entry.trait === other.trait;
    if (entry.kind === "custom" && other.kind === "custom") return sameText(entry.text, other.text);
    return false;
  });

/**
 * The smallest patch that turns `view` into what the fields say, or null
 * when nothing differs. Fields the person can't have meant are left out: an
 * age whose mode is chosen but not filled in, a registry-confirmed
 * vaccination (read-only, KAB:208), a blank description on an animal that
 * never had one. A blanked description becomes `null`, which only a draft
 * accepts; `problemsOf` stops it before it is sent for a listed animal.
 */
export function patchOf(view: KabinetAnimalView, values: FormValues): AnimalPatch | null {
  const patch: AnimalPatch = {};
  if (values.name.trim() !== view.name) patch.name = values.name;
  if (values.species !== null && values.species !== view.species) patch.species = values.species;
  if (values.sex !== view.sex) patch.sex = values.sex;
  if (values.size !== null && values.size !== view.size) patch.size = values.size;
  if (values.coatLength !== view.coatLength) patch.coatLength = values.coatLength;
  const age = ageInputOf(values);
  if (age !== null && !sameAgeInput(age, storedAgeInputOf(view.age))) patch.age = age;
  if (isBlank(values.description)) {
    if (view.description !== null) patch.description = null;
  } else if (values.description !== view.description?.uk) {
    patch.description = { uk: values.description, en: null };
  }
  if (isBlank(values.medicalNotes)) {
    if (view.medicalNotes !== null) patch.medicalNotes = null;
  } else if (values.medicalNotes !== view.medicalNotes?.uk) {
    patch.medicalNotes = { uk: values.medicalNotes, en: null };
  }
  if (view.vaccination.source !== "registry" && values.vaccination !== view.vaccination.state) {
    patch.vaccination = { state: values.vaccination };
  }
  if (values.spayNeuter !== view.spayNeuter.state) patch.spayNeuter = { state: values.spayNeuter };
  const temperament = temperamentOf(values, view.temperament);
  if (!sameTemperament(temperament, view.temperament)) patch.temperament = temperament;
  const colour = colourOf(values, view.colour);
  if (!sameColour(colour, view.colour)) patch.colour = colour;
  return Object.keys(patch).length === 0 ? null : patch;
}

/** One field's problem, named by the copy key that says it (`validation.*`, `errors.*`). */
export type FieldProblem =
  | { field: "name"; key: "nameRequired" | "nameBrace" | "nameTooLong" }
  | { field: "species"; key: "speciesRequired" }
  | { field: "description"; key: "descriptionTooLong" | "requiredOnceListed" }
  /** Never a publish gap, unlike `description` - A3: medical notes is optional for every listing kind. */
  | { field: "medicalNotes"; key: "medicalNotesTooLong" }
  | { field: "birthDate"; key: "birthDateFuture" | "dateTooOld" }
  | { field: "asOf"; key: "asOfFuture" | "dateTooOld" }
  /**
   * The pet card's custom texts over their caps. `over` is how many
   * characters too many, which the field says in the counter's own words
   * («Зайвих символів»): no sentence of its own exists for these two yet.
   */
  | { field: "temperamentCustom" | "colourCustom"; key: "overLimit"; over: number };

/** How far a text is over its cap, counted as the server counts it; 0 when it fits. */
const overBy = (text: string, max: number): number => Math.max(0, characterCount(text) - max);

/**
 * What stops a save, checked with the rules the server applies (the same
 * domain functions, `characterCount` included), so the form never sends what
 * the server would refuse. Dates are checked on the device's Kyiv calendar;
 * the server checks again on its own clock (`AGE_DATE_OUT_OF_RANGE`).
 */
export function problemsOf(
  values: FormValues,
  listing: KabinetAnimalView["listing"]["kind"] | "new",
  now: Date,
): FieldProblem[] {
  const problems: FieldProblem[] = [];
  const name = animalNameProblem(values.name);
  if (name !== null) {
    problems.push({
      field: "name",
      key:
        name.kind === "empty"
          ? "nameRequired"
          : name.kind === "brace"
            ? "nameBrace"
            : "nameTooLong",
    });
  }
  if (values.species === null) problems.push({ field: "species", key: "speciesRequired" });
  if (animalDescriptionProblem(values.description) !== null) {
    problems.push({ field: "description", key: "descriptionTooLong" });
  } else if (isBlank(values.description) && listing !== "new" && listing !== "draft") {
    problems.push({ field: "description", key: "requiredOnceListed" });
  }
  // `MEDICAL_NOTES_MAX_CHARACTERS === ANIMAL_DESCRIPTION_MAX_CHARACTERS` by definition
  // (packages/domain/src/animals/animal.ts), so the description's own threshold function
  // is exactly right here too - no second domain function needed for the same cap.
  if (animalDescriptionProblem(values.medicalNotes) !== null) {
    problems.push({ field: "medicalNotes", key: "medicalNotesTooLong" });
  }
  const temperamentOver = values.temperamentOther
    ? overBy(values.temperamentCustom.trim(), TEMPERAMENT_CUSTOM_MAX_CHARACTERS)
    : 0;
  if (temperamentOver > 0) {
    problems.push({ field: "temperamentCustom", key: "overLimit", over: temperamentOver });
  }
  const colourOver =
    values.colour === "other"
      ? overBy(values.colourCustom.trim(), COAT_COLOUR_CUSTOM_MAX_CHARACTERS)
      : 0;
  if (colourOver > 0) problems.push({ field: "colourCustom", key: "overLimit", over: colourOver });
  if (values.ageMode === "birth_date" && values.birthDate !== "") {
    const problem = ageDateProblem(values.birthDate, now);
    if (problem !== null) {
      problems.push({
        field: "birthDate",
        key: problem.kind === "future" ? "birthDateFuture" : "dateTooOld",
      });
    }
  }
  if (values.ageMode === "declared_bucket" && values.asOf !== "") {
    const problem = ageDateProblem(values.asOf, now);
    if (problem !== null) {
      problems.push({
        field: "asOf",
        key: problem.kind === "future" ? "asOfFuture" : "dateTooOld",
      });
    }
  }
  return problems;
}
