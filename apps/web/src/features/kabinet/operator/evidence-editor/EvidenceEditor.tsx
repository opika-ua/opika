"use client";

import type { ReferenceRelationship } from "@opika/domain";
import { uk } from "@opika/i18n";
import { useEffect, useState } from "react";
import { Button, SelectField, TextAreaField, TextField } from "../../../controls/controls";
import { inputModeOf } from "../../profile-edit/ContactFields";
import type { ChannelKind } from "../../profile-edit/fields";
import { CAPTION, STRONG } from "../../profile-edit/styles";
import {
  EDITABLE_EVIDENCE_KINDS,
  type EditableEvidenceKind,
  type EvidenceField,
  type EvidenceFieldError,
  type EvidenceRow,
  type EvidenceRowErrors,
  emptyEvidenceRow,
  REFERENCE_CHANNEL_KINDS,
  REFERENCE_RELATIONSHIPS,
} from "./evidence-rows";

/** A change to a card's typed text: its own fields only, never `id` or `kind`. */
type RowPatch = Partial<Record<EvidenceField | "channelKind", string>>;

/** The message for a field, from `create.errors.*` or, for a reference's channel, K4's contact errors. */
export function evidenceFieldMessage(error: EvidenceFieldError | undefined): string | null {
  if (error === undefined) return null;
  const create = uk.kabinet.operator.create.errors;
  switch (error) {
    case "required":
      return create.required;
    case "edrpouFormat":
      return create.edrpouFormat;
    case "siteVisitInFuture":
      return create.siteVisitInFuture;
    default:
      return uk.kabinet.profileEdit.errors[error];
  }
}

/** The id of a card's first field, which takes focus when the card is added. */
const firstFieldId = (idPrefix: string, row: EvidenceRow): string => {
  switch (row.kind) {
    case "edrpou_registration":
      return `${idPrefix}-${row.id}-edrpou`;
    case "bank_account_holder":
      return `${idPrefix}-${row.id}-holderName`;
    case "reference_contact":
      return `${idPrefix}-${row.id}-name`;
    case "site_visit":
      return `${idPrefix}-${row.id}-visitedOn`;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = row;
      return unreachable;
    }
  }
};

/**
 * The evidence step (N22): a list of cards, one per item, added one at a time
 * by kind («Тип доказу», then «+ Додати доказ»), each with its own
 * «Прибрати». The four document-free kinds only (answer 3); a site visit has
 * no visitor field, because whoever records it is the visitor. Controlled:
 * the caller holds the rows, so S2 starts it empty and R-UI 3's resubmit can
 * start it prefilled. Checked by `evidenceOfRows`, again by the server.
 *
 * `today` is Kyiv's date (`YYYY-MM-DD`), the date input's upper bound: the
 * same "not in the future" the server enforces (`isSiteVisitInFuture`).
 */
