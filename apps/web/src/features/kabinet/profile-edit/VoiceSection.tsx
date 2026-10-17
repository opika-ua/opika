"use client";

import type { KabinetShelterView } from "@opika/contracts";
import { ANIMAL_NAME_TOKEN, type FreshnessSentence, fillAnimalName } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { useId, useRef, useState } from "react";
import { ShelterFreshnessBlock } from "../../animal-detail/ShelterFreshnessBlock";
import { Button, TextAreaField } from "../../controls/controls";
import type { PreviewAnimal } from "../home";
import {
  insertAt,
  SENTENCE_MAX,
  type SentenceError,
  sentenceCheck,
  sentenceLength,
} from "./fields";
import { SaveBar, type SaveState } from "./SaveBar";
import { CAPTION, CARD, CARD_TITLE, ERROR_TEXT } from "./styles";
import { useUnsavedChanges } from "./unsaved-changes";
import { sameStoredValue, type WriteResult } from "./write-result";

/** The counter becomes a live region this close to the limit, not on every keystroke. */
export const ANNOUNCE_WITHIN = 20;

const messageOf = (error: SentenceError): string => {
  const t = uk.kabinet.profileEdit.errors;
  switch (error.key) {
    case "sentenceTooLong":
      return fillTemplate(t.sentenceTooLong, { max: String(SENTENCE_MAX) });
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
 * counter, a button that inserts `{імʼя}` at the cursor (answer 7; most
 * keyboards here can't type ʼ, and the server normalises the other spellings
 * anyway), and a live preview in the animal page's own freshness block with
 * one of the shelter's animals. Saved on its own (answer 1).
 *
 * The English translation is sent back as stored; the server drops it when
 * the Ukrainian changes (answer 13), so this form never edits English.
 */
export function VoiceSection({
  sentence,
  previewAnimal,
  save,
  reload,
}: {
  sentence: FreshnessSentence;
  previewAnimal: PreviewAnimal | null;
  save: (next: FreshnessSentence) => Promise<WriteResult>;
  reload: () => Promise<KabinetShelterView | null>;
}) {
  const t = uk.kabinet.profileEdit;
  const id = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [base, setBase] = useState(sentence);
  const [text, setText] = useState(sentence?.uk ?? "");
  const [error, setError] = useState<SentenceError | null>(null);
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const dirty = text !== (base?.uk ?? "");
  useUnsavedChanges("voice", dirty);

  const reset = (to: FreshnessSentence) => {
    setBase(to);
    setText(to?.uk ?? "");
    setError(null);
  };

  const onSave = async () => {
    const checked = sentenceCheck(text);
    if (checked.kind === "invalid") {
      setError(checked.error);
      setState({ kind: "idle" });
      return;
    }
    setError(null);
    setState({ kind: "saving" });
    const next: FreshnessSentence =
      checked.text === null ? null : { uk: checked.text, en: base?.en ?? null };
    const result = await save(next);
    if (result.kind === "ok") {
      reset(result.view.freshnessSentence);
      setState({ kind: "saved", at: new Date() });
    } else if (result.kind === "no_answer") {
      // The answer was lost; read what is stored now (inbox K4-T16). The
      // Ukrainian decides: the server may have dropped the English (answer 13).
      const view = await reload();
      if (view !== null && sameStoredValue(view.freshnessSentence?.uk ?? null, next?.uk ?? null)) {
        reset(view.freshnessSentence);
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
    reset(view.freshnessSentence);
    setState({ kind: "idle" });
  };

  const insertName = () => {
    const area = textareaRef.current;
    const start = area?.selectionStart ?? text.length;
    const end = area?.selectionEnd ?? text.length;
    const next = insertAt(text, start, end, ANIMAL_NAME_TOKEN);
    setText(next.value);
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(next.caret, next.caret);
    });
  };

  const length = sentenceLength(text);
  const over = length - SENTENCE_MAX;
  // The preview shows the text as it would be stored when it is valid, and as
  // typed otherwise, so a stray brace shows in the preview too.
  const checked = sentenceCheck(text);
  const previewText = checked.kind === "ok" ? checked.text : text.trim() || null;
  const counterId = `${id}-counter`;

  return (
    <section aria-labelledby={`${id}-title`} className={CARD}>
      <h2 id={`${id}-title`} className={CARD_TITLE}>
        {uk.kabinet.profile.voiceTitle}
      </h2>
      <TextAreaField
        id={`${id}-sentence`}
        ref={textareaRef}
        label={uk.kabinet.profile.voiceLabel}
        value={text}
        onChange={(event) => setText(event.target.value)}
        error={error === null ? null : messageOf(error)}
        describedBy={[counterId]}
        hint={
          <>
            <p>{t.voice.hint}</p>
            <p>{t.voice.nameStaysHint}</p>
            <p>{t.voice.emptyMeans}</p>
          </>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="secondary" onClick={insertName}>
          {t.voice.insertName}
        </Button>
        <p
          id={counterId}
          aria-live={over > -ANNOUNCE_WITHIN ? "polite" : "off"}
          className={over > 0 ? ERROR_TEXT : CAPTION}
        >
          {over > 0
            ? fillTemplate(t.voice.counterOver, { over: String(over) })
            : fillTemplate(t.voice.counter, { count: String(length), max: String(SENTENCE_MAX) })}
        </p>
      </div>

      <div className="flex flex-col gap-2" data-testid="voice-preview">
        {previewAnimal === null ? (
          <p className={CAPTION}>{t.voice.previewNoAnimals}</p>
        ) : (
          <>
            <p className={CAPTION}>
              {fillTemplate(t.voice.previewLabel, { name: previewAnimal.name })}
            </p>
            <ShelterFreshnessBlock
              freshness={previewAnimal.freshness}
              sentence={
                previewText === null ? null : fillAnimalName(previewText, previewAnimal.name)
              }
            />
            {previewText === null ? <p className={CAPTION}>{t.voice.previewEmpty}</p> : null}
          </>
        )}
      </div>

      <SaveBar
        state={state}
        dirty={dirty}
        caption={t.actions.liveOnSave.voice}
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
