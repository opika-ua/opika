"use client";

import "../../../../zod-client-config";
import type { RegistryShelterView } from "@opika/contracts";
import { kyivCalendarDateOf } from "@opika/domain";
import { uk } from "@opika/i18n";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { Button } from "../../../../ui/Button";
import type { ComboboxOption } from "../../../../ui/Combobox";
import { typedDateMessage } from "../../shared/kabinet-date";
import {
  type AddressForm,
  addressFormOf,
  type CreateField,
  type CreateFieldError,
  exactAddressOf,
  type LegalForm,
  legalEntityOf,
  legalFormOf,
} from "../create/create-input";
import {
  type RegistryCreateClient,
  registryCreateBrowserClient,
} from "../create/registry-create-client";
import { AddressFields, CityField, LegalFields, useCityPicker } from "../create/VerifiedDataFields";
import { useOperatorActions } from "./operator-actions";
import type { RegistryActionsClient } from "./registry-actions-client";
import { ACTIONS, NOTICE } from "./styles";

type Change = Parameters<
  RegistryActionsClient["registry"]["shelters"]["updateVerifiedData"]
>[0]["change"];

type Notice = { kind: "none" } | { kind: "saved" } | { kind: "conflict" } | { kind: "failed" };
type FieldErrors = Partial<Record<CreateField, CreateFieldError>>;

const message = (error: CreateFieldError | undefined): string | null => {
  if (error === undefined) return null;
  if (error === "dateIncomplete" || error === "dateNoSuchDate") return typedDateMessage(error);
  return error === "nameTooLong" || error === "emailFormat" || error === "descriptionTooLong"
    ? null
    : uk.kabinet.operator.create.errors[error];
};

// Key order and a date's time of day are not differences: the form holds calendar days only.
const canonical = (value: unknown): unknown => {
  if (value instanceof Date) return kyivCalendarDateOf(value);
  if (value === null || typeof value !== "object") return value;
  return Object.keys(value)
    .sort()
    .map((key) => [key, canonical((value as Record<string, unknown>)[key])]);
};
const sameValue = (a: unknown, b: unknown): boolean =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/**
 * One «Змінити» → form → «Зберегти» cycle for a locked block, through S4's one runner, so
 * CONFLICT re-reads the page before «Дані змінилися… Сторінку оновлено.» (as the rename does).
 */
function EditCycle({
  owner,
  headingId,
  form,
  openLabel,
  onOpen,
  changeOf,
}: {
  owner: string;
  headingId: string;
  form: ReactNode;
  /** «Додати» while the block is empty, «Змінити» once it holds a value. */
  openLabel: string;
  /** Resets the form from the record as it is now. */
  onOpen: () => void;
  /** The change to send, null when the form has errors, "unchanged" when nothing differs. */
  changeOf: () => Change | null | "unchanged";
}) {
  const { view, phase, run } = useOperatorActions();
  const t = uk.kabinet.operator;
  const edit = uk.kabinet.profileEdit;
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<Notice>({ kind: "none" });
  const busy = phase.kind !== "idle";
  const mine = busy && phase.owner === owner;

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const change = changeOf();
    if (change === null) return;
    if (change === "unchanged") {
      setOpen(false);
      return;
    }
    setNotice({ kind: "none" });
    const settled = await run({
      owner,
      call: (client) =>
        client.registry.shelters.updateVerifiedData({
          shelterId: view.id,
          expectedVersion: view.version,
          change,
        }),
      viewOf: (answered) => answered,
      landed: (fresh: RegistryShelterView) =>
        sameValue(
          change.field === "legal_entity" ? fresh.legalEntity : fresh.exactAddress,
          change.next,
        ),
    });
    switch (settled.kind) {
      case "busy":
        return;
      case "ok":
        setOpen(false);
        setNotice({ kind: "saved" });
        return;
      case "lost":
        if (settled.landed) setOpen(false);
        setNotice(settled.landed ? { kind: "saved" } : { kind: "failed" });
        return;
      case "refused":
        if (settled.failure.kind === "conflict" && settled.reread === "done") {
          // The page now shows the record as it is; the form closes so nothing stale is resent.
          setOpen(false);
          setNotice({ kind: "conflict" });
        } else {
          setNotice({ kind: "failed" });
        }
        return;
      /* v8 ignore next 4 -- exists so the compiler rejects an unhandled outcome; unreachable at runtime */
      default: {
        const unreachable: never = settled;
        return unreachable;
      }
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {open ? (
        <form noValidate onSubmit={save} className="flex flex-col gap-4">
          {form}
          <div className={ACTIONS}>
            <Button type="submit" aria-disabled={busy || undefined} aria-busy={mine || undefined}>
              {mine && phase.kind === "sending" ? edit.state.saving : edit.actions.save}
            </Button>
            <Button
              variant="ghost"
              aria-disabled={mine || undefined}
              onClick={() => {
                if (!mine) setOpen(false);
              }}
            >
              {t.create.cancel}
            </Button>
          </div>
        </form>
      ) : (
        <div className={ACTIONS}>
          <Button
            variant="secondary"
            aria-describedby={headingId}
            aria-disabled={busy || undefined}
            onClick={() => {
              if (busy) return;
              onOpen();
              setNotice({ kind: "none" });
              setOpen(true);
            }}
          >
            {openLabel}
          </Button>
        </div>
      )}
      <p role="status" className={NOTICE}>
        {mine && phase.kind === "checking"
          ? t.errors.lostAnswer
          : notice.kind === "saved"
            ? edit.state.saved
            : null}
      </p>
      {notice.kind === "conflict" ? (
        <p role="alert" className={NOTICE}>
          {t.errors.conflictReload}
        </p>
      ) : null}
      {notice.kind === "failed" ? (
        <p role="alert" className={NOTICE}>
          {t.errors.failed}
        </p>
      ) : null}
    </div>
  );
}