export function EvidenceEditor({
  idPrefix,
  rows,
  update,
  errors,
  today,
}: {
  idPrefix: string;
  rows: readonly EvidenceRow[];
  update: (change: (current: readonly EvidenceRow[]) => readonly EvidenceRow[]) => void;
  errors: Readonly<Record<string, EvidenceRowErrors>>;
  today: string;
}) {
  const t = uk.kabinet.operator.evidence;
  const [kind, setKind] = useState<EditableEvidenceKind>("edrpou_registration");
  const [nextRow, setNextRow] = useState(0);
  /** Where focus goes after the list changes: into a new card, or back to the picker. */
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const pickerId = `${idPrefix}-kind`;

  useEffect(() => {
    if (focusTarget === null) return;
    document.getElementById(focusTarget)?.focus();
    setFocusTarget(null);
  }, [focusTarget]);

  const add = () => {
    const row = emptyEvidenceRow(kind, `added-${nextRow}`);
    update((current) => [...current, row]);
    setNextRow((n) => n + 1);
    setFocusTarget(firstFieldId(idPrefix, row));
  };

  const remove = (rowId: string) => {
    update((current) => current.filter((row) => row.id !== rowId));
    setFocusTarget(pickerId);
  };

  const patch = (rowId: string, change: RowPatch) =>
    update((current) =>
      current.map((row) => (row.id === rowId ? ({ ...row, ...change } as EvidenceRow) : row)),
    );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {rows.length > 0 ? (
        <ul className="flex min-w-0 flex-col gap-4">
          {rows.map((row) => (
            <li key={row.id}>
              <EvidenceCard
                idPrefix={idPrefix}
                row={row}
                errors={errors[row.id] ?? {}}
                today={today}
                patch={(change) => patch(row.id, change)}
                remove={() => remove(row.id)}
              />
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex min-w-0 flex-col gap-3">
        <SelectField
          id={pickerId}
          label={t.typePicker}
          value={kind}
          onChange={(event) => setKind(event.target.value as EditableEvidenceKind)}
        >
          {EDITABLE_EVIDENCE_KINDS.map((option) => (
            <option key={option} value={option}>
              {t.kind[option]}
            </option>
          ))}
        </SelectField>
        <Button variant="secondary" className="self-start" onClick={add}>
          {t.add}
        </Button>
      </div>
    </div>
  );
}

function EvidenceCard({
  idPrefix,
  row,
  errors,
  today,
  patch,
  remove,
}: {
  idPrefix: string;
  row: EvidenceRow;
  errors: EvidenceRowErrors;
  today: string;
  patch: (change: RowPatch) => void;
  remove: () => void;
}) {
  const t = uk.kabinet.operator.evidence;
  const id = (field: string) => `${idPrefix}-${row.id}-${field}`;
  const field = (
    name: string,
    value: string,
    label: string,
    error: EvidenceFieldError | undefined,
  ) => (
    <TextField
      id={id(name)}
      label={label}
      type="text"
      value={value}
      onChange={(event) => patch({ [name]: event.target.value })}
      error={evidenceFieldMessage(error)}
    />
  );

  return (
    <fieldset className="flex min-w-0 flex-col gap-3 rounded-rg-card bg-rg-fill p-4">
      <legend className={`${STRONG} mb-2`}>{t.kind[row.kind]}</legend>
      {row.kind === "edrpou_registration" ? (
        <>
          <TextField
            id={id("edrpou")}
            label={uk.kabinet.profile.edrpou}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={row.edrpou}
            onChange={(event) => patch({ edrpou: event.target.value })}
            error={evidenceFieldMessage(errors.edrpou)}
          />
          {field(
            "registeredName",
            row.registeredName,
            t.field.registeredName,
            errors.registeredName,
          )}
          <p className={CAPTION}>{t.noDocument}</p>
        </>
      ) : null}
      {row.kind === "bank_account_holder" ? (
        <>
          {field("holderName", row.holderName, t.field.holderName, errors.holderName)}
          <p className={CAPTION}>{t.noDocument}</p>
        </>
      ) : null}
      {row.kind === "reference_contact" ? (
        <>
          {field("name", row.name, t.field.who, errors.name)}
          <fieldset className="flex min-w-0 flex-col gap-3">
            <legend className={`${STRONG} mb-2`}>{t.field.channel}</legend>
            <SelectField
              id={id("channelKind")}
              label={uk.kabinet.profileEdit.contacts.otherKind}
              value={row.channelKind}
              onChange={(event) => patch({ channelKind: event.target.value as ChannelKind })}
            >
              {REFERENCE_CHANNEL_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {uk.kabinet.profileChannel[kind]}
                </option>
              ))}
            </SelectField>
            <TextField
              id={id("channelValue")}
              label={uk.kabinet.profileChannel[row.channelKind]}
              type="text"
              inputMode={inputModeOf(row.channelKind)}
              autoComplete="off"
              value={row.channelValue}
              onChange={(event) => patch({ channelValue: event.target.value })}
              error={evidenceFieldMessage(errors.channelValue)}
            />
          </fieldset>
          <SelectField
            id={id("relationship")}
            label={t.field.relationship}
            value={row.relationship}
            onChange={(event) =>
              patch({ relationship: event.target.value as ReferenceRelationship | "" })
            }
            error={evidenceFieldMessage(errors.relationship)}
          >
            <option value="" />
            {REFERENCE_RELATIONSHIPS.map((relationship) => (
              <option key={relationship} value={relationship}>
                {t.relationship[relationship]}
              </option>
            ))}
          </SelectField>
        </>
      ) : null}
      {row.kind === "site_visit" ? (
        <>
          <TextField
            id={id("visitedOn")}
            label={t.field.visitedOn}
            type="date"
            max={today}
            value={row.visitedOn}
            onChange={(event) => patch({ visitedOn: event.target.value })}
            // The hint and the refusal are the same sentence: one at a time.
            hint={errors.visitedOn === undefined ? t.siteVisitDateHint : undefined}
            error={evidenceFieldMessage(errors.visitedOn)}
          />
          <TextAreaField
            id={id("notes")}
            label={t.field.notes}
            value={row.notes}
            onChange={(event) => patch({ notes: event.target.value })}
            error={evidenceFieldMessage(errors.notes)}
          />
        </>
      ) : null}
      <Button variant="text" className="self-start" onClick={remove}>
        {t.remove}
      </Button>
    </fieldset>
  );
}
