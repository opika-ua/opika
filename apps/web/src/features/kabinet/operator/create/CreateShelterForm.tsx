"use client";

import type { CreatedShelterView } from "@opika/contracts";
import { kyivCalendarDateOf } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import Link from "next/link";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import {
  Button,
  buttonClass,
  SelectField,
  TextAreaField,
  TextField,
} from "../../../controls/controls";
import { ContactFields, NO_CONTACT_ERRORS } from "../../profile-edit/ContactFields";
import {
  BODY,
  CAPTION,
  CARD,
  CARD_TITLE,
  DIALOG_TITLE,
  ERROR_TEXT,
  STRONG,
} from "../../profile-edit/styles";
import { OPERATOR_HOME } from "../../routes";
import { EvidenceEditor } from "../evidence-editor/EvidenceEditor";
import { CreatedShelter } from "./CreatedShelter";
import {
  type CreateField,
  type CreateFieldError,
  type CreateShelterForm as CreateForm,
  type CreateFormErrors,
  createInputOf,
  emptyCreateForm,
  LEGAL_KINDS,
  type LegalForm,
  noCreateErrors,
} from "./create-input";
import { type CreateRefusal, createRefusalOf, refusalMessage } from "./create-outcome";
import { type RegistryCreateClient, registryCreateBrowserClient } from "./registry-create-client";

export type CityOption = { id: string; name: string };

/** Where S2 stands. A submission is one request; nothing retries it (RU-T9). */
type Phase =
  | { kind: "editing"; refusal: CreateRefusal | null }
  | { kind: "submitting" }
  | { kind: "created"; view: CreatedShelterView };

const fieldMessage = (error: CreateFieldError | undefined): string | null => {
  if (error === undefined) return null;
  return error === "emailFormat"
    ? uk.kabinet.profileEdit.errors.emailFormat
    : uk.kabinet.operator.create.errors[error];
};

/**
 * S2 · Новий притулок (`docs/r-ui-plan.md` §1, KABINET.md S2 and N22): one
 * page, not a wizard. The operator enters the shelter, its premises, its
 * legal data and contacts, the evidence, and its first admin (required,
 * Oleksii, 2026-10-17, answer 6: "Yes: the first admin is required at
 * create."), then presses once. The shelter starts «Очікує»; creating never
 * decides verification (answer 4: "Pending → «Взяти на розгляд» →
 * «Схвалити», no shortcut").
 *
 * The form is checked by `createInputOf` before anything is sent, and the
 * server checks it again with the contract's own schema. One request per
 * press: a second press while one is in flight does nothing (the ref guard,
 * not the re-render, decides, so a double click can't slip through), and a
 * lost answer is never retried, because create is not idempotent.
 */
