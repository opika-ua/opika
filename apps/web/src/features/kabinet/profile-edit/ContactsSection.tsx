"use client";

import type { KabinetShelterView } from "@opika/contracts";
import { uk } from "@opika/i18n";
import { useId, useState } from "react";
import { FormSection } from "../../../ui/FormSection";
import { ContactFields, type ContactsErrors, NO_CONTACT_ERRORS } from "./ContactFields";
import { type ContactsForm, contactOfForm, contactsFormOf, sameContactsForm } from "./fields";
import { SaveBar, type SaveState } from "./SaveBar";
import { useUnsavedChanges } from "./unsaved-changes";
import { sameStoredValue, type WriteResult } from "./write-result";

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
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const dirty = !sameContactsForm(form, contactsFormOf(base));
  useUnsavedChanges("contacts", dirty);

  const reset = (to: KabinetShelterView["contact"]) => {
    setBase(to);
    setForm(contactsFormOf(to));
    setErrors(NO_CONTACT_ERRORS);
  };

  const onSave = async () => {
    const checked = contactOfForm(form);
    if (checked.kind === "invalid") {
      setErrors(checked);
      setState({ kind: "idle" });
      focusFirstProblem(id, form, checked);
      return;
    }
    setErrors(NO_CONTACT_ERRORS);
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

  return (
    <FormSection
      id="contacts"
      title={uk.kabinet.profile.contactsTitle}
      description={uk.kabinet.profile.contactsNote}
    >
      <ContactFields idPrefix={id} form={form} update={setForm} errors={errors} />
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
    </FormSection>
  );
}
