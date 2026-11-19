"use client";

import type { RegistrationField } from "@opika/contracts";
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
import { ErrorSummary } from "../../ui/ErrorSummary";
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

/**
 * The registration form (spec §13.2, §13.3): seven fields, kit components only. Progressively
 * enhanced: without JS it posts natively and the server renders the answer (or answers a 303);
 * with JS it posts through the action, keeps what was typed, and on success leaves for the
 * kabinet with a full page load (#509).
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
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const answered = useRef(initial);

  // Each answer once: errors to show, or the way into the kabinet.
  useEffect(() => {
    if (answered.current === state) return;
    answered.current = state;
    const result = state.result;
    if (result?.kind === "registered") {
      window.location.assign(result.next);
      return;
    }
    setServerErrors(result?.kind === "invalid" ? result.fields : {});
    setBlurErrors({});
    if (state.values.city !== null) {
      setCity({ value: state.values.city.id, label: state.values.city.label });
    }
  }, [state]);

  useEffect(() => {
    if (Object.keys(serverErrors).length > 0) summaryRef.current?.focus();
  }, [serverErrors]);

  // A direct link to the section (`/prytulkam#reyestratsiia`) lands on its heading.
  useEffect(() => {
    if (window.location.hash === `#${REGISTRATION_ANCHOR}`) {
      document.getElementById(headingId)?.focus({ preventScroll: true });
    }
  }, [headingId]);

  const errorOf = (field: RegistrationField): string | null => {
    const code = blurErrors[field] ?? serverErrors[field];
    return code === undefined ? null : copy.errors[code];
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

  const summary = FIELD_ORDER.flatMap((field) => {
    const message = errorOf(field);
    return message === null || serverErrors[field] === undefined
      ? []
      : [{ key: field, label: message, target: `#${fieldIdOf(field)}` }];
  });
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
      {summary.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Text look="label">{copy.summary}</Text>
          <ErrorSummary ref={summaryRef} items={summary} />
        </div>
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
        <input type="text" name={HONEYPOT_NAME} tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      <input type="hidden" name="formStamp" value={state.formStamp} />

      <Button
        type="submit"
        variant="primary"
        size="lg"
        status={pending || leaving ? "loading" : "idle"}
        className="w-full tablet:w-auto tablet:self-start"
      >
        {pending || leaving ? copy.submitting : copy.submit}
      </Button>
      <Text look="hint">
        {filled(copy.consent, {
          rules: <TextLink href={RULES_HREF}>{copy.consentRules}</TextLink>,
          privacy: <TextLink href={PRIVACY_HREF}>{copy.consentPrivacy}</TextLink>,
        })}
      </Text>
    </form>
  );
}
