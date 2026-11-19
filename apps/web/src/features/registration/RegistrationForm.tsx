"use client";

import type { RegistrationField } from "@opika/contracts";
import { normalizeAdopterContact, normalizePublicLink } from "@opika/domain";
import { fillTemplate } from "@opika/i18n/public";
import {
  type ReactNode,
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Button } from "../../ui/Button";
import { Combobox, type ComboboxOption, type ComboboxResult } from "../../ui/Combobox";
import { cx } from "../../ui/cx";
import { ErrorSummary, type ErrorSummaryItem, errorFocusOf } from "../../ui/ErrorSummary";
import { InlineStatus } from "../../ui/feedback";
import { TextField } from "../../ui/form";
import { PasswordField } from "../../ui/PasswordField";
import { Text } from "../../ui/Text";
import { TextLink } from "../../ui/TextLink";
import { KabinetEntryLink } from "../kabinet/KabinetEntryLink";
import {
  CITY_NAME_NAME,
  FIELD_ORDER,
  type FieldErrors,
  fieldIdOf,
  HONEYPOT_NAME,
  PRIVACY_HREF,
  REGISTRATION_ANCHOR,
  type RegistrationAction,
  type RegistrationCitySearch,
  type RegistrationFormState,
  RULES_HREF,
} from "./form-state";
import type { RegistrationCopy, TemplatePart } from "./registration-copy";

const subscribeNothing = () => () => undefined;

/** True once React runs in the browser: the form then posts through the action, not natively. */
const useHydrated = (): boolean =>
  useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );

const TEXT_BUTTON =
  "inline-flex min-h-target cursor-pointer items-center text-ink underline underline-offset-4 focus-ring";

const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const characters = (text: string): number => [...text].length;

/** A template's slots replaced by nodes, its text kept as it is. */
function filled(parts: readonly TemplatePart[], slots: Record<string, ReactNode>): ReactNode[] {
  return parts.map((part, index) =>
    "text" in part ? (
      <span key={index}>{part.text}</span>
    ) : (
      <span key={index}>{slots[part.slot] ?? null}</span>
    ),
  );
}

type TextKey = "name" | "link" | "contact" | "email";
type Step = 1 | 2;

const STEP_ONE: readonly RegistrationField[] = ["name", "cityId", "link", "contact"];
const stepOf = (field: RegistrationField): Step => (STEP_ONE.includes(field) ? 1 : 2);

/** The step that holds the first refused field, in the form's order. */
const firstStepOf = (errors: FieldErrors): Step => {
  const first = FIELD_ORDER.find((field) => errors[field] !== undefined);
  return first === undefined ? 1 : stepOf(first);
};

/** What the next render focuses: the shown step's label, one field, or the refused fields. */
type FocusRequest =
  | { kind: "step"; n: number }
  | { kind: "errors"; n: number }
  | { kind: "field"; field: RegistrationField; n: number };
type FocusAsk = { kind: "step" } | { kind: "errors" } | { kind: "field"; field: RegistrationField };

/**
 * The registration form: seven fields in two steps, one form and one action. Without JS both steps
 * render as one form that posts natively; with JS the steps show one at a time, the action keeps
 * what was typed, and success leaves for the kabinet with a full page load (#509).
 */
