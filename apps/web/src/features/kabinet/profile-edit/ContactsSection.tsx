"use client";

import type { KabinetShelterView } from "@opika/contracts";
import { uk } from "@opika/i18n";
import { useId, useState } from "react";
import { Button, SelectField, TextField } from "../../controls/controls";
import {
  ALL_KINDS,
  type ChannelKind,
  type ContactsForm,
  contactOfForm,
  contactsFormOf,
  type FieldError,
  MAX_OTHER_ROWS,
  NEW_OTHER_KINDS,
  sameContactsForm,
} from "./fields";
import { SaveBar, type SaveState } from "./SaveBar";
import { CAPTION, CARD, CARD_TITLE, ERROR_TEXT, OPTIONAL, STRONG } from "./styles";
import { useUnsavedChanges } from "./unsaved-changes";
import { sameStoredValue, type WriteResult } from "./write-result";

type Errors = {
  phone: FieldError | null;
  telegram: FieldError | null;
  others: Readonly<Record<string, FieldError>>;
  atLeastOne: boolean;
};
const NO_ERRORS: Errors = { phone: null, telegram: null, others: {}, atLeastOne: false };

const inputModeOf = (kind: ChannelKind) =>
  kind === "phone" || kind === "viber"
    ? "tel"
    : kind === "email"
      ? "email"
      : kind === "website"
        ? "url"
        : "text";

/**
 * K4's contacts (N6 fields, answer 3): an optional phone, an optional
 * Telegram, and «other» rows. A stored contact that fits neither field shows
 * as an «other» row of its own kind, editable (fix 3); a new row is Viber,
 * email or a website, and is offered only while fewer than two «other» rows
 * exist. Saved on its own (answer 1), compare-and-set on the version it read.
 *
 * The caption under the save button (`actions.liveOnSave.contacts`) is true
 * since reveal views carry the shelter's current contacts while it is visible
 * (K4-B4, answer 1; `shelterContact`, `source: "current"`, K4-B5, chosen in
 * `api/handlers/reveal.ts`).
 */
export function ContactsSection({
  contact,
  save,
  reload,
}: {
  contact: KabinetShelterView["contact"];
  save: (next: KabinetShelterView["contact"]) => Promise<WriteResult>;
  reload: () => Promise<KabinetShelterView | null>;
}) {
  const t = uk.kabinet.profileEdit;
  const channel = uk.kabinet.profileChannel;
  const id = useId();
  const [base, setBase] = useState(contact);
  const [form, setForm] = useState<ContactsForm>(() => contactsFormOf(contact));
  const [errors, setErrors] = useState<Errors>(NO_ERRORS);
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const [nextRow, setNextRow] = useState(0);
  const dirty = !sameContactsForm(form, contactsFormOf(base));
  useUnsavedChanges("contacts", dirty);

  const reset = (to: KabinetShelterView["contact"]) => {
    setBase(to);
    setForm(contactsFormOf(to));
    setErrors(NO_ERRORS);
  };

  const onSave = async () => {
    const checked = contactOfForm(form);
    if (checked.kind === "invalid") {
      setErrors(checked);
      setState({ kind: "idle" });
      return;
    }
    setErrors(NO_ERRORS);
    setState({ kind: "saving" });
    const result = await save(checked.contact);
    if (result.kind === "ok") {
      reset(result.view.contact);
      setState({ kind: "saved", at: new Date() });
    } else if (result.kind === "no_answer") {
      // The answer was lost; read what is stored now (inbox K4-T16).
      const view = await reload();
      if (view !== null && sameStoredValue(view.contact, checked.contact)) {
        reset(view.contact);
        setState({ kind: "saved", at: new Date() });
      } else {
        setState({ kind: "failed" });
      }
    } else if (result.kind === "illegal_transition") {
      setState({ kind: "failed" });
    } else {
      setState(result);
    }
  };

  const onReload = async () => {
    const view = await reload();
    if (view === null) {
      setState({ kind: "failed" });
      return;
    }
    reset(view.contact);
    setState({ kind: "idle" });
  };

  const setOther = (rowId: string, patch: { kind?: ChannelKind; value?: string }) =>
    setForm((current) => ({
      ...current,
      others: current.others.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    }));

  const message = (error: FieldError | null | undefined) =>
    error === null || error === undefined ? null : t.errors[error];

  const optional = <span className={OPTIONAL}>{t.donation.optional}</span>;

  return (
    <section aria-labelledby={`${id}-title`} className={CARD}>
      <h2 id={`${id}-title`} className={CARD_TITLE}>
        {uk.kabinet.profile.contactsTitle}
      </h2>
      <TextField
        id={`${id}-phone`}
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
          setForm((current) => ({ ...current, phone: value }));
        }}
        error={message(errors.phone)}
      />
      <TextField
        id={`${id}-telegram`}
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
          setForm((current) => ({ ...current, telegram: value }));
        }}
        error={message(errors.telegram)}
      />
      {form.others.map((row) => {
        const kinds: readonly ChannelKind[] = row.stored ? ALL_KINDS : NEW_OTHER_KINDS;
        return (
          <fieldset key={row.id} className="flex min-w-0 flex-col gap-3">
            <legend className={`${STRONG} mb-2`}>
              {t.contacts.otherLabel} {optional}
            </legend>
            <SelectField
              id={`${id}-${row.id}-kind`}
              label={t.contacts.otherKind}
              value={row.kind}
              onChange={(event) => setOther(row.id, { kind: event.target.value as ChannelKind })}
            >
              {kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {channel[kind]}
                </option>
              ))}
            </SelectField>
            <TextField
              id={`${id}-${row.id}-value`}
              label={channel[row.kind]}
              type="text"
              inputMode={inputModeOf(row.kind)}
              value={row.value}
              onChange={(event) => setOther(row.id, { value: event.target.value })}
              error={message(errors.others[row.id])}
            />
            <Button
              variant="text"
              className="self-start"
              onClick={() =>
                setForm((current) => ({
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
          variant="text"
          className="self-start"
          onClick={() => {
            setForm((current) => ({
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
        <p role="alert" className={ERROR_TEXT}>
          {t.contacts.atLeastOne}
        </p>
      ) : null}
      <p className={CAPTION}>{uk.kabinet.profile.contactsNote}</p>
      <SaveBar
        state={state}
        dirty={dirty}
        caption={t.actions.liveOnSave.contacts}
        onSave={onSave}
        onCancel={() => {
          reset(base);
          setState({ kind: "idle" });
        }}
        onReload={onReload}
      />
    </section>
  );
}
