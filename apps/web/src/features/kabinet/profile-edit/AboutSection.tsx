"use client";

import "../../../zod-client-config";
import type { KabinetShelterView } from "@opika/contracts";
import { ANIMAL_DESCRIPTION_MAX_CHARACTERS } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { useId, useState } from "react";
import { FormSection } from "../../../ui/FormSection";
import { TextArea } from "../../../ui/form";
import { Text } from "../../../ui/Text";
import { type SectionResult, useSectionControls } from "../shared/page-save";
import { useUnsavedChanges } from "../shared/unsaved-changes";
import { sameStoredValue, type WriteResult } from "../shared/write-result";
import { aboutLength, aboutOverBy, aboutTextOf } from "./fields";

const integer = new Intl.NumberFormat("uk");

/** The counter becomes a live region this close to the cap, not on every keystroke. */
export const ANNOUNCE_WITHIN = 100;

type Description = KabinetShelterView["description"];

/**
 * The shelter's text for its own page («Про притулок»): one text area, the animal form's counter,
 * saved on its own. A stored text over the cap loads as it is, with the over-state counter and the
 * message at once (the read side never refuses it), but the section is not dirty until it is edited,
 * so it never blocks saving the other sections; only its own save is refused while over.
 *
 * The English translation goes back as stored; the server drops it when the Ukrainian changed.
 * A blank text is saved as no text.
 */
export function AboutSection({
  description,
  save,
  reload,
}: {
  description: Description;
  save: (next: Description) => Promise<WriteResult>;
  reload: () => Promise<KabinetShelterView | null>;
}) {
  const t = uk.kabinet.profileEdit;
  const id = useId();
  const [base, setBase] = useState(description);
  const [text, setText] = useState(description?.uk ?? "");
  // The server counted more than the page did (a browser segmenting an emoji differently).
  const [serverRefused, setServerRefused] = useState(false);
  const dirty = text !== (base?.uk ?? "");
  useUnsavedChanges("about", dirty);

  const reset = (to: Description) => {
    setBase(to);
    setText(to?.uk ?? "");
    setServerRefused(false);
  };

  const fieldId = `${id}-about`;
  const focusField = () => document.getElementById(fieldId)?.focus();
  const over = aboutOverBy(text);
  const tooLong = over > 0 || serverRefused;

  const onSave = async (): Promise<SectionResult> => {
    if (aboutOverBy(text) > 0) {
      focusField();
      return { kind: "invalid", count: 1 };
    }
    const typed = aboutTextOf(text);
    const next: Description = typed === null ? null : { uk: typed, en: base?.en ?? null };
    const result = await save(next);
    if (result.kind === "ok") {
      reset(result.view.description);
      return { kind: "ok" };
    }
    if (result.kind === "no_answer") {
      // The answer was lost; read what is stored now (inbox K4-T16). The Ukrainian decides: the
      // server may have dropped the English.
      const view = await reload();
      if (view !== null && sameStoredValue(view.description?.uk ?? null, next?.uk ?? null)) {
        reset(view.description);
        return { kind: "ok" };
      }
      return { kind: "failed" };
    }
    if (result.kind === "description_too_long") {
      setServerRefused(true);
      focusField();
      return { kind: "invalid", count: 1 };
    }
    return result.kind === "conflict" ? { kind: "conflict" } : { kind: "failed" };
  };

  const onReload = async () => {
    const view = await reload();
    if (view !== null) reset(view.description);
  };
  useSectionControls("about", dirty, {
    save: onSave,
    cancel: () => reset(base),
    reload: () => void onReload(),
    focusProblem: focusField,
  });

  const length = aboutLength(text);
  const counterId = `${id}-counter`;
  const max = ANIMAL_DESCRIPTION_MAX_CHARACTERS;
  const counter = uk.kabinet.animalForm.description;

  return (
    <FormSection id="about" title={uk.shelterPage.aboutHeading}>
      <TextArea
        id={fieldId}
        label={uk.shelterPage.aboutHeading}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setServerRefused(false);
        }}
        error={tooLong ? fillTemplate(t.errors.aboutTooLong, { max: integer.format(max) }) : null}
        describedBy={[counterId]}
        hint={t.about.hint}
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <p
          id={counterId}
          aria-live={max - length <= ANNOUNCE_WITHIN ? "polite" : "off"}
          className={over > 0 ? "text-label text-ink" : "text-caption text-ink-2"}
        >
          {over > 0
            ? fillTemplate(counter.counterOver, { over: integer.format(over) })
            : fillTemplate(counter.counter, {
                count: integer.format(length),
                max: integer.format(max),
              })}
        </p>
      </div>
      <Text look="hint">{t.actions.liveOnSave.about}</Text>
    </FormSection>
  );
}