const openLabelOf = (current: unknown): string =>
  current === null ? uk.kabinet.operator.shelter.add : uk.kabinet.operator.shelter.edit;

/**
 * «Змінити» (or «Додати», none on file yet) on S4's «Юридичні дані»: `registry.shelters.updateVerifiedData`,
 * `legal_entity`. There is no way back to none: the form only ever sends a legal entity.
 */
export function LegalEdit({ now = () => new Date() }: { now?: () => Date }) {
  const { view } = useOperatorActions();
  const id = useId();
  const [legal, setLegal] = useState<LegalForm>(() => legalFormOf(view.legalEntity));
  const [errors, setErrors] = useState<FieldErrors>({});
  return (
    <EditCycle
      owner="legal_entity"
      headingId="operator-legal"
      openLabel={openLabelOf(view.legalEntity)}
      onOpen={() => {
        setLegal(legalFormOf(view.legalEntity));
        setErrors({});
      }}
      changeOf={() => {
        const found: FieldErrors = {};
        const checked = legalEntityOf(legal, found);
        setErrors(found);
        if (checked.kind !== "ok") return null;
        if (sameValue(checked.legalEntity, view.legalEntity)) return "unchanged";
        return { field: "legal_entity", next: checked.legalEntity };
      }}
      form={
        <LegalFields
          idPrefix={id}
          labelledBy="operator-legal"
          legal={legal}
          setLegal={(patch) => setLegal((current) => ({ ...current, ...patch }))}
          today={kyivCalendarDateOf(now())}
          errors={{
            legalKind: message(errors.legalKind),
            legalName: message(errors.legalName),
            edrpou: message(errors.edrpou),
            registeredAt: message(errors.registeredAt),
            contactPersonName: message(errors.contactPersonName),
          }}
        />
      }
    />
  );
}

/**
 * «Змінити» (or «Додати») on S4's «Адреса приміщення»: `exact_address`. The district is never
 * collected (RU-T6), so the stored one is kept rather than wiped. With no address on file the
 * form starts in the shelter's city.
 */
export function AddressEdit({
  cityName,
  cities = registryCreateBrowserClient.registry.cities,
}: {
  cityName: string | null;
  cities?: Pick<RegistryCreateClient["registry"]["cities"], "search">;
}) {
  const { view } = useOperatorActions();
  const id = useId();
  const picker = useCityPicker(cities);
  const cityId = view.publicLocation.cityId;
  const cityOf = (): ComboboxOption | null =>
    cityName === null ? null : { value: cityId, label: cityName };
  const [form, setForm] = useState<AddressForm>(() => addressFormOf(view.exactAddress, cityId));
  const [city, setCity] = useState<ComboboxOption | null>(cityOf);
  const [errors, setErrors] = useState<FieldErrors>({});
  return (
    <EditCycle
      owner="exact_address"
      headingId="operator-address"
      openLabel={openLabelOf(view.exactAddress)}
      onOpen={() => {
        setForm(addressFormOf(view.exactAddress, cityId));
        setCity(cityOf());
        setErrors({});
      }}
      changeOf={() => {
        const found: FieldErrors = {};
        const checked = exactAddressOf(form, found);
        setErrors(found);
        if (checked.kind !== "ok") return null;
        const next = { ...checked.exactAddress, district: view.exactAddress?.district ?? null };
        if (sameValue(next, view.exactAddress)) return "unchanged";
        return { field: "exact_address", next };
      }}
      form={
        <>
          <CityField
            idPrefix={id}
            city={city}
            setCity={setCity}
            setCityId={(next) => setForm((current) => ({ ...current, cityId: next }))}
            picker={picker}
            error={errors.cityId === undefined ? null : uk.kabinet.cityPicker.mustPick}
          />
          <AddressFields
            idPrefix={id}
            form={form}
            set={(key, value) => setForm((current) => ({ ...current, [key]: value }))}
            street="required"
            errors={{ line1: message(errors.line1), coordinates: message(errors.coordinates) }}
          />
        </>
      }
    />
  );
}
