import {
  CityIdSchema,
  CONTACT_INPUT_MAX_LENGTH,
  characterCount,
  normalizeAdopterContact,
  normalizePublicLink,
  PASSWORD_MAX_CHARACTERS,
  PASSWORD_MIN_CHARACTERS,
  ShelterDisplayNameInputSchema,
} from "@opika/domain";
import { z } from "zod";

/**
 * Self-registration (2026-11-18): the form on /prytulkam#reyestratsiia posts these fields to a
 * server action, never to an RPC procedure, so it works without JavaScript. Seven fields, a
 * honeypot and a server-signed render time.
 */
export const REGISTRATION_FIELDS = [
  "name",
  "cityId",
  "link",
  "contact",
  "email",
  "password",
  "passwordRepeat",
] as const;
export type RegistrationField = (typeof REGISTRATION_FIELDS)[number];

/** What a field can be wrong with; each maps to one catalogue string (A2). */
export const REGISTRATION_FIELD_ERRORS = [
  "required",
  "name_too_long",
  "city",
  "link",
  "contact",
  "email",
  "password_short",
  "password_long",
  "password_personal",
  "password_common",
  "password_mismatch",
] as const;
export type RegistrationFieldError = (typeof REGISTRATION_FIELD_ERRORS)[number];

/**
 * The input after normalization: the link and the contact arrive canonical (§11.4), the email
 * trimmed and lowercased. The password is never trimmed (see `passwordVerdictOf`).
 */
export const RegistrationInputSchema = z
  .object({
    name: ShelterDisplayNameInputSchema,
    cityId: CityIdSchema,
    link: z
      .string()
      .max(CONTACT_INPUT_MAX_LENGTH)
      .transform((raw, ctx) => {
        const link = normalizePublicLink(raw);
        if (link.kind === "ok") return link.url;
        ctx.addIssue({ code: "custom", message: "link" });
        return z.NEVER;
      }),
    /** Optional (owner, 2026-11-19): left empty it is null; anything typed must still be valid. */
    contact: z
      .string()
      .max(CONTACT_INPUT_MAX_LENGTH)
      .transform((raw, ctx) => {
        if (raw.trim() === "") return null;
        const contact = normalizeAdopterContact(raw);
        if (contact.kind === "ok") return contact.channel;
        ctx.addIssue({ code: "custom", message: "contact" });
        return z.NEVER;
      }),
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    // Length only: the personal-part and common-list checks (`passwordVerdictOf`) need app config.
    password: z
      .string()
      .refine((p) => characterCount(p) >= PASSWORD_MIN_CHARACTERS, { message: "password_short" })
      .refine((p) => characterCount(p) <= PASSWORD_MAX_CHARACTERS, { message: "password_long" }),
    passwordRepeat: z.string().max(PASSWORD_MAX_CHARACTERS * 4),
    /**
     * The honeypot (§11.3): visually hidden, named so password managers leave it alone. Anything
     * typed in it means a bot, and the action discards the submission silently.
     */
    hp: z.string().max(256),
    /** `HMAC(issuedAt)`, rendered by the server; checked for a minimum fill time and an age cap. */
    formStamp: z.string().max(256),
  })
  .refine((input) => input.password === input.passwordRepeat, {
    path: ["passwordRepeat"],
    message: "password_mismatch",
  });
export type RegistrationInput = z.infer<typeof RegistrationInputSchema>;

/**
 * What the action answers. `registered` carries where the client goes with a full page load
 * (`window.location.assign`, never `redirect()` into /kabinet: #509); without JavaScript the action
 * answers a 303 to the same place. A honeypot hit answers `registered` too, and nothing is written.
 * A too-fast submit is `failed`, so a real person retries instead of landing nowhere.
 */
export type RegistrationResult =
  /** `/kabinet/vkhid` when the account was written but the sign-in after it failed. */
  | { kind: "registered"; next: "/kabinet" | "/kabinet/vkhid" }
  | { kind: "invalid"; fields: Partial<Record<RegistrationField, RegistrationFieldError>> }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  /** The address already has an account (Q-B1, owner: shown, with sign-in and reset links). */
  | { kind: "email_taken" }
  | { kind: "failed" };

/** The form's reason codes for logs and Sentry: never a field value (§11.8). */
export const REGISTRATION_FAILURE_REASONS = [
  "invalid",
  "honeypot",
  "too_fast",
  "stamp_invalid",
  "rate_limited",
  "email_taken",
  "write_failed",
  "sign_in_failed",
] as const;
export type RegistrationFailureReason = (typeof REGISTRATION_FAILURE_REASONS)[number];
