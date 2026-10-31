"use client";

import type { KabinetShelterView } from "@opika/contracts";
import type { FreshnessSentence } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { useId, useState } from "react";
import { FormSection } from "../../../ui/FormSection";
import { TextArea } from "../../../ui/form";
import { Text } from "../../../ui/Text";
import { ShelterWordsSection } from "../../shelters/ShelterWordsSection";
import { type SectionResult, useSectionControls } from "../shared/page-save";
import { useUnsavedChanges } from "../shared/unsaved-changes";
import { sameStoredValue, type WriteResult } from "../shared/write-result";
import { SENTENCE_MAX, type SentenceError, sentenceCheck, sentenceLength } from "./fields";

/** The counter becomes a live region this close to the limit, not on every keystroke. */
export const ANNOUNCE_WITHIN = 20;

const messageOf = (error: SentenceError): string => {
  const t = uk.kabinet.profileEdit.errors;
  switch (error.key) {
    case "sentenceTooLong":
      return fillTemplate(t.sentenceTooLong, { max: String(SENTENCE_MAX) });
    case "nameTokenGone":
      return t.nameTokenGone;
    case "unknownToken":
      return fillTemplate(t.unknownToken, { token: error.token });
    case "dateTokenGone":
      return t.dateTokenGone;
    case "strayBrace":
      return t.strayBrace;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled error; unreachable at runtime */
    default: {
      const unreachable: never = error;
      return unreachable;
    }
  }
};

/**
 * K4's voice editor (N11, VH-Q1, K-Q6): one sentence, a 280-character
 * counter, and a live preview in the shelter page's own «Слова притулку»
 * section (designer round 1, S6), so the preview can't drift from the page it
 * claims to show. Saved on its own (answer 1).
 *
 * Since DR1-Q5 the sentence is shelter-level: `{імʼя}` is refused, so the
 * button that inserted it (answer 7) is gone, and the preview needs no animal.
 *
 * The English translation is sent back as stored; the server drops it when
 * the Ukrainian changes (answer 13), so this form never edits English.
 */
export function VoiceSection({
  sentence,
  save,
  reload,
}: {
  sentence: FreshnessSentence;
  save: (next: FreshnessSentence) => Promise<WriteResult>;
  reload: () => Promise<KabinetShelterView | null>;
}) {
  const t = uk.kabinet.profileEdit;
  const id = useId();
  const [base, setBase] = useState(sentence);
  const [text, setText] = useState(sentence?.uk ?? "");
  const [error, setError] = useState<SentenceError | null>(null);
  const dirty = text !== (base?.uk ?? "");
  useUnsavedChanges("voice", dirty);

  const reset = (to: FreshnessSentence) => {
    setBase(to);
    setText(to?.uk ?? "");
    setError(null);
  };

  const focusSentence = () => document.getElementById(`${id}-sentence`)?.focus();

  const onSave = async (): Promise<SectionResult> => {
    const checked = sentenceCheck(text);
    if (checked.kind === "invalid") {
      setError(checked.error);
      focusSentence();
      return { kind: "invalid", count: 1 };
    }
    setError(null);
    const next: FreshnessSentence =
      checked.text === null ? null : { uk: checked.text, en: base?.en ?? null };
    const result = await save(next);
    if (result.kind === "ok") {
      reset(result.view.freshnessSentence);
      return { kind: "ok" };
    }
    if (result.kind === "no_answer") {
      // The answer was lost; read what is stored now (inbox K4-T16). The
      // Ukrainian decides: the server may have dropped the English (answer 13).
      const view = await reload();
      if (view !== null && sameStoredValue(view.freshnessSentence?.uk ?? null, next?.uk ?? null)) {
        reset(view.freshnessSentence);
        return { kind: "ok" };
      }
      return { kind: "failed" };
    }
    return result.kind === "conflict" ? { kind: "conflict" } : { kind: "failed" };
  };

  const onCancel = () => reset(base);
  const onReload = async () => {
    const view = await reload();
    if (view !== null) reset(view.freshnessSentence);
  };
  useSectionControls("voice", dirty, {
    save: onSave,
    cancel: onCancel,
    reload: () => void onReload(),
    focusProblem: focusSentence,
  });

  const length = sentenceLength(text);
  const over = length - SENTENCE_MAX;
  // The preview shows the text as it would be stored when it is valid, and as
  // typed otherwise, so a stray brace shows in the preview too.
  const checked = sentenceCheck(text);
  const previewText = checked.kind === "ok" ? checked.text : text.trim() || null;
  const counterId = `${id}-counter`;

  return (
    <FormSection id="voice" title={uk.kabinet.profile.voiceTitle}>
      <TextArea
        id={`${id}-sentence`}
        label={uk.kabinet.profile.voiceLabel}
        value={text}
        onChange={(event) => setText(event.target.value)}
        error={error === null ? null : messageOf(error)}
        describedBy={[counterId]}
        hint={
          <>
            <p>{t.voice.hint}</p>
            <p>{t.voice.emptyMeans}</p>
          </>
        }
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <p
          id={counterId}
          aria-live={over > -ANNOUNCE_WITHIN ? "polite" : "off"}
          className={over > 0 ? "text-label text-ink" : "text-caption text-ink-2"}
        >
          {over > 0
            ? fillTemplate(t.voice.counterOver, { over: String(over) })
            : fillTemplate(t.voice.counter, { count: String(length), max: String(SENTENCE_MAX) })}
        </p>
      </div>

      <div className="flex flex-col gap-2" data-testid="voice-preview">
        {previewText === null ? (
          <Text look="hint">{t.voice.previewEmpty}</Text>
        ) : (
          <>
            <Text look="hint">{t.voice.previewLabel}</Text>
            <ShelterWordsSection
              words={{ description: null, sentence: previewText }}
              headingLevel={3}
            />
          </>
        )}
      </div>

      <Text look="hint">{t.actions.liveOnSave.voice}</Text>
    </FormSection>
  );
}
