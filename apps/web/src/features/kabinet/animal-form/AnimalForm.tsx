"use client";

import type { KabinetAnimalView } from "@opika/contracts";
import { isDiscoverable, kyivCalendarDateOf, type PublishGap } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  type KabinetAnimalClient,
  kabinetAnimalBrowserClient,
} from "../../../api/kabinet-browser-client";
import { Button, buttonClass } from "../../controls/controls";
import type { CompressedPhoto } from "../photos/compress-photo";
import { CAPTION, ERROR_TEXT } from "../profile-edit/styles";
import { clearUnsavedNow, confirmLeave, useUnsavedChanges } from "../profile-edit/unsaved-changes";
import { AgeSection, DescriptionSection, HealthSection, WhoSection } from "./FormSections";
import {
  type AnimalPatch,
  ageInputOf,
  emptyValues,
  type FieldProblem,
  type FormValues,
  patchOf,
  problemsOf,
  valuesEqual,
  valuesOf,
} from "./form-values";
import {
  createdWhen,
  missingSentence,
  publishedAnnouncementOf,
  type ShelterVisibility,
  timeOf,
} from "./labels";
import { PhotoSection } from "./PhotoSection";

/**
 * K3 · add / edit animal (KABINET K3; `docs/k3-copy-sheet.md`). One page,
 * not a wizard: «Хто це», «Вік», «Опис», then «Фото» and «Медичний стан».
 *
 * **A draft saves itself** (KAB:179): 10 seconds after the last change and
 * when a field is left (decision taken T6, so a typing session writes a few
 * history lines, not one per 10 s), and at once with «Зберегти чернетку».
 * On `/nova` the first save that has a name and a species creates the draft
 * (K-Q5) and the address becomes the animal's own. **A listed animal saves
 * only when asked** (T8): its card is public, and an autosave would put a
 * half-typed sentence on it.
 *
 * Every save sends only what changed (`patchOf`), compare-and-set on the
 * version it last read (S3-T6); a conflict stops the autosave until the
 * current version is shown. Photo writes never touch the version (P-Q3), so
 * they and the form never conflict.
 *
 * **Publishing** saves pending edits first, then publishes. While anything
 * is missing the button stays focusable with `aria-disabled` and the gaps
 * written next to it (KAB:93), in form order (K-Q5).
 *
 * Writes are offered exactly when the API would accept them: `editing` is
 * the page's own `decideAccess` answer with the served policy. A support view
 * gets the same page read-only.
 */

const t = uk.kabinet.animalForm;
const AUTOSAVE_AFTER_MS = 10_000;

export type AnimalFormEditing = { kind: "open" } | { kind: "read_only" };

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "failed" }
  | { kind: "conflict" }
  | { kind: "registry_confirmed" };

/** How a save ended, with the animal as the server last returned it (null before `/nova`'s first save). */
type SaveOutcome = {
  kind: "saved" | "nothing" | "invalid" | "refused";
  view: KabinetAnimalView | null;
};

const codeOf = (error: unknown): string | null =>
  typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : null;

const dataOf = (error: unknown): unknown =>
  typeof error === "object" && error !== null && "data" in error ? error.data : undefined;

/** What still keeps the form's current content from publishing, in form order (K-Q5, as `publishReadinessOf`). */
const gapsOf = (values: FormValues, photoCount: number): PublishGap[] => [
  ...(values.size === null ? [{ kind: "size" } as const] : []),
  ...(ageInputOf(values) === null ? [{ kind: "age" } as const] : []),
  ...(values.description.trim() === "" ? [{ kind: "description" } as const] : []),
  ...(photoCount === 0 ? [{ kind: "photo" } as const] : []),
];