export function RegistrationForm({
  action,
  searchCities,
  initial,
  copy,
  headingId,
}: {
  action: RegistrationAction;
  searchCities: RegistrationCitySearch;
  initial: RegistrationFormState;
  copy: RegistrationCopy;
  headingId: string;
}) {
  // Without JS the server renders the action's answer as `state` (values, errors, a stamp).
  const [state, formAction, pending] = useActionState(action, initial);
  const hydrated = useHydrated();
  const [text, setText] = useState<Record<TextKey, string>>({
    name: state.values.name,
    link: state.values.link,
    contact: state.values.contact,
    email: state.values.email,
  });
  const [city, setCity] = useState<ComboboxOption | null>(
    state.values.city === null
      ? null
      : { value: state.values.city.id, label: state.values.city.label },
  );
  const [passwords, setPasswords] = useState({ password: "", passwordRepeat: "" });
  const [serverErrors, setServerErrors] = useState<FieldErrors>(
    state.result?.kind === "invalid" ? state.result.fields : {},
  );
  const [blurErrors, setBlurErrors] = useState<FieldErrors>({});
  const [step, setStep] = useState<Step>(() => firstStepOf(serverErrors));
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const answered = useRef(initial);
  const stepHeadingId = (of: Step) => (of === 1 ? headingId : `${headingId}-2`);
  const requestFocus = (ask: FocusAsk) =>
    setFocusRequest((now) => ({ ...ask, n: (now?.n ?? 0) + 1 }));
  const refuse = (errors: FieldErrors) => {
    setServerErrors(errors);
    setStep(firstStepOf(errors));
    requestFocus({ kind: "errors" });
  };

  // Each answer once: errors to show, or the way into the kabinet.
  useEffect(() => {
    if (answered.current === state) return;
    answered.current = state;
    const result = state.result;
    if (result?.kind === "registered") {
      window.location.assign(result.next);
      return;
    }
    if (result?.kind === "invalid") refuse(result.fields);
    else setServerErrors({});
    setBlurErrors({});
    if (state.values.city !== null) {
      setCity({ value: state.values.city.id, label: state.values.city.label });
    }
  }, [state]);

  // After the render that shows the right step: its label, the one field, or the summary.
  useEffect(() => {
    if (focusRequest === null) return;
    const byId = (id: string) => document.getElementById(id)?.focus();
    if (focusRequest.kind === "step") byId(stepHeadingId(step));
    else if (focusRequest.kind === "field") byId(fieldIdOf(focusRequest.field));
    else {
      const focus = errorFocusOf(summary);
      if (focus.kind === "summary") summaryRef.current?.focus();
      if (focus.kind === "field") byId(fieldIdOf(focus.item.key as RegistrationField));
    }
  }, [focusRequest]);

  // A direct link to the section (`/prytulkam#reyestratsiia`) lands on its heading.
  useEffect(() => {
    if (window.location.hash === `#${REGISTRATION_ANCHOR}`) {
      document.getElementById(headingId)?.focus({ preventScroll: true });
    }
  }, [headingId]);

  const errorOf = (field: RegistrationField): string | null => {
    const code = blurErrors[field] ?? serverErrors[field];
    if (code === undefined) return null;
    return code === "required"
      ? (copy.requiredBy[field] ?? copy.errors.required)
      : copy.errors[code];
  };
  const clear = (field: RegistrationField) => {
    setServerErrors(({ [field]: _gone, ...rest }) => rest);
    setBlurErrors(({ [field]: _gone, ...rest }) => rest);
  };
  const flag = (field: RegistrationField, error: FieldErrors[RegistrationField] | null) =>
    setBlurErrors((now) => {
      const { [field]: _gone, ...rest } = now;
      return error === null || error === undefined ? rest : { ...rest, [field]: error };
    });

  const onTextBlur = (key: TextKey) => {
    const value = text[key].trim();
    if (value === "") return;
    if (key === "email" && !EMAIL_SHAPE.test(value)) flag("email", "email");
  };
  const onPasswordBlur = (field: "password" | "passwordRepeat") => {
    const { password, passwordRepeat } = passwords;
    if (field === "password" && password !== "" && characters(password) < copy.passwordMin) {
      flag("password", "password_short");
    }
    if (passwordRepeat !== "" && password !== passwordRepeat) {
      flag("passwordRepeat", "password_mismatch");
    }
  };

  const search = useCallback(
    async (query: string): Promise<ComboboxResult> => {
      const answer = await searchCities(query);
      if (answer.kind === "failed") throw new Error("city search failed");
      return answer;
    },
    [searchCities],
  );
  const pickerMessages = useMemo(
    () => ({
      ...copy.cityPicker,
      found: (count: number) => fillTemplate(copy.cityPicker.found, { count: String(count) }),
    }),
    [copy.cityPicker],
  );

  // The summary names the fields; each field says its own problem (R1's kit practice).
  const summary: ErrorSummaryItem[] = FIELD_ORDER.flatMap((field) =>
    serverErrors[field] === undefined
      ? []
      : [
          {
            key: field,
            label: copy.labels[field],
            target: `#${fieldIdOf(field)}`,
            onSelect: () => {
              setStep(stepOf(field));
              requestFocus({ kind: "field", field });
            },
          },
        ],
  );
  const showSummary = errorFocusOf(summary).kind === "summary";

  /** «Далі»: step 1's fields must be there and well-formed before step 2; the server re-checks. */
  const next = () => {
    const errors: FieldErrors = {};
    const name = text.name.trim();
    if (name === "") errors.name = "required";
    else if (characters(name) > copy.nameMax) errors.name = "name_too_long";
    if (city === null) errors.cityId = "city";
    const link = text.link.trim();
    if (link === "") errors.link = "required";
    else if (normalizePublicLink(link).kind === "invalid") errors.link = "link";
    const contact = text.contact.trim();
    if (contact === "") errors.contact = "required";
    else if (normalizeAdopterContact(contact).kind === "invalid") errors.contact = "contact";
    if (Object.keys(errors).length > 0) {
      refuse(errors);
      return;
    }
    setServerErrors(({ name: _n, cityId: _c, link: _l, contact: _k, ...rest }) => rest);
    setStep(2);
    requestFocus({ kind: "step" });
  };
  const back = () => {
    setStep(1);
    requestFocus({ kind: "step" });
  };
  // Without JS both steps are one form: nothing hides and the step controls stay out.
  const stepped = hydrated;
  const stepHeader = (of: Step) => (
    <div className="flex flex-col gap-3">
      <h2 id={stepHeadingId(of)} tabIndex={-1} className="text-label text-ink-2 focus-ring">
        {of === 1 ? copy.steps.one : copy.steps.two}
      </h2>
      <div aria-hidden="true" className="grid grid-cols-2 gap-1.5">
        <span className="h-1.5 rounded-pill bg-accent" />
        <span className={cx("h-1.5 rounded-pill", of === 2 ? "bg-accent" : "bg-line")} />
      </div>
    </div>
  );
  const result = state.result;
  const leaving = result?.kind === "registered";

  const textField = (
    key: TextKey,
    attributes: {
      autoComplete: string;
      inputMode?: "email" | "url" | "tel" | "text";
      type?: "email" | "url" | "tel" | "text";
      placeholder?: string;
    },
  ) => (
    <TextField
      id={fieldIdOf(key)}
      name={key}
      label={copy.labels[key]}
      hint={copy.hints[key]}
      error={errorOf(key)}
      // The adopter contact is optional (owner, 2026-11-19); the label says so.
      required={key !== "contact"}
      value={text[key]}
      onChange={(event) => {
        const value = event.target.value;
        setText((now) => ({ ...now, [key]: value }));
        clear(key);
      }}
      onBlur={() => onTextBlur(key)}
      autoCapitalize={key === "name" ? "sentences" : "none"}
      spellCheck={key === "name"}
      {...attributes}
    />
  );

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      {showSummary ? (
        <ErrorSummary ref={summaryRef} heading={copy.summary} items={summary} />
      ) : null}
      {result?.kind === "rate_limited" ? (
        <InlineStatus tone="error">{copy.rateLimited}</InlineStatus>
      ) : null}
      {result?.kind === "email_taken" ? (
        <InlineStatus tone="error">
          <span className="flex flex-col gap-2">
            <span>{copy.emailTaken}</span>
            {/* Plain links, full loads into the kabinet (#509). */}
            <span className="flex flex-wrap gap-x-6 gap-y-2">
              <KabinetEntryLink
                to="signIn"
                className="inline-flex min-h-target items-center underline underline-offset-4 focus-ring"
              >
                {copy.signIn}
              </KabinetEntryLink>
              <KabinetEntryLink
                to="forgot"
                className="inline-flex min-h-target items-center underline underline-offset-4 focus-ring"
              >
                {copy.resetPassword}
              </KabinetEntryLink>
            </span>
          </span>
        </InlineStatus>
      ) : null}
      {result?.kind === "failed" ? <InlineStatus tone="error">{copy.generic}</InlineStatus> : null}
      {result?.kind === "daily_cap" ? (
        <InlineStatus tone="error">{copy.dailyCap}</InlineStatus>
      ) : null}

      <div hidden={stepped && step !== 1} className="flex flex-col gap-5">
        {stepHeader(1)}
        {textField("name", { autoComplete: "organization", type: "text", inputMode: "text" })}
        {hydrated ? (
          <Combobox
            id={fieldIdOf("cityId")}
            name="cityId"
            label={copy.labels.cityId}
            hint={copy.hints.cityId}
            error={errorOf("cityId")}
            required
            value={city}
            onChange={(next) => {
              setCity(next);
              clear("cityId");
            }}
            search={search}
            messages={pickerMessages}
          />
        ) : (
          // Without JS the picker can't search, so the city is typed and matched on the server.
          <TextField
            id={fieldIdOf("cityId")}
            name={CITY_NAME_NAME}
            label={copy.labels.cityId}
            hint={copy.hints.cityId}
            error={errorOf("cityId")}
            required
            autoComplete="off"
            defaultValue={state.values.city?.label ?? state.values.cityName}
          />
        )}
        {textField("link", {
          autoComplete: "url",
          type: "url",
          inputMode: "url",
          placeholder: copy.placeholders.link,
        })}
        {textField("contact", {
          autoComplete: "tel",
          type: "text",
          inputMode: "tel",
          placeholder: copy.placeholders.contact,
        })}
        {stepped ? (
          <Button type="button" variant="primary" size="lg" className="w-full" onClick={next}>
            {copy.next}
          </Button>
        ) : null}
      </div>

      <div hidden={stepped && step !== 2} className="flex flex-col gap-5">
        {stepHeader(2)}
        {stepped ? (
          <p className="text-body text-ink-2">
            {filled(copy.recap, { name: text.name.trim(), city: city?.label ?? "" })}{" "}
            <button type="button" onClick={back} className={TEXT_BUTTON}>
              {copy.change}
            </button>
          </p>
        ) : null}
        {textField("email", { autoComplete: "email", type: "email", inputMode: "email" })}
        {(["password", "passwordRepeat"] as const).map((field) => (
          <PasswordField
            key={field}
            id={fieldIdOf(field)}
            name={field}
            label={copy.labels[field]}
            hint={field === "password" ? copy.hints.password : undefined}
            error={errorOf(field)}
            autoComplete="new-password"
            required
            value={passwords[field]}
            onChange={(event) => {
              const value = event.target.value;
              setPasswords((now) => ({ ...now, [field]: value }));
              clear(field);
            }}
            onBlur={() => onPasswordBlur(field)}
            showLabel={copy.showPassword}
            hideLabel={copy.hidePassword}
          />
        ))}

        {/* The honeypot (§11.3): out of sight and out of reach, a name no autofill knows. */}
        <div aria-hidden="true" className="sr-only">
          <input
            type="text"
            name={HONEYPOT_NAME}
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </div>
        <input type="hidden" name="formStamp" value={state.formStamp} />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          status={pending || leaving ? "loading" : "idle"}
          className="w-full"
        >
          {pending || leaving ? copy.submitting : copy.submit}
        </Button>
        <Text look="hint">
          {filled(copy.consent, {
            rules: <TextLink href={RULES_HREF}>{copy.consentRules}</TextLink>,
            privacy: <TextLink href={PRIVACY_HREF}>{copy.consentPrivacy}</TextLink>,
          })}
        </Text>
        {stepped ? (
          <button type="button" onClick={back} className={cx(TEXT_BUTTON, "self-start text-body")}>
            {copy.back}
          </button>
        ) : null}
      </div>
    </form>
  );
}
