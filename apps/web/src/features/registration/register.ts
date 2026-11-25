import {
  REGISTRATION_FIELD_ERRORS,
  REGISTRATION_FIELDS,
  type RegistrationFailureReason,
  type RegistrationField,
  type RegistrationFieldError,
  RegistrationInputSchema,
} from "@opika/contracts";
import type { SelfRegistrationOutcome, SelfRegistrationWrite } from "@opika/db/repos";
import {
  type CityId,
  cityPublicLocationOf,
  type PasswordVerdict,
  type Shelter,
  type ShelterAdminId,
  ShelterContactSchema,
  type ShelterId,
} from "@opika/domain";
import { type FormStampVerdict, formStampVerdictOf } from "./form-stamp";
import {
  CITY_NAME_NAME,
  EMPTY_VALUES,
  type FieldErrors,
  HONEYPOT_NAME,
  type RegistrationAnswer,
  type RegistrationCity,
  type RegistrationFormState,
  type RegistrationValues,
} from "./form-state";
import type { Allowance } from "./limits";

/** The confirmation links are good for 14 days, the abandoned-application window (D8). */
export const REGISTRATION_LINK_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type RegistrationSignIn =
  | { kind: "signed_in"; userId: string; setCookies: string[] }
  | { kind: "refused" };

/** What a registration is told after the write, for the confirmation email. */
export type RegisteredApplication = {
  userId: string;
  shelterId: ShelterId;
  name: string;
  email: string;
  confirmToken: string;
  notMeToken: string;
};

/** A budget's answer: `unavailable` is a store that couldn't be asked (owner, 2026-11-20). */
export type { Allowance } from "./limits";

export type RegisterDeps = {
  now: Date;
  /** The stamp's key (`derivedSecretKey(FORM_STAMP_KEY_LABEL)`). */
  stampKey: string;
  issueStamp: (issuedAt: Date) => string;
  /** Per IP (an hour and a day), charged on every submit past the honeypot and the stamp. */
  allowIp: () => Promise<Allowance>;
  /** Per address, charged once the input is valid. */
  allowAddress: (email: string) => Promise<Allowance>;
  /** A current settlement by id, or (no JS) by its exact name; null when there's no such one. */
  resolveCity: (
    by: { kind: "id"; id: string } | { kind: "name"; name: string },
  ) => Promise<RegistrationCity | null>;
  passwordVerdict: (
    password: string,
    subject: { email: string; shelterName: string },
  ) => PasswordVerdict;
  /** A read: the address already has an account (the write checks again, race-safe). */
  hasAccount: (email: string) => Promise<boolean>;
  /** Takes one of the day's confirmation emails (`REGISTRATION_MAIL_DAILY_CAP`); false at the cap. */
  takeDailyMail: () => Promise<boolean>;
  hashPassword: (password: string) => Promise<string>;
  write: (input: SelfRegistrationWrite) => Promise<SelfRegistrationOutcome>;
  newId: () => string;
  newToken: () => string;
  hashToken: (token: string) => string;
  /** After the write: the funnel's `registered` and the confirmation email. Never fails the action. */
  afterRegistration: (application: RegisteredApplication) => Promise<void>;
  signIn: (email: string, password: string) => Promise<RegistrationSignIn>;
  setCookies: (cookies: readonly string[]) => Promise<void>;
  /** Reason codes only, never a value someone typed (§11.8). */
  log: (reason: RegistrationLogReason) => void;
};

export type RegistrationLogReason = RegistrationFailureReason | "daily_cap";

type Raw = Record<RegistrationField | "hp" | "formStamp" | "cityName", string>;

const text = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

function rawOf(form: FormData): Raw {
  return {
    name: text(form, "name"),
    cityId: text(form, "cityId"),
    cityName: text(form, CITY_NAME_NAME),
    link: text(form, "link"),
    contact: text(form, "contact"),
    email: text(form, "email"),
    password: text(form, "password"),
    passwordRepeat: text(form, "passwordRepeat"),
    hp: text(form, HONEYPOT_NAME),
    formStamp: text(form, "formStamp"),
  };
}

const isFieldError = (message: string): message is RegistrationFieldError =>
  (REGISTRATION_FIELD_ERRORS as readonly string[]).includes(message);

const isField = (key: unknown): key is RegistrationField =>
  typeof key === "string" && (REGISTRATION_FIELDS as readonly string[]).includes(key);

/** What a field's schema refusal means, when the schema's message isn't already one of the codes. */
const FALLBACK: Record<RegistrationField, RegistrationFieldError> = {
  name: "name_too_long",
  cityId: "city",
  link: "link",
  contact: "contact",
  email: "email",
  password: "password_short",
  passwordRepeat: "password_mismatch",
};

