"use client";

import { uk } from "@opika/i18n";
import { useState } from "react";
import { Button } from "../../../ui/Button";
import { ERROR, LABEL, Select, TextField } from "../../../ui/form";
import {
  ALL_KINDS,
  type ChannelKind,
  type ContactsForm,
  type FieldError,
  MAX_OTHER_ROWS,
  NEW_OTHER_KINDS,
} from "./fields";
import { Optional } from "./Optional";

export type ContactsErrors = {
  phone: FieldError | null;
  telegram: FieldError | null;
  others: Readonly<Record<string, FieldError>>;
  atLeastOne: boolean;
};
export const NO_CONTACT_ERRORS: ContactsErrors = {
  phone: null,
  telegram: null,
  others: {},
  atLeastOne: false,
};

export const inputModeOf = (kind: ChannelKind) =>
  kind === "phone" || kind === "viber"
    ? "tel"
    : kind === "email"
      ? "email"
      : kind === "website"
        ? "url"
        : "text";

/**
 * K4's contact fields (N6, answer 3): an optional phone, an optional
 * Telegram, and up to two «other» rows. A stored contact that fits neither
 * field shows as an «other» row of its own kind, editable (fix 3); a new row
 * is Viber, email or a website. Shared by K4's contacts section and the
 * operator's create form (R-UI 2), which hold the form themselves and check
 * it with `contactOfForm`; this renders the fields and nothing else.
 */
export function ContactFields({
  idPrefix,
  form,
  update,
  errors,
}: {
  idPrefix: string;
  form: ContactsForm;
  update: (change: (current: ContactsForm) => ContactsForm) => void;
  errors: ContactsErrors;
}) {
  const t = uk.kabinet.profileEdit;
  const channel = uk.kabinet.profileChannel;
  const [nextRow, setNextRow] = useState(0);

  const setOther = (rowId: string, patch: { kind?: ChannelKind; value?: string }) =>
    update((current) => ({
      ...current,
      others: current.others.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    }));

  const message = (error: FieldError | null | undefined) =>
    error === null || error === undefined ? null : t.errors[error];

  const optional = <Optional />;

  return (
    <>
      <TextField
        id={`${idPrefix}-phone`}
        label={
          <>
            {channel.phone} {optional}
          </>
        }
        type="text"
        inputMode="tel"
        autoComplete="tel"
        placeholder={t.contacts.phonePlaceholder}
        value={form.phone}
        onChange={(event) => {
          const value = event.target.value;
          update((current) => ({ ...current, phone: value }));
        }}
        error={message(errors.phone)}
      />
      <TextField
        id={`${idPrefix}-telegram`}
        label={
          <>
            {channel.telegram} {optional}
          </>
        }
        type="text"
        autoComplete="off"
        placeholder={t.contacts.telegramPlaceholder}
        value={form.telegram}
        onChange={(event) => {
          const value = event.target.value;
          update((current) => ({ ...current, telegram: value }));
        }}
        error={message(errors.telegram)}
      />
      {form.others.map((row) => {
        const kinds: readonly ChannelKind[] = row.stored ? ALL_KINDS : NEW_OTHER_KINDS;
        return (
          <fieldset
            key={row.id}
            className="flex min-w-0 flex-col gap-3 rounded-panel border-2 border-line p-4"
          >
            <legend className={`${LABEL} px-1`}>
              {t.contacts.otherLabel} {optional}
            </legend>
            <Select
              id={`${idPrefix}-${row.id}-kind`}
              label={t.contacts.otherKind}
              value={row.kind}
              onChange={(event) => setOther(row.id, { kind: event.target.value as ChannelKind })}
            >
              {kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {channel[kind]}
                </option>
              ))}
            </Select>
            <TextField
              id={`${idPrefix}-${row.id}-value`}
              label={channel[row.kind]}
              type="text"
              inputMode={inputModeOf(row.kind)}
              value={row.value}
              onChange={(event) => setOther(row.id, { value: event.target.value })}
              error={message(errors.others[row.id])}
            />
            <Button
              variant="ghost"
              className="self-start"
              onClick={() =>
                update((current) => ({
                  ...current,
                  others: current.others.filter((other) => other.id !== row.id),
                }))
              }
            >
              {t.contacts.removeOther}
            </Button>
          </fieldset>
        );
      })}
      {form.others.length < MAX_OTHER_ROWS ? (
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => {
            update((current) => ({
              ...current,
              others: [
                ...current.others,
                { id: `new-${nextRow}`, kind: "viber", value: "", stored: false },
              ],
            }));
            setNextRow((n) => n + 1);
          }}
        >
          {t.contacts.addOther}
        </Button>
      ) : null}
      {errors.atLeastOne ? (
        <p role="alert" id={`${idPrefix}-at-least-one`} className={ERROR}>
          {t.contacts.atLeastOne}
        </p>
      ) : null}
    </>
  );
}