export function AnimalForm({
  initialView,
  editing,
  viewer,
  shelterVisibility,
  back,
  client = kabinetAnimalBrowserClient,
  clock = () => new Date(),
  compress,
}: {
  /** Null on `/nova`, until the first save creates the draft. */
  initialView: KabinetAnimalView | null;
  editing: AnimalFormEditing;
  viewer: "admin" | "support";
  /** Where the shelter's cards stand with the public (`shelterVisibilityOf`). */
  shelterVisibility: ShelterVisibility;
  back: { href: string; label: string };
  client?: KabinetAnimalClient;
  clock?: () => Date;
  compress?: (file: File) => Promise<CompressedPhoto>;
}) {
  const editable = editing.kind === "open" && viewer === "admin";

  const [view, setView] = useState<KabinetAnimalView | null>(initialView);
  const [values, setValues] = useState<FormValues>(() =>
    initialView === null
      ? emptyValues(kyivCalendarDateOf(clock()))
      : valuesOf(initialView, kyivCalendarDateOf(clock())),
  );
  const [touched, setTouched] = useState<ReadonlySet<FieldProblem["field"]>>(new Set());
  const [attempted, setAttempted] = useState(false);
  const [serverProblems, setServerProblems] = useState<FieldProblem[]>([]);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [announcement, setAnnouncement] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const inFlight = useRef<Promise<SaveOutcome> | null>(null);
  // How many `saveNow` calls are pending or queued right now: incremented
  // the instant a call is made, decremented only once that call's own
  // turn is fully done. See the inbox (UW-T2) for why this is needed
  // alongside `dirty`, not redundant with it.
  const pendingSaveCount = useRef(0);
  const [savePending, setSavePending] = useState(false);
  // The latest server view and fields, for a save that was queued behind
  // another: it must send the version the first one left, not the one its
  // render saw, or it would conflict with its own form's save.
  const viewRef = useRef(view);
  viewRef.current = view;
  const valuesRef = useRef(values);
  valuesRef.current = values;
  // `/nova`'s own starting point, captured once, to tell "nothing typed
  // yet" from "something typed" before a name and a species exist to diff
  // against (UW-T5).
  const initialValuesRef = useRef(values);

  const now = clock();
  const listingKind = view?.listing.kind ?? "new";
  const isDraft = listingKind === "new" || listingKind === "draft";
  const problems = [...problemsOf(values, listingKind, now), ...serverProblems];
  const shownProblems = attempted ? problems : problems.filter((p) => touched.has(p.field));
  const patch: AnimalPatch | null = view === null ? null : patchOf(view, values);
  const creatable = values.name.trim() !== "" && values.species !== null;
  const dirty = view === null ? !valuesEqual(values, initialValuesRef.current) : patch !== null;
  const gaps = gapsOf(values, view?.photos.length ?? 0);

  // Oleksii, 2026-10-19 (UW-B2) and the review that followed it: warn while
  // there's unsaved work — dirty, a save pending or queued, or (his
  // recommendation) a publish request in flight — never otherwise, for a
  // draft and a listed card alike. Rationale and what was decided:
  // docs/decisions-inbox/feat-draft-save-unload-warning.md (UW-T2, UW-T6).
  const hasUnsavedWork = dirty || savePending || publishing;
  useUnsavedChanges("animal-form", editable && hasUnsavedWork);

  const set = useCallback((change: Partial<FormValues>) => {
    setValues((current) => ({ ...current, ...change }));
    setServerProblems((current) =>
      current.filter((problem) => !Object.keys(change).some((key) => problem.field === key)),
    );
  }, []);

  const runSave = useCallback(async (): Promise<SaveOutcome> => {
    let current = viewRef.current;
    const values = valuesRef.current;
    if (!editable) return { kind: "nothing", view: current };
    const blocking = problemsOf(values, current?.listing.kind ?? "new", clock());
    if (blocking.length > 0 || (current === null && values.species === null)) {
      setAttempted(true);
      return { kind: "invalid", view: current };
    }
    // Nothing to write: nothing sent, and the last save's time stays as it was.
    if (current !== null && patchOf(current, values) === null)
      return { kind: "nothing", view: current };
    const keep = (next: KabinetAnimalView): KabinetAnimalView => {
      viewRef.current = next;
      setView(next);
      return next;
    };
    setSave({ kind: "saving" });
    try {
      let saved: KabinetAnimalView;
      let wrote = false;
      if (current === null) {
        if (values.species === null) return { kind: "invalid", view: null };
        saved = keep(
          await client.shelter.animals.createDraft({ name: values.name, species: values.species }),
        );
        wrote = true;
        // The draft now has an address of its own; keep this page, change the URL.
        window.history.replaceState(null, "", `/kabinet/tvaryny/${saved.id}`);
      } else {
        saved = current;
      }
      current = saved;
      const rest = patchOf(saved, values);
      if (rest !== null) {
        current = keep(
          await client.shelter.animals.update({
            animalId: saved.id,
            expectedVersion: saved.version,
            patch: rest,
          }),
        );
        wrote = true;
      }
      if (wrote) setSave({ kind: "saved", at: clock() });
      return { kind: wrote ? "saved" : "nothing", view: current };
    } catch (error) {
      switch (codeOf(error)) {
        case "CONFLICT":
          setSave({ kind: "conflict" });
          break;
        case "REGISTRY_CONFIRMED":
          setSave({ kind: "registry_confirmed" });
          break;
        case "LISTING_FACT_REQUIRED":
          setServerProblems([{ field: "description", key: "requiredOnceListed" }]);
          setAttempted(true);
          setSave({ kind: "idle" });
          break;
        case "AGE_DATE_OUT_OF_RANGE": {
          const problem = (dataOf(error) as { problem?: string } | undefined)?.problem;
          const birth = values.ageMode === "birth_date";
          setServerProblems([
            problem === "future"
              ? birth
                ? { field: "birthDate", key: "birthDateFuture" }
                : { field: "asOf", key: "asOfFuture" }
              : { field: birth ? "birthDate" : "asOf", key: "dateTooOld" },
          ]);
          setAttempted(true);
          setSave({ kind: "idle" });
          break;
        }
        default:
          setSave({ kind: "failed" });
      }
      return { kind: "refused", view: current };
    }
  }, [client, clock, editable]);

  /** One save at a time: a second request waits for the first, then saves what is left. */
  const saveNow = useCallback(async (): Promise<SaveOutcome> => {
    pendingSaveCount.current += 1;
    setSavePending(true);
    try {
      while (inFlight.current !== null) await inFlight.current;
      const promise = runSave();
      inFlight.current = promise;
      try {
        return await promise;
      } finally {
        inFlight.current = null;
      }
    } finally {
      pendingSaveCount.current -= 1;
      if (pendingSaveCount.current === 0) setSavePending(false);
    }
  }, [runSave]);

  const autosaving = editable && isDraft && creatable && save.kind !== "conflict";

  // A draft: 10 s after the last change (T6). Each change restarts the wait:
  // `values` is a dependency for that alone (a new object on every change),
  // so typing a description saves once the typing stops, not every 10 s.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `values` restarts the timer; the save reads it through `valuesRef`.
  useEffect(() => {
    if (!autosaving || !dirty) return;
    const timer = window.setTimeout(() => void saveNow(), AUTOSAVE_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [autosaving, dirty, saveNow, values]);

  const reload = useCallback(async () => {
    if (view === null) return;
    try {
      const current = await client.shelter.animals.byId({ animalId: view.id });
      setView(current);
      setValues(valuesOf(current, kyivCalendarDateOf(clock())));
      setServerProblems([]);
      setSave({ kind: "idle" });
    } catch {
      setAnnouncement(t.errors.loadFailed);
    }
  }, [client, clock, view]);

  /** A photo write changes the photos, the edit time and (RH-B7) the listing: only those are taken from it. */
  const onPhotoView = useCallback((photoView: KabinetAnimalView) => {
    setView((current) =>
      current === null
        ? photoView
        : ({
            ...current,
            photos: photoView.photos,
            listing: photoView.listing,
            lastUpdatedAt: photoView.lastUpdatedAt,
          } as KabinetAnimalView),
    );
  }, []);

  const heading = view === null ? t.titleNew : view.name;
  const shelterShown = shelterVisibility === "visible";
  // Seen by people: a published or reserved card of a shelter whose cards
  // are on the public surfaces (verified, not paused). Both halves, because
  // the feed, the gallery and `animals.byId` each check both.
  const visibleListing = view !== null && isDiscoverable(view.listing) && shelterShown;
  // «Тепер картку бачать…» only where the card is shown, «…щойно притулок
  // пройде перевірку» only before a pass (never to a paused or suspended
  // shelter, which has passed): `publishedAnnouncementOf`.
  const publishedAnnouncement = publishedAnnouncementOf(shelterVisibility);

  const publish = async () => {
    if (!editable || publishing) return;
    if (gaps.length > 0) {
      setAnnouncement(missingSentence(gaps));
      return;
    }
    setPublishing(true);
    try {
      const saved = await saveNow();
      if (saved.kind === "invalid" || saved.kind === "refused" || saved.view === null) return;
      const next = await client.shelter.animals.transition({
        animalId: saved.view.id,
        event: { type: "publish" },
      });
      setView(next);
      setPublished(true);
      setAnnouncement(publishedAnnouncement);
    } catch (error) {
      switch (codeOf(error)) {
        case "PUBLISH_REQUIREMENTS_UNMET": {
          const serverGaps = (dataOf(error) as { gaps?: PublishGap[] } | undefined)?.gaps ?? gaps;
          setAnnouncement(missingSentence(serverGaps));
          break;
        }
        case "ILLEGAL_TRANSITION":
          setAnnouncement(t.publish.stateChanged);
          break;
        default:
          // The save before it went through (a failed save returns above),
          // so K4's «Не збереглося…» would misdescribe it. What is known is
          // that the card is still a draft, in his words; the footer already
          // says when it was saved, and «Опублікувати» stays to try again.
          setAnnouncement(t.draft.notVisible);
      }
    } finally {
      setPublishing(false);
    }
  };

  const leave = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!editable) return;
    if (isDraft && dirty && creatable) {
      event.preventDefault();
      await saveNow();
      // `location.assign` below fires `beforeunload` synchronously, before
      // React re-renders and runs the effect that would otherwise remove
      // the listener — so this intentional navigation is only ever waved
      // through once nothing is left unsaved (recomputed fresh from the
      // refs, not from the save's own outcome: more typing during the
      // await, or another save still pending, must still warn) (UW-T4).
      const currentView = viewRef.current;
      const currentValues = valuesRef.current;
      const stillDirty =
        currentView === null
          ? !valuesEqual(currentValues, initialValuesRef.current)
          : patchOf(currentView, currentValues) !== null;
      if (!stillDirty && pendingSaveCount.current === 0) clearUnsavedNow("animal-form");
      window.location.assign(back.href);
      return;
    }
    if (!isDraft && dirty && !confirmLeave()) event.preventDefault();
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 desktop:gap-6">
      <header className="flex flex-col gap-2">
        <a href={back.href} className={`self-start ${buttonClass("secondary")}`} onClick={leave}>
          {back.label}
        </a>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-rg-ink">{heading}</h1>
          {view !== null ? (
            <span className="rounded-rg-chip bg-rg-fill px-3 py-1 text-sm font-medium text-rg-ink-2">
              {uk.kabinet.listingStatus[view.listing.kind]}
            </span>
          ) : null}
        </div>
        {view !== null && view.listing.kind === "draft" ? (
          <p className={CAPTION}>
            {fillTemplate(t.header.createdNotPublished, { when: createdWhen(view.createdAt, now) })}
          </p>
        ) : null}
      </header>

      <form
        className="grid grid-cols-1 items-start gap-3 desktop:grid-cols-2 desktop:gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void saveNow();
        }}
        onBlur={(event) => {
          const field = fieldOfTarget(event.target);
          if (field !== null) setTouched((current) => new Set([...current, field]));
          if (autosaving && dirty) void saveNow();
        }}
      >
        <div className="flex min-w-0 flex-col gap-3 desktop:gap-4">
          <WhoSection values={values} set={set} problems={shownProblems} disabled={!editable} />
          <AgeSection
            values={values}
            set={set}
            problems={shownProblems}
            disabled={!editable}
            stored={view}
            now={now}
          />
          <DescriptionSection
            values={values}
            set={set}
            problems={shownProblems}
            disabled={!editable}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-3 desktop:gap-4">
          {view !== null ? (
            <PhotoSection
              animal={view}
              editable={editable}
              shelterVisibility={shelterVisibility}
              client={client}
              onView={onPhotoView}
              reload={reload}
              {...(compress === undefined ? {} : { compress })}
            />
          ) : null}
          <HealthSection
            values={values}
            set={set}
            disabled={!editable}
            vaccination={view?.vaccination ?? null}
          />
        </div>
      </form>

      {editable ? (
        <footer className="flex flex-col gap-3 rounded-rg-card bg-rg-surface p-4 tablet:p-6">
          {isDraft ? (
            <DraftFooter
              save={save}
              created={view !== null}
              creatable={creatable}
              dirty={dirty}
              gaps={gaps}
              publishing={publishing}
              onSave={() => void saveNow()}
              onPublish={() => void publish()}
              onReload={() => void reload()}
            />
          ) : (
            <ListedFooter
              save={save}
              dirty={dirty}
              visible={visibleListing}
              onSave={() => void saveNow()}
              onReload={() => void reload()}
              // True since K2's «Ще шукає» (P10): on the cards that carry the date.
              dateUnchanged={
                view !== null && isDiscoverable(view.listing) ? (
                  <p className={CAPTION}>{t.listed.dateUnchanged}</p>
                ) : null
              }
            />
          )}
          {published && shelterShown && view !== null ? (
            <a href={`/tvaryny/${view.id}`} className={`self-start ${buttonClass("text")}`}>
              {t.publish.viewPublic}
            </a>
          ) : null}
        </footer>
      ) : null}
      <p role="status" className={CAPTION}>
        {announcement}
      </p>
    </div>
  );
}

