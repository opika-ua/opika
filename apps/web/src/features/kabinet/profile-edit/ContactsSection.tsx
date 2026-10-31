"use client";

import type { KabinetShelterView } from "@opika/contracts";
import { uk } from "@opika/i18n";
import { useId, useState } from "react";
import { FormSection } from "../../../ui/FormSection";
import { Text } from "../../../ui/Text";
import { type SectionResult, useSectionControls } from "../shared/page-save";
import { useUnsavedChanges } from "../shared/unsaved-changes";
import { sameStoredValue, type WriteResult } from "../shared/write-result";
import { ContactFields, type ContactsErrors, NO_CONTACT_ERRORS } from "./ContactFields";
import { type ContactsForm, contactOfForm, contactsFormOf, sameContactsForm } from "./fields";

/**
 * A refused save moves focus to the first field that needs fixing (the form is short and the
 * messages sit under their fields, so a separate summary would only repeat them). With no channel
 * at all there is no one field to blame: the phone is where a person starts.
 */
function focusFirstProblem(prefix: string, form: ContactsForm, errors: ContactsErrors): void {
  const otherId = form.others.find((row) => errors.others[row.id] !== undefined)?.id;
  const target =
    errors.phone !== null
      ? `${prefix}-phone`
      : errors.telegram !== null
        ? `${prefix}-telegram`
        : otherId !== undefined
          ? `${prefix}-${otherId}-value`
          : `${prefix}-phone`;
  document.getElementById(target)?.focus();
}

/**
 * K4's contacts (N6 fields, answer 3; the fields themselves are
 * `ContactFields`, shared with the operator's create form). Saved on its own
 * (answer 1), compare-and-set on the version it read.
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
  const id = useId();
  const [base, setBase] = useState(contact);
  const [form, setForm] = useState<ContactsForm>(() => contactsFormOf(contact));
  const [errors, setErrors] = useState<ContactsErrors>(NO_CONTACT_ERRORS);
  const dirty = !sameContactsForm(form, contactsFormOf(base));
  useUnsavedChanges("contacts", dirty);

  const reset = (to: KabinetShelterView["contact"]) => {
    setBase(to);
    setForm(contactsFormOf(to));
    setErrors(NO_CONTACT_ERRORS);
  };

  const onSave = async (): Promise<SectionResult> => {
    const checked = contactOfForm(form);
    if (checked.kind === "invalid") {
      setErrors(checked);
      focusFirstProblem(id, form, checked);
      const count =
        (checked.phone === null ? 0 : 1) +
        (checked.telegram === null ? 0 : 1) +
        Object.keys(checked.others).length;
      return { kind: "invalid", count: Math.max(count, 1) };
    }
    setErrors(NO_CONTACT_ERRORS);
    const result = await save(checked.contact);
    if (result.kind === "ok") {
      reset(result.view.contact);
      return { kind: "ok" };
    }
    if (result.kind === "no_answer") {
      // The answer was lost; read what is stored now (inbox K4-T16).
      const view = await reload();
      if (view !== null && sameStoredValue(view.contact, checked.contact)) {
        reset(view.contact);
        return { kind: "ok" };
      }
      return { kind: "failed" };
    }
    return result.kind === "conflict" ? { kind: "conflict" } : { kind: "failed" };
  };

  const onCancel = () => reset(base);
  const onReload = async () => {
    const view = await reload();
    if (view !== null) reset(view.contact);
  };
  useSectionControls("contacts", dirty, {
    save: onSave,
    cancel: onCancel,
    reload: () => void onReload(),
    focusProblem: () => focusFirstProblem(id, form, errors),
  });

  return (
    <FormSection
      id="contacts"
      title={uk.kabinet.profile.contactsTitle}
      description={uk.kabinet.profile.contactsNote}
    >
      <ContactFields idPrefix={id} form={form} update={setForm} errors={errors} />
      <Text look="hint">{t.actions.liveOnSave.contacts}</Text>
    </FormSection>
  );
}
