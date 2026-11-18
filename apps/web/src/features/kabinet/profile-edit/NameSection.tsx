"use client";

import "../../../zod-client-config";
import type { KabinetShelterView } from "@opika/contracts";
import { isShelterDisplayNameTooLong, SHELTER_DISPLAY_NAME_MAX_CHARACTERS } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { useId, useState } from "react";
import { FormSection } from "../../../ui/FormSection";
import { TextField } from "../../../ui/form";
import { type SectionResult, useSectionControls } from "../shared/page-save";
import { useUnsavedChanges } from "../shared/unsaved-changes";
import type { WriteResult } from "../shared/write-result";

const integer = new Intl.NumberFormat("uk");

type Problem = "required" | "too_long";

const problemOf = (name: string): Problem | null =>
  name.trim() === "" ? "required" : isShelterDisplayNameTooLong(name.trim()) ? "too_long" : null;

/**
 * The shelter's public name (§4, D4): instant on save and logged in the operator's history with
 * the admin as actor. Saved on its own through the page bar, like the text about the shelter.
 */
export function NameSection({
  displayName,
  save,
  reload,
}: {
  displayName: string;
  save: (next: string) => Promise<WriteResult>;
  reload: () => Promise<KabinetShelterView | null>;
}) {
  const id = useId();
  const fieldId = `${id}-name`;
  const [base, setBase] = useState(displayName);
  const [value, setValue] = useState(displayName);
  const [shown, setShown] = useState<Problem | null>(null);
  const dirty = value.trim() !== base;
  useUnsavedChanges("name", dirty);

  const reset = (to: string) => {
    setBase(to);
    setValue(to);
    setShown(null);
  };
  const focusField = () => document.getElementById(fieldId)?.focus();
  const refuse = (problem: Problem): SectionResult => {
    setShown(problem);
    focusField();
    return { kind: "invalid", count: 1 };
  };

  const onSave = async (): Promise<SectionResult> => {
    const problem = problemOf(value);
    if (problem !== null) return refuse(problem);
    const next = value.trim();
    const result = await save(next);
    if (result.kind === "ok") {
      reset(result.view.displayName);
      return { kind: "ok" };
    }
    if (result.kind === "no_answer") {
      // The answer was lost; the stored name says whether it landed (inbox K4-T16).
      const view = await reload();
      if (view !== null && view.displayName === next) {
        reset(view.displayName);
        return { kind: "ok" };
      }
      return { kind: "failed" };
    }
    if (result.kind === "name_too_long") return refuse("too_long");
    return result.kind === "conflict" ? { kind: "conflict" } : { kind: "failed" };
  };

  const onReload = async () => {
    const view = await reload();
    if (view !== null) reset(view.displayName);
  };
  useSectionControls("name", dirty, {
    save: onSave,
    cancel: () => reset(base),
    reload: () => void onReload(),
    focusProblem: focusField,
  });

  const label = uk.registration.name.label;
  const error =
    shown === "required"
      ? uk.registration.errors.required
      : shown === "too_long"
        ? fillTemplate(uk.kabinet.operator.create.errors.nameTooLong, {
            max: integer.format(SHELTER_DISPLAY_NAME_MAX_CHARACTERS),
          })
        : null;

  return (
    <FormSection id="name" title={label} titleless>
      <TextField
        id={fieldId}
        label={label}
        autoComplete="organization"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setShown(null);
        }}
        error={error}
        hint={uk.registration.name.help}
      />
    </FormSection>
  );
}
