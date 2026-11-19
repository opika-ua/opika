import type { RegistrationField, RegistrationFieldError } from "@opika/contracts";
import {
  PASSWORD_MAX_CHARACTERS,
  PASSWORD_MIN_CHARACTERS,
  SHELTER_DISPLAY_NAME_MAX_CHARACTERS,
} from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { OPERATOR_CONTACT } from "../../brand";

/**
 * The form's strings, picked on the server and handed to the client form as props, so the public
 * bundle carries these few lines and not the whole catalogue.
 */

/** A template split at its `{slots}`: text pieces and the slot names, in order. */
export type TemplatePart = { text: string } | { slot: string };

export function templateParts(template: string): TemplatePart[] {
  return template
    .split(/(\{[a-z]+\})/)
    .filter((piece) => piece !== "")
    .map((piece) => {
      const slot = /^\{([a-z]+)\}$/.exec(piece)?.[1];
      return slot === undefined ? { text: piece } : { slot };
    });
}

const r = uk.registration;

const ERRORS: Record<RegistrationFieldError, string> = {
  required: r.errors.required,
  name_too_long: fillTemplate(uk.kabinet.operator.create.errors.nameTooLong, {
    max: String(SHELTER_DISPLAY_NAME_MAX_CHARACTERS),
  }),
  city: r.errors.city,
  link: r.errors.link,
  contact: r.errors.contact,
  email: r.errors.email,
  password_short: fillTemplate(r.errors.passwordShort, { min: String(PASSWORD_MIN_CHARACTERS) }),
  password_long: fillTemplate(uk.kabinet.password.tooLong, {
    max: String(PASSWORD_MAX_CHARACTERS),
  }),
  password_personal: uk.kabinet.password.personal,
  password_common: uk.kabinet.password.common,
  password_mismatch: r.errors.passwordMismatch,
};

/** «required» on a step-1 field says what goes in it; the other fields keep the generic line. */
const REQUIRED_BY_FIELD: Partial<Record<RegistrationField, string>> = {
  name: r.errors.nameRequired,
  cityId: r.errors.city,
  link: r.errors.linkRequired,
};

export function registrationCopy() {
  const picker = uk.kabinet.cityPicker;
  return {
    labels: {
      name: r.name.label,
      cityId: r.city.label,
      link: r.link.label,
      contact: r.contact.label,
      email: r.email.label,
      password: r.password.label,
      passwordRepeat: r.passwordRepeat.label,
    },
    hints: {
      name: r.name.help,
      cityId: r.city.help,
      link: r.link.help,
      contact: r.contact.help,
      email: r.email.help,
      password: fillTemplate(r.password.help, { min: String(PASSWORD_MIN_CHARACTERS) }),
    },
    placeholders: { link: r.link.placeholder, contact: r.contact.placeholder },
    consent: templateParts(r.consent),
    consentRules: r.consentRules,
    consentPrivacy: r.consentPrivacy,
    submit: r.submit,
    submitting: r.submitting,
    errors: ERRORS,
    requiredBy: REQUIRED_BY_FIELD,
    summary: r.errors.summary,
    rateLimited: r.errors.rateLimited,
    emailTaken: r.errors.emailTaken,
    generic: r.errors.generic,
    dailyCap: fillTemplate(r.errors.dailyCap, { email: OPERATOR_CONTACT.email }),
    signIn: r.emailTakenSignIn,
    resetPassword: r.emailTakenReset,
    showPassword: uk.kabinet.signIn.showPassword,
    hidePassword: uk.kabinet.signIn.hidePassword,
    passwordMin: PASSWORD_MIN_CHARACTERS,
    nameMax: SHELTER_DISPLAY_NAME_MAX_CHARACTERS,
    steps: r.steps,
    next: r.next,
    recap: templateParts(r.recap),
    change: r.change,
    back: r.back,
    cityPicker: {
      placeholder: picker.placeholder,
      tooShort: picker.tooShort,
      loading: picker.loading,
      empty: picker.empty,
      error: picker.error,
      retry: picker.retry,
      found: picker.found,
      clear: picker.clear,
      close: picker.close,
    },
  };
}

export type RegistrationCopy = ReturnType<typeof registrationCopy>;