/** Which validated field an element belongs to, by the id the sections give it. */
const fieldOfTarget = (target: EventTarget): FieldProblem["field"] | null => {
  const id = (target as HTMLElement).id ?? "";
  const name = (target as HTMLInputElement).name ?? "";
  if (id === "animal-name") return "name";
  if (name === "animal-species") return "species";
  if (id === "animal-description") return "description";
  if (id === "animal-birth-date") return "birthDate";
  if (id === "animal-as-of") return "asOf";
  return null;
};

function SaveProblems({
  save,
  onSave,
  onReload,
}: {
  save: SaveState;
  onSave: () => void;
  onReload: () => void;
}) {
  const e = uk.kabinet.profileEdit;
  switch (save.kind) {
    case "conflict":
      return (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className={ERROR_TEXT}>{t.errors.conflict}</p>
          <Button variant="text" onClick={onReload}>
            {e.errors.conflictReload}
          </Button>
        </div>
      );
    case "registry_confirmed":
      return (
        <p role="alert" className={ERROR_TEXT}>
          {t.errors.registryConfirmed}
        </p>
      );
    case "failed":
      return (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className={ERROR_TEXT}>{t.draft.saveFailed}</p>
          <Button variant="text" onClick={onSave}>
            {e.state.retry}
          </Button>
        </div>
      );
    default:
      return null;
  }
}

