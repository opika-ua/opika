import type { AgeEstimateInput, AnimalPatchSchema, KabinetAnimalView } from "@opika/contracts";
import {
  type AgeBucket,
  type AnimalSex,
  type AnimalSpecies,
  ageDateProblem,
  animalDescriptionProblem,
  animalNameProblem,
  type CalendarDate,
  type CoatLength,
  kyivCalendarDateOf,
  type MedicalState,
  type SizeBucket,
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

export const valuesOf = (view: KabinetAnimalView, today: CalendarDate): FormValues => ({
  name: view.name,
  species: view.species,
  sex: view.sex,
  size: view.size,
  coatLength: view.coatLength,
  ...ageFieldsOf(view.age, today),
  description: view.description?.uk ?? "",
  vaccination: view.vaccination.state,
  spayNeuter: view.spayNeuter.state,
});

/** Field by field, so a `/nova` form with nothing typed can be told from one with something in it, even before a name and a species exist to diff against. */
export function valuesEqual(a: FormValues, b: FormValues): boolean {
  return (Object.keys(a) as (keyof FormValues)[]).every((key) => a[key] === b[key]);
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
  if (view.vaccination.source !== "registry" && values.vaccination !== view.vaccination.state) {
    patch.vaccination = { state: values.vaccination };
  }
  if (values.spayNeuter !== view.spayNeuter.state) patch.spayNeuter = { state: values.spayNeuter };
  return Object.keys(patch).length === 0 ? null : patch;
}

/** One field's problem, named by the copy key that says it (`validation.*`, `errors.*`). */
export type FieldProblem =
  | { field: "name"; key: "nameRequired" | "nameBrace" | "nameTooLong" }
  | { field: "species"; key: "speciesRequired" }
  | { field: "description"; key: "descriptionTooLong" | "requiredOnceListed" }
  | { field: "birthDate"; key: "birthDateFuture" | "dateTooOld" }
  | { field: "asOf"; key: "asOfFuture" | "dateTooOld" };

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
