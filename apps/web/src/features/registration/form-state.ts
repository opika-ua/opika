import type {
  RegistrationField,
  RegistrationFieldError,
  RegistrationResult,
} from "@opika/contracts";

/**
 * What the registration form and its server action pass each other. Types and plain constants
 * only: the form is a public client file, so nothing here may pull zod or the catalogue in.
 */

/** The section's anchor (`/prytulkam#reyestratsiia`), the rules' and the privacy section's. */
export const REGISTRATION_ANCHOR = "reyestratsiia";
/** The form's heading: where the anchor and a direct link move focus. */
export const REGISTRATION_HEADING_ID = `${REGISTRATION_ANCHOR}-title`;
export const RULES_HREF = "/prytulkam#pravyla";
export const PRIVACY_HREF = "/pro#dani";

/** The honeypot's input name: meaningless to autofill, so a password manager leaves it empty. */
export const HONEYPOT_NAME = "reg_hp_x";
/** Set by the hydrated form: without it the action answers a 303 (the no-JS path). */
export const ENHANCED_NAME = "enhanced";
/** Without JS the city is typed, not picked: resolved on the server by its exact name. */
export const CITY_NAME_NAME = "cityName";

export type RegistrationCity = { id: string; label: string };

/** Echoed back after a refused submit so nothing typed is lost; never the passwords. */
export type RegistrationValues = {
  name: string;
  city: RegistrationCity | null;
  cityName: string;
  link: string;
  contact: string;
  email: string;
};

export const EMPTY_VALUES: RegistrationValues = {
  name: "",
  city: null,
  cityName: "",
  link: "",
  contact: "",
  email: "",
};

export type RegistrationFormState = {
  result: RegistrationResult | null;
  values: RegistrationValues;
  /** Re-issued with every answer; a refused submit keeps the first render's time. */
  formStamp: string;
};

export type RegistrationAction = (
  previous: RegistrationFormState,
  form: FormData,
) => Promise<RegistrationFormState>;

export type CitySearchAnswer =
  | { kind: "too_short" }
  | { kind: "options"; options: { value: string; label: string; detail?: string }[] }
  | { kind: "failed" };

export type RegistrationCitySearch = (query: string) => Promise<CitySearchAnswer>;

/** The field order of the form and of the error summary (§13.2). */
export const FIELD_ORDER: readonly RegistrationField[] = [
  "name",
  "cityId",
  "link",
  "contact",
  "email",
  "password",
  "passwordRepeat",
];

export const fieldIdOf = (field: RegistrationField): string => `reg-${field}`;

export type FieldErrors = Partial<Record<RegistrationField, RegistrationFieldError>>;