export function CreateShelterForm({
  cities,
  client = registryCreateBrowserClient,
  now = () => new Date(),
}: {
  cities: readonly CityOption[];
  client?: RegistryCreateClient;
  /** The clock, injectable so a test can stand at Kyiv's midnight. */
  now?: () => Date;
}) {
  const t = uk.kabinet.operator.create;
  const id = useId();
  const [form, setForm] = useState<CreateForm>(emptyCreateForm);
  const [errors, setErrors] = useState<CreateFormErrors>(noCreateErrors);
  const [phase, setPhase] = useState<Phase>({ kind: "editing", refusal: null });
  const [focusFirstError, setFocusFirstError] = useState(0);
  const inFlight = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const today = kyivCalendarDateOf(now());

  useEffect(() => {
    if (focusFirstError === 0) return;
    const target =
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ??
      document.getElementById(`${id}-contacts-phone`);
    target?.focus();
  }, [focusFirstError, id]);

  if (phase.kind === "created") {
    return <CreatedShelter view={phase.view} client={client} />;
  }

  const set = <K extends keyof CreateForm>(key: K, value: CreateForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const setLegal = (patch: Partial<LegalForm>) =>
    setForm((current) => ({ ...current, legal: { ...current.legal, ...patch } }));
  const err = (field: CreateField) => fieldMessage(errors.fields[field]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;
    const checked = createInputOf(form, now());
    if (checked.kind === "invalid") {
      setErrors(checked.errors);
      setPhase({ kind: "editing", refusal: null });
      setFocusFirstError((n) => n + 1);
      return;
    }
    setErrors(noCreateErrors());
    inFlight.current = true;
    setPhase({ kind: "submitting" });
    try {
      const view = await client.registry.shelters.create(checked.input);
      setPhase({ kind: "created", view });
    } catch (error) {
      setPhase({ kind: "editing", refusal: createRefusalOf(error) });
    } finally {
      inFlight.current = false;
    }
  };

  const submitting = phase.kind === "submitting";
  const refusal = phase.kind === "editing" ? phase.refusal : null;
  const legal = form.legal;
  const legalKindError = err("legalKind");
  const adminName = form.adminName.trim();

  return (
    <div className="grid grid-cols-1 items-start gap-4 desktop:grid-cols-3">
      <form
        ref={formRef}
        noValidate
        onSubmit={submit}
        className="flex min-w-0 flex-col gap-4 desktop:col-span-2"
      >
        <div className="flex flex-col gap-2">
          <h1 className={DIALOG_TITLE}>{t.title}</h1>
          <p className={BODY}>{t.intro}</p>
        </div>

        <div className={CARD}>
          <TextField
            id={`${id}-name`}
            label={t.name}
            hint={t.nameHint}
            type="text"
            autoComplete="off"
            required
            value={form.displayName}
            onChange={(event) => set("displayName", event.target.value)}
            error={err("displayName")}
          />
          <TextAreaField
            id={`${id}-description`}
            label={t.description}
            hint={t.descriptionHint}
            required
            value={form.description}
            onChange={(event) => set("description", event.target.value)}
            error={err("description")}
          />
        </div>

        <section aria-labelledby={`${id}-address-title`} className={CARD}>
          <h2 id={`${id}-address-title`} className={CARD_TITLE}>
            {uk.kabinet.profile.address}
          </h2>
          <SelectField
            id={`${id}-city`}
            label={t.city}
            required
            value={form.cityId}
            onChange={(event) => set("cityId", event.target.value)}
            error={err("cityId")}
          >
            <option value="" />
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </SelectField>
          <TextField
            id={`${id}-line1`}
            label={t.address.line1}
            type="text"
            autoComplete="off"
            required
            value={form.line1}
            onChange={(event) => set("line1", event.target.value)}
            error={err("line1")}
          />
          <TextField
            id={`${id}-line2`}
            label={t.address.line2}
            type="text"
            autoComplete="off"
            value={form.line2}
            onChange={(event) => set("line2", event.target.value)}
          />
          <TextField
            id={`${id}-postal-code`}
            label={t.address.postalCode}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={form.postalCode}
            onChange={(event) => set("postalCode", event.target.value)}
          />
          <TextField
            id={`${id}-coordinates`}
            label={t.coordinates}
            hint={t.coordinatesHint}
            type="text"
            autoComplete="off"
            required
            value={form.coordinates}
            onChange={(event) => set("coordinates", event.target.value)}
            error={err("coordinates")}
          />
        </section>

        <fieldset
          className={CARD}
          aria-describedby={legalKindError !== null ? `${id}-legal-error` : undefined}
        >
          <legend className={`${CARD_TITLE} mb-4`}>{t.legalTitle}</legend>
          <div className="flex min-w-0 flex-col gap-2">
            {LEGAL_KINDS.map((kind) => (
              <label
                key={kind}
                className="flex min-h-target items-center gap-3 rounded-rg-button bg-rg-fill px-4"
              >
                <input
                  type="radio"
                  name={`${id}-legal-kind`}
                  value={kind}
                  checked={legal.kind === kind}
                  onChange={() => setLegal({ kind })}
                  aria-invalid={legalKindError !== null ? true : undefined}
                />
                <span className={STRONG}>{t.legalKind[kind]}</span>
              </label>
            ))}
          </div>
          {legalKindError !== null ? (
            <p id={`${id}-legal-error`} className={ERROR_TEXT}>
              {legalKindError}
            </p>
          ) : null}
          {legal.kind === "registered_ngo" || legal.kind === "sole_proprietor" ? (
            <>
              <TextField
                id={`${id}-legal-name`}
                label={uk.kabinet.profile.legalName}
                type="text"
                autoComplete="off"
                required
                value={legal.legalName}
                onChange={(event) => setLegal({ legalName: event.target.value })}
                error={err("legalName")}
              />
              <TextField
                id={`${id}-edrpou`}
                label={uk.kabinet.profile.edrpou}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                required
                value={legal.edrpou}
                onChange={(event) => setLegal({ edrpou: event.target.value })}
                error={err("edrpou")}
              />
            </>
          ) : null}
          {legal.kind === "registered_ngo" ? (
            <TextField
              id={`${id}-registered-at`}
              label={t.registeredAt}
              type="date"
              max={today}
              required
              value={legal.registeredAt}
              onChange={(event) => setLegal({ registeredAt: event.target.value })}
              error={err("registeredAt")}
            />
          ) : null}
          {legal.kind === "unregistered_initiative" ? (
            <TextField
              id={`${id}-contact-person`}
              label={uk.kabinet.profile.contactPerson}
              type="text"
              autoComplete="off"
              required
              value={legal.contactPersonName}
              onChange={(event) => setLegal({ contactPersonName: event.target.value })}
              error={err("contactPersonName")}
            />
          ) : null}
        </fieldset>

        <section aria-labelledby={`${id}-contacts-title`} className={CARD}>
          <h2 id={`${id}-contacts-title`} className={CARD_TITLE}>
            {uk.kabinet.profile.contactsTitle}
          </h2>
          <ContactFields
            idPrefix={`${id}-contacts`}
            form={form.contacts}
            update={(change) =>
              setForm((current) => ({ ...current, contacts: change(current.contacts) }))
            }
            errors={errors.contacts ?? NO_CONTACT_ERRORS}
          />
        </section>

        <section aria-labelledby={`${id}-evidence-title`} className={CARD}>
          <h2 id={`${id}-evidence-title`} className={CARD_TITLE}>
            {uk.kabinet.operator.evidence.title}
          </h2>
          <EvidenceEditor
            idPrefix={`${id}-evidence`}
            rows={form.evidence}
            update={(change) =>
              setForm((current) => ({ ...current, evidence: change(current.evidence) }))
            }
            errors={errors.evidence}
            today={today}
          />
        </section>

        <section aria-labelledby={`${id}-admin-title`} className={CARD}>
          <div className="flex flex-col gap-1">
            <h2 id={`${id}-admin-title`} className={CARD_TITLE}>
              {t.firstAdminTitle}
            </h2>
            <p className={CAPTION}>{t.firstAdminHint}</p>
          </div>
          <TextField
            id={`${id}-admin-name`}
            label={t.adminName}
            type="text"
            autoComplete="off"
            required
            value={form.adminName}
            onChange={(event) => set("adminName", event.target.value)}
            error={err("adminName")}
          />
          <TextField
            id={`${id}-admin-email`}
            label={uk.kabinet.signIn.emailLabel}
            type="email"
            inputMode="email"
            autoComplete="off"
            required
            value={form.adminEmail}
            onChange={(event) => set("adminEmail", event.target.value)}
            error={err("adminEmail")}
          />
        </section>

        {refusal !== null ? (
          <p role="alert" className={ERROR_TEXT}>
            {refusalMessage(refusal)}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" aria-busy={submitting || undefined}>
            {t.submit}
          </Button>
          <Link href={OPERATOR_HOME} className={buttonClass("text")}>
            {t.cancel}
          </Link>
        </div>
      </form>

      <aside aria-labelledby={`${id}-next-title`} className={`${CARD} bg-rg-fill`}>
        <h2 id={`${id}-next-title`} className={CARD_TITLE}>
          {t.whatHappens.title}
        </h2>
        <ol className={`flex list-decimal flex-col gap-2 pl-5 ${BODY}`}>
          <li>{t.whatHappens.step1}</li>
          <li>
            {fillTemplate(t.whatHappens.step2, {
              // Before a name is typed, the sentence names the role instead.
              name: adminName === "" ? t.firstAdminTitle : adminName,
            })}
          </li>
          <li>{t.whatHappens.step3}</li>
        </ol>
      </aside>
    </div>
  );
}
