import { uk } from "@opika/i18n";
import { Combobox, type ComboboxOption } from "../../../../ui/Combobox";
import { DateField } from "../../../../ui/DateField";
import { FieldError, Radio, TextField } from "../../../../ui/form";
import type { useCityPicker } from "../../shared/city-picker";
import { DATE_FIELD_LABELS } from "../../shared/kabinet-date";
import { type AddressForm, LEGAL_KINDS, type LegalForm } from "./create-input";

/**
 * The verified-data fields (premises address, legal form) shared by S2's create form and S4's
 * edit forms, so both say the same labels and check the same way. No state of their own.
 */

/** The settlement picker: S2 asks for it on its own (the address is optional there), S4 with the address. */
export function CityField({
  idPrefix,
  city,
  setCity,
  setCityId,
  picker,
  error,
}: {
  idPrefix: string;
  city: ComboboxOption | null;
  setCity: (next: ComboboxOption | null) => void;
  setCityId: (cityId: string) => void;
  picker: ReturnType<typeof useCityPicker>;
  error: string | null;
}) {
  return (
    <Combobox
      id={`${idPrefix}-city`}
      label={uk.kabinet.operator.create.city}
      name="cityId"
      required
      value={city}
      onChange={(next) => {
        setCity(next);
        setCityId(next?.value ?? "");
      }}
      search={picker.search}
      messages={picker.messages}
      error={error}
    />
  );
}

/** `street`: S2's address block is optional as a whole, S4's address edit always needs the street. */
export function AddressFields({
  idPrefix,
  form,
  set,
  street,
  errors,
}: {
  idPrefix: string;
  form: AddressForm;
  set: <K extends keyof AddressForm>(key: K, value: AddressForm[K]) => void;
  street: "required" | "optional";
  errors: {
    line1: string | null;
  };
}) {
  const t = uk.kabinet.operator.create;
  return (
    <>
      <TextField
        id={`${idPrefix}-line1`}
        label={t.address.line1}
        type="text"
        autoComplete="off"
        required={street === "required"}
        value={form.line1}
        onChange={(event) => set("line1", event.target.value)}
        error={errors.line1}
      />
      <TextField
        id={`${idPrefix}-line2`}
        label={t.address.line2}
        type="text"
        autoComplete="off"
        value={form.line2}
        onChange={(event) => set("line2", event.target.value)}
      />
      <TextField
        id={`${idPrefix}-postal-code`}
        label={t.address.postalCode}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={form.postalCode}
        onChange={(event) => set("postalCode", event.target.value)}
      />
    </>
  );
}

/** `labelledBy` names the radio group: the id of the section's heading. */
export function LegalFields({
  idPrefix,
  labelledBy,
  legal,
  setLegal,
  today,
  errors,
}: {
  idPrefix: string;
  labelledBy: string;
  legal: LegalForm;
  setLegal: (patch: Partial<LegalForm>) => void;
  today: string;
  errors: {
    legalKind: string | null;
    legalName: string | null;
    edrpou: string | null;
    registeredAt: string | null;
    contactPersonName: string | null;
  };
}) {
  const t = uk.kabinet.operator.create;
  const p = uk.kabinet.profile;
  return (
    <>
      <div
        role="radiogroup"
        aria-labelledby={labelledBy}
        aria-describedby={errors.legalKind !== null ? `${idPrefix}-legal-error` : undefined}
        className="flex min-w-0 flex-col gap-2"
      >
        {LEGAL_KINDS.map((kind) => (
          <Radio
            key={kind}
            label={t.legalKind[kind]}
            name={`${idPrefix}-legal-kind`}
            value={kind}
            checked={legal.kind === kind}
            onChange={() => setLegal({ kind })}
            aria-invalid={errors.legalKind !== null ? true : undefined}
          />
        ))}
      </div>
      {errors.legalKind !== null ? (
        <FieldError id={`${idPrefix}-legal-error`}>{errors.legalKind}</FieldError>
      ) : null}
      {legal.kind === "registered_ngo" || legal.kind === "sole_proprietor" ? (
        <>
          <TextField
            id={`${idPrefix}-legal-name`}
            label={p.legalName}
            type="text"
            autoComplete="off"
            required
            value={legal.legalName}
            onChange={(event) => setLegal({ legalName: event.target.value })}
            error={errors.legalName}
          />
          <TextField
            id={`${idPrefix}-edrpou`}
            label={p.edrpou}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            required
            value={legal.edrpou}
            onChange={(event) => setLegal({ edrpou: event.target.value })}
            error={errors.edrpou}
          />
        </>
      ) : null}
      {legal.kind === "registered_ngo" ? (
        <DateField
          id={`${idPrefix}-registered-at`}
          legend={t.registeredAt}
          labels={DATE_FIELD_LABELS}
          today={today}
          required
          value={legal.registeredAt}
          onChange={(registeredAt) => setLegal({ registeredAt })}
          error={errors.registeredAt}
        />
      ) : null}
      {legal.kind === "unregistered_initiative" ? (
        <TextField
          id={`${idPrefix}-contact-person`}
          label={p.contactPerson}
          type="text"
          autoComplete="off"
          required
          value={legal.contactPersonName}
          onChange={(event) => setLegal({ contactPersonName: event.target.value })}
          error={errors.contactPersonName}
        />
      ) : null}
    </>
  );
}