const VERDICT_ERRORS: Record<Exclude<PasswordVerdict["kind"], "ok">, RegistrationFieldError> = {
  too_short: "password_short",
  too_long: "password_long",
  contains_personal: "password_personal",
  common: "password_common",
};

const valuesOf = (raw: Raw, city: RegistrationCity | null): RegistrationValues => ({
  name: raw.name,
  city,
  cityName: raw.cityName,
  link: raw.link,
  contact: raw.contact,
  email: raw.email,
});

/**
 * The registration form's POST (spec §13, plan Agent 1), in this order: the honeypot (silent),
 * the signed render time, the per-IP budgets, the fields, the per-address budget, a taken
 * address, the day's email cap, then one atomic write, the funnel and the email, and the sign-in. Answers a state the form renders as it is;
 * the caller turns `registered` into a full page load.
 */
export async function registerWith(
  form: FormData,
  deps: RegisterDeps,
): Promise<RegistrationFormState> {
  const raw = rawOf(form);
  const state = (
    result: RegistrationAnswer,
    values: RegistrationValues,
    issuedAt: Date,
  ): RegistrationFormState => ({ result, values, formStamp: deps.issueStamp(issuedAt) });

  // A bot filled the hidden field: it is told it worked, and nothing is written.
  if (raw.hp !== "") {
    deps.log("honeypot");
    return state({ kind: "registered", next: "/kabinet" }, EMPTY_VALUES, deps.now);
  }

  const stamp: FormStampVerdict = formStampVerdictOf(raw.formStamp, deps.stampKey, deps.now);
  if (stamp.kind === "invalid") {
    deps.log("stamp_invalid");
    return state({ kind: "failed" }, valuesOf(raw, null), deps.now);
  }
  // The render time carries over, so a retry a moment later passes.
  const issuedAt = stamp.issuedAt;
  if (stamp.kind === "too_fast") {
    deps.log("too_fast");
    return state({ kind: "failed" }, valuesOf(raw, null), issuedAt);
  }

  const perIp = await deps.allowIp();
  if (perIp.kind === "unavailable") {
    deps.log("limiter_unavailable");
    return state({ kind: "limiter_unavailable" }, valuesOf(raw, null), issuedAt);
  }
  if (perIp.kind === "limited") {
    deps.log("rate_limited");
    return state(
      { kind: "rate_limited", retryAfterSeconds: perIp.retryAfterSeconds },
      valuesOf(raw, null),
      issuedAt,
    );
  }

  const cityGiven = raw.cityId.trim() !== "" || raw.cityName.trim() !== "";
  const city =
    raw.cityId.trim() !== ""
      ? await deps.resolveCity({ kind: "id", id: raw.cityId.trim() })
      : raw.cityName.trim() !== ""
        ? await deps.resolveCity({ kind: "name", name: raw.cityName.trim() })
        : null;
  const values = valuesOf(raw, city);

  const fields: FieldErrors = {};
  const parsed = RegistrationInputSchema.safeParse({
    ...raw,
    cityId: city?.id ?? "",
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (!isField(field) || fields[field] !== undefined) continue;
      const empty = field === "cityId" ? !cityGiven : raw[field].trim() === "";
      fields[field] = empty
        ? "required"
        : isFieldError(issue.message)
          ? issue.message
          : FALLBACK[field];
    }
  }
  // An object refinement doesn't run while a field fails, so the mismatch is checked here too.
  if (fields.passwordRepeat === undefined && raw.passwordRepeat === "") {
    fields.passwordRepeat = "required";
  } else if (fields.passwordRepeat === undefined && raw.passwordRepeat !== raw.password) {
    fields.passwordRepeat = "password_mismatch";
  }
  if (parsed.success && Object.keys(fields).length === 0) {
    const verdict = deps.passwordVerdict(parsed.data.password, {
      email: parsed.data.email,
      shelterName: parsed.data.name,
    });
    if (verdict.kind !== "ok") fields.password = VERDICT_ERRORS[verdict.kind];
  }
  // An empty field is valid and stores no contact; the shelter adds one before it can publish.
  const contact = !parsed.success
    ? null
    : parsed.data.contact === null
      ? ({ success: true, data: null } as const)
      : ShelterContactSchema.safeParse({ primary: parsed.data.contact, additional: [] });
  if (contact?.success === false && fields.contact === undefined) fields.contact = "contact";
  if (!parsed.success || contact === null || !contact.success || Object.keys(fields).length > 0) {
    deps.log("invalid");
    return state({ kind: "invalid", fields }, values, issuedAt);
  }
  const input = parsed.data;

  const perAddress = await deps.allowAddress(input.email);
  if (perAddress.kind === "unavailable") {
    deps.log("limiter_unavailable");
    return state({ kind: "limiter_unavailable" }, values, issuedAt);
  }
  if (perAddress.kind === "limited") {
    deps.log("rate_limited");
    return state(
      { kind: "rate_limited", retryAfterSeconds: perAddress.retryAfterSeconds },
      values,
      issuedAt,
    );
  }

  // Checked before the cap, so a taken address spends none of the day's emails.
  if (await deps.hasAccount(input.email)) {
    deps.log("email_taken");
    return state({ kind: "email_taken" }, values, issuedAt);
  }
  // Before any write: no application exists without its confirmation email.
  if (!(await deps.takeDailyMail())) {
    deps.log("daily_cap");
    return state({ kind: "daily_cap" }, values, issuedAt);
  }

  const userId = deps.newId();
  const shelterId = deps.newId() as ShelterId;
  const confirmToken = deps.newToken();
  const notMeToken = deps.newToken();
  const expiresAt = new Date(deps.now.getTime() + REGISTRATION_LINK_TTL_MS);
  const shelter: Shelter = {
    id: shelterId,
    displayName: input.name,
    description: null,
    legalEntity: null,
    publicLocation: cityPublicLocationOf(input.cityId as CityId, null),
    premises: { kind: "not_recorded" },
    contact: contact.data,
    donation: null,
    logo: null,
    pendingDonation: null,
    earlyListingSince: null,
    freshnessReminderOffAt: null,
    version: 0,
    verification: {
      status: "application",
      appliedAt: deps.now,
      evidence: { items: [{ kind: "public_link", url: input.link }], submittedAt: deps.now },
    },
    createdAt: deps.now,
    lastUpdatedAt: deps.now,
  };

  let outcome: SelfRegistrationOutcome;
  try {
    outcome = await deps.write({
      userId,
      email: input.email,
      accountId: deps.newId(),
      passwordHash: await deps.hashPassword(input.password),
      organizationId: deps.newId(),
      memberId: deps.newId(),
      shelter,
      history: {
        id: deps.newId(),
        entry: {
          kind: "shelter_registered",
          at: deps.now,
          shelterAdminId: userId as ShelterAdminId,
        },
      },
      tokens: [
        { tokenHash: deps.hashToken(confirmToken), purpose: "confirm_email", expiresAt },
        { tokenHash: deps.hashToken(notMeToken), purpose: "not_me", expiresAt },
      ],
      now: deps.now,
    });
  } catch {
    deps.log("write_failed");
    return state({ kind: "failed" }, values, issuedAt);
  }
  if (outcome.kind === "email_taken") {
    deps.log("email_taken");
    return state({ kind: "email_taken" }, values, issuedAt);
  }

  try {
    await deps.afterRegistration({
      userId,
      shelterId,
      name: input.name,
      email: input.email,
      confirmToken,
      notMeToken,
    });
  } catch {
    // The account stands; the kabinet's banner can resend the email.
  }

  const signedIn = await deps
    .signIn(input.email, input.password)
    .catch((): RegistrationSignIn => ({ kind: "refused" }));
  // Only this account's session is ever handed to the browser.
  if (signedIn.kind === "refused" || signedIn.userId !== userId) {
    deps.log("sign_in_failed");
    return state({ kind: "registered", next: "/kabinet/vkhid" }, EMPTY_VALUES, deps.now);
  }
  await deps.setCookies(signedIn.setCookies);
  return state({ kind: "registered", next: "/kabinet" }, EMPTY_VALUES, deps.now);
}

/**
 * Next's client calls a server action with a `Next-Action` header (`getServerActionRequestMetadata`,
 * Next 16); a native form post carries the action id in its body instead.
 */
export const SERVER_ACTION_CALL_HEADER = "next-action";

/**
 * Where a native (no-JS) post goes after a registration: the action answers a 303 there, a new
 * document by definition (#509). The client's own call leaves by `window.location.assign`.
 */
export function nativePostRedirectOf(
  state: RegistrationFormState,
  requestHeaders: Headers,
): string | null {
  const result = state.result;
  return result?.kind === "registered" && requestHeaders.get(SERVER_ACTION_CALL_HEADER) === null
    ? result.next
    : null;
}

/** What was typed, for an answer given before `registerWith` reads anything (never the passwords). */
export const typedValuesOf = (form: FormData): RegistrationValues => valuesOf(rawOf(form), null);