function DraftFooter({
  save,
  created,
  creatable,
  dirty,
  gaps,
  publishing,
  onSave,
  onPublish,
  onReload,
}: {
  save: SaveState;
  created: boolean;
  creatable: boolean;
  dirty: boolean;
  gaps: readonly PublishGap[];
  publishing: boolean;
  onSave: () => void;
  onPublish: () => void;
  onReload: () => void;
}) {
  // «Чернетку збережено о …» names a moment that is only still true while
  // nothing has changed since (the same `save.kind === "saved" && !dirty`
  // rule `ListedFooter` already uses below) — a value typed since then, or
  // a save still pending or queued, keeps it hidden rather than naming a
  // time that no longer describes the draft's current content.
  const status =
    save.kind === "saving"
      ? uk.kabinet.profileEdit.state.saving
      : save.kind === "saved" && !dirty
        ? fillTemplate(t.draft.savedAt, { time: timeOf(save.at) })
        : !created && !creatable
          ? t.draft.notSavedYet
          : null;
  const unready = gaps.length > 0;
  return (
    <>
      <p className={CAPTION}>
        {status !== null ? `${status} · ` : null}
        {t.draft.notVisible}
      </p>
      <SaveProblems save={save} onSave={onSave} onReload={onReload} />
      <div className="flex flex-wrap items-center gap-2">
        {/*
          The phone shows «Зберегти», wider screens «Зберегти чернетку»; the
          accessible name is always the full one, which begins with the short
          label, so a voice command naming what is on screen still matches.
        */}
        <Button
          variant="secondary"
          aria-label={t.draft.save}
          aria-busy={save.kind === "saving" || undefined}
          onClick={onSave}
        >
          <span className="tablet:hidden">{t.draft.saveShort}</span>
          <span className="hidden tablet:inline">{t.draft.save}</span>
        </Button>
        <Button
          variant="primary"
          aria-disabled={unready || undefined}
          aria-describedby={unready ? "publish-missing" : undefined}
          aria-busy={publishing || undefined}
          onClick={onPublish}
        >
          {t.publish.button}
        </Button>
      </div>
      {unready ? (
        <p id="publish-missing" className={CAPTION}>
          {missingSentence(gaps)}
        </p>
      ) : null}
    </>
  );
}

function ListedFooter({
  save,
  dirty,
  visible,
  onSave,
  onReload,
  dateUnchanged,
}: {
  save: SaveState;
  dirty: boolean;
  visible: boolean;
  onSave: () => void;
  onReload: () => void;
  dateUnchanged: ReactNode;
}) {
  const e = uk.kabinet.profileEdit;
  return (
    <>
      <p className={CAPTION}>{visible ? t.listed.liveOnSave : t.listed.notShownNow}</p>
      {dateUnchanged}
      <SaveProblems save={save} onSave={onSave} onReload={onReload} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          aria-disabled={!dirty || undefined}
          aria-busy={save.kind === "saving" || undefined}
          onClick={() => {
            if (dirty) onSave();
          }}
        >
          {save.kind === "saving" ? e.state.saving : e.actions.save}
        </Button>
      </div>
      {save.kind === "saved" && !dirty ? (
        <p className={CAPTION}>{fillTemplate(e.state.savedAt, { time: timeOf(save.at) })}</p>
      ) : null}
    </>
  );
}
