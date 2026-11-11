"use client";

import "../../../../zod-client-config";
import type { CreatedShelterView } from "@opika/contracts";
import { kyivCalendarDateOf } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Button, LinkButton } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import type { ComboboxOption } from "../../../../ui/Combobox";
import { FormSection } from "../../../../ui/FormSection";
import { TextArea, TextField } from "../../../../ui/form";
import { Heading } from "../../../../ui/Heading";
import { Panel } from "../../../../ui/Panel";
import { Text } from "../../../../ui/Text";
import { ContactFields, NO_CONTACT_ERRORS } from "../../profile-edit/ContactFields";
import { OPERATOR_HOME } from "../../routes";
import { aboutTooLongMessage } from "../about-text";
import { nameTooLongMessage } from "../display-name";
import { EvidenceEditor } from "../evidence-editor/EvidenceEditor";
import { CreatedShelter } from "./CreatedShelter";
import {
  type CreateField,
  type CreateFieldError,
  type CreateShelterForm as CreateForm,
  type CreateFormErrors,
  createInputOf,
  emptyCreateForm,
  type LegalForm,
  noCreateErrors,
} from "./create-input";
import { type CreateRefusal, createRefusalOf, refusalMessage } from "./create-outcome";
import { type RegistryCreateClient, registryCreateBrowserClient } from "./registry-create-client";
import { AddressFields, CityField, LegalFields, useCityPicker } from "./VerifiedDataFields";

/** Where S2 stands. A submission is one request; nothing retries it (RU-T9). */
type Phase =
  | { kind: "editing"; refusal: CreateRefusal | null }
  | { kind: "submitting" }
  | { kind: "created"; view: CreatedShelterView };

const fieldMessage = (error: CreateFieldError | undefined): string | null => {
  if (error === undefined) return null;
  if (error === "nameTooLong") return nameTooLongMessage();
  if (error === "descriptionTooLong") return aboutTooLongMessage();
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
  client = registryCreateBrowserClient,
  now = () => new Date(),
}: {
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
  const [city, setCity] = useState<ComboboxOption | null>(null);
  const inFlight = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const today = kyivCalendarDateOf(now());
  const cityPicker = useCityPicker(client.registry.cities);

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
      const refusal = createRefusalOf(error);
      if (refusal.kind === "name_too_long" || refusal.kind === "description_too_long") {
        // The server's count went over a cap: on the field, as the form's own check says it.
        const fields =
          refusal.kind === "name_too_long"
            ? { displayName: "nameTooLong" as const }
            : { description: "descriptionTooLong" as const };
        setErrors({ ...noCreateErrors(), fields });
        setPhase({ kind: "editing", refusal: null });
        setFocusFirstError((n) => n + 1);
      } else {
        setPhase({ kind: "editing", refusal });
      }
    } finally {
      inFlight.current = false;
    }
  };

  const submitting = phase.kind === "submitting";
  const refusal = phase.kind === "editing" ? phase.refusal : null;
  const legal = form.legal;
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
          <Heading level={1} look="title">
            {t.title}
          </Heading>
          <Text>{t.intro}</Text>
        </div>

        <Card>
          <div className="flex flex-col gap-4 p-4 tablet:p-6">
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
            <CityField
              idPrefix={id}
              city={city}
              setCity={setCity}
              setCityId={(cityId) => set("cityId", cityId)}
              picker={cityPicker}
              error={errors.fields.cityId === undefined ? null : uk.kabinet.cityPicker.mustPick}
            />
            <TextArea
              id={`${id}-description`}
              label={t.description}
              hint={t.descriptionHint}
              value={form.description}
              onChange={(event) => set("description", event.target.value)}
              error={err("description")}
            />
          </div>
        </Card>

        <FormSection
          id={`${id}-address`}
          title={uk.kabinet.profile.address}
          description={t.laterHint}
        >
          <AddressFields
            idPrefix={id}
            form={form}
            set={set}
            street="optional"
            errors={{ line1: err("line1"), coordinates: err("coordinates") }}
          />
        </FormSection>

        <FormSection id={`${id}-legal`} title={t.legalTitle} description={t.laterHint}>
          <LegalFields
            idPrefix={id}
            labelledBy={`${id}-legal-title`}
            legal={legal}
            setLegal={setLegal}
            today={today}
            errors={{
              legalKind: err("legalKind"),
              legalName: err("legalName"),
              edrpou: err("edrpou"),
              registeredAt: err("registeredAt"),
              contactPersonName: err("contactPersonName"),
            }}
          />
        </FormSection>

        <FormSection id={`${id}-contacts`} title={uk.kabinet.profile.contactsTitle}>
          <ContactFields
            idPrefix={`${id}-contacts`}
            form={form.contacts}
            update={(change) =>
              setForm((current) => ({ ...current, contacts: change(current.contacts) }))
            }
            errors={errors.contacts ?? NO_CONTACT_ERRORS}
          />
        </FormSection>

        <FormSection id={`${id}-evidence`} title={uk.kabinet.operator.evidence.title}>
          <EvidenceEditor
            idPrefix={`${id}-evidence`}
            rows={form.evidence}
            update={(change) =>
              setForm((current) => ({ ...current, evidence: change(current.evidence) }))
            }
            errors={errors.evidence}
            today={today}
          />
        </FormSection>

        <FormSection id={`${id}-admin`} title={t.firstAdminTitle} description={t.firstAdminHint}>
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
        </FormSection>

        {refusal !== null ? (
          <p role="alert" className="text-label text-ink">
            {refusalMessage(refusal)}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" aria-busy={submitting || undefined}>
            {/* K4's word for a write in flight, so the press shows on screen, not only to a screen reader. */}
            {submitting ? uk.kabinet.profileEdit.state.saving : t.submit}
          </Button>
          <LinkButton href={OPERATOR_HOME} variant="ghost">
            {t.cancel}
          </LinkButton>
        </div>
      </form>

      <Panel
        as="aside"
        tone="sunken"
        padding="lg"
        aria-labelledby={`${id}-next-title`}
        className="flex min-w-0 flex-col gap-4"
      >
        <Heading level={2} look="body-l" id={`${id}-next-title`}>
          {t.whatHappens.title}
        </Heading>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-body text-ink">
          <li>{t.whatHappens.step1}</li>
          {/* His sentence starts with the first admin's name, and there is no wording for
              before one is typed, so the step joins the list once there is a name to put in it. */}
          {adminName !== "" ? (
            <li>{fillTemplate(t.whatHappens.step2, { name: adminName })}</li>
          ) : null}
          <li>{t.whatHappens.step3}</li>
        </ol>
      </Panel>
    </div>
  );
}
