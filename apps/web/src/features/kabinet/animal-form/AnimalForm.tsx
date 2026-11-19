"use client";

import "../../../zod-client-config";
import type { KabinetAnimalView } from "@opika/contracts";
import {
  type CityId,
  isDiscoverable,
  kyivCalendarDateOf,
  type PublishGap,
  type ShelterGate,
} from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type KabinetAnimalClient,
  kabinetAnimalBrowserClient,
} from "../../../api/kabinet-browser-client";
import { Button, buttonClass, LinkButton } from "../../../ui/Button";
import type { ComboboxOption } from "../../../ui/Combobox";
import { ErrorSummary } from "../../../ui/ErrorSummary";
import { FormSection } from "../../../ui/FormSection";
import { InlineStatus } from "../../../ui/feedback";
import { Heading } from "../../../ui/Heading";
import { StickyActionBar } from "../../../ui/StickyActionBar";
import { Tabs } from "../../../ui/Tabs";
import { Text } from "../../../ui/Text";
import type { CompressedPhoto } from "../photos/compress-photo";
import { publicAnimalPath } from "../routes";
import { ListingStatusChip } from "../StatusChips";
import { useCityPicker } from "../shared/city-picker";
import { SavePill, SaveStatusLine } from "../shared/save-pill";
import { type SaveBarState, saveBarTextOf } from "../shared/save-state";
import { clearUnsavedNow, confirmLeave, useUnsavedChanges } from "../shared/unsaved-changes";
import { ANIMAL_TABS, type AnimalTab } from "./animal-tabs";
import { summaryItemsOf } from "./error-summary-items";
import { AboutFields, BasicsFields, HealthFields, problemText } from "./FormSections";
import {
  emptyValues,
  type FieldProblem,
  type FormValues,
  patchOf,
  problemsOf,
  valuesEqual,
  valuesOf,
} from "./form-values";
import { LocationFields } from "./LocationFields";
import {
  cardsArePublic,
  createdWhen,
  missingSentence,
  publishedAnnouncementOf,
  type ShelterVisibility,
  timeOf,
} from "./labels";
import { MissingPanel, TAB_LABEL } from "./MissingPanel";
import { PhotoSection } from "./PhotoSection";
import { GAP_TAB, GAP_TARGET, gapsOf, tabStatusOf } from "./publish-gaps";
import { TabLabel } from "./TabLabel";

/**
 * K3 · add / edit animal (KABINET K3; `docs/k3-copy-sheet.md`). One form in five tabs (`?tab=`):
 * «Основне», «Фото», «Про тварину», «Здоровʼя», «Публікація». Every panel stays mounted, so an
 * unsaved value survives a tab switch. The ✓ and ! on a tab come from `gapsOf` (the publish rules),
 * never a list of their own.
 *
 * **A draft saves itself** (KAB:179): 10 seconds after the last change and
 * when a field is left (decision taken T6, so a typing session writes a few
 * history lines, not one per 10 s). Its footer has no save button, only the
 * autosave status and «Опублікувати» (R4, owner 2026-11-19).
 * On `/nova` the first save that has a name and a species creates the draft
 * (K-Q5) and the address becomes the animal's own. **A listed animal saves
 * only when asked** (T8), through «Зберегти зміни» while it has unsaved edits:
 * its card is public, and an autosave would put a half-typed sentence on it.
 *
 * Every save sends only what changed (`patchOf`), compare-and-set on the
 * version it last read (S3-T6); a conflict stops the autosave until the
 * current version is shown. Photo writes never touch the version (P-Q3), so
 * they and the form never conflict.
 *
 * **Publishing** saves pending edits first, then publishes. While it can't
 * publish, the button stays focusable with `aria-disabled` and the reason
 * written next to it (KAB:93): the approval gate, else the gaps in form order (K-Q5).
 *
 * Writes are offered exactly when the API would accept them: `editing` is
 * the page's own `decideAccess` answer with the served policy. A support view
 * gets the same page read-only.
 */

const t = uk.kabinet.animalForm;
const AUTOSAVE_AFTER_MS = 10_000;
const SAVING: SaveBarState = { kind: "saving" };
const UNSAVED: SaveBarState = { kind: "unsaved" };

export type AnimalFormEditing = { kind: "open" } | { kind: "read_only" };

/** «Де зараз тварина»'s labels, read with the page: the shelter's city, and the stored own city's. */
export type AnimalFormLocation = {
  shelterCityName: string;
  ownCity: ComboboxOption<CityId> | null;
};

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "failed" }
  | { kind: "conflict" }
  | { kind: "registry_confirmed" }
  /** The first save of a new card, refused: an application holds its most drafts (D5). */
  | { kind: "draft_cap" };

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

/** Whether `values` differs from what's known saved: `view`'s own diff once it exists, or `/nova`'s own empty starting point before it does. */
const dirtyOf = (
  view: KabinetAnimalView | null,
  values: FormValues,
  initialValues: FormValues,
): boolean =>
  view === null ? !valuesEqual(values, initialValues) : patchOf(view, values) !== null;

export function AnimalForm({
  initialView,
  editing,
  viewer,
  shelterVisibility,
  publishGate = { kind: "open" },
  back,
  initialTab = "osnovne",
  location,
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
  /** Blocked while the shelter is an application (D2); the server's gate decides, this says why. */
  publishGate?: ShelterGate;
  back: { href: string; label: string };
  /** The tab `?tab=` named; «Публікація» is only there for a shelter that can write. */
  initialTab?: AnimalTab;
  /** Left out, no «Де зараз тварина» section (a caller that can't name the shelter's city). */
  location?: AnimalFormLocation;
  client?: KabinetAnimalClient;
  clock?: () => Date;
  compress?: (file: File) => Promise<CompressedPhoto>;
}) {
  const editable = editing.kind === "open" && viewer === "admin";

  const [view, setView] = useState<KabinetAnimalView | null>(initialView);
  const [tab, setTab] = useState<AnimalTab>(
    initialTab === "publikatsiia" && !editable ? "osnovne" : initialTab,
  );
  // Where focus goes once the tab it lives on is showing (a hidden panel cannot take focus).
  const pendingFocus = useRef<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  // The picker labels of cities this form has shown, so a re-read keeps an own city's name.
  const cityLabels = useRef(
    new Map<CityId, ComboboxOption<CityId>>(
      location?.ownCity ? [[location.ownCity.value, location.ownCity]] : [],
    ),
  );
  const ownCityOf = useCallback(
    (next: KabinetAnimalView): ComboboxOption<CityId> | null =>
      next.location.kind === "own_city"
        ? (cityLabels.current.get(next.location.cityId) ?? null)
        : null,
    [],
  );
  const cityPicker = useCityPicker(client.shelter.cities);
  const [values, setValues] = useState<FormValues>(() =>
    initialView === null
      ? emptyValues(kyivCalendarDateOf(clock()))
      : valuesOf(initialView, kyivCalendarDateOf(clock()), location?.ownCity ?? null),
  );
  const [touched, setTouched] = useState<ReadonlySet<FieldProblem["field"]>>(new Set());
  const [attempted, setAttempted] = useState(false);
  const [serverProblems, setServerProblems] = useState<FieldProblem[]>([]);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  // The pill's 4 s confirmation after a successful save; a new edit replaces it at once.
  const [savedShown, setSavedShown] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  // Bumped when a person's own save or publish is refused for what is in a field, so the error
  // summary takes focus. Never for an autosave, which must not pull focus from the typing.
  const [summaryFocus, setSummaryFocus] = useState(0);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef<HTMLParagraphElement | null>(null);
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
  // `leave()` reads this fresh, off the ref, for the same reason `viewRef`
  // and `valuesRef` exist: its own render's `publishing` would be stale by
  // the time the save it awaits resolves (UW-T8).
  const publishingRef = useRef(publishing);
  publishingRef.current = publishing;
  // A second, concurrent `leave()` call (a double-click) must join the
  // first's own save rather than starting another: a second `saveNow()`
  // would hold `pendingSaveCount` above zero even once the one real save
  // is done, and warn on a navigation that, by then, has saved everything
  // (UW-T9).
  const leaveSaveRef = useRef<Promise<SaveOutcome> | null>(null);

  const now = clock();
  const listingKind = view?.listing.kind ?? "new";
  const isDraft = listingKind === "new" || listingKind === "draft";
  const problems = [...problemsOf(values, listingKind, now), ...serverProblems];
  const shownProblems = attempted ? problems : problems.filter((p) => touched.has(p.field));
  const creatable = values.name.trim() !== "" && values.species !== null;
  const dirty = dirtyOf(view, values, initialValuesRef.current);
  const gaps = gapsOf(values, view?.photos.length ?? 0);

  // Oleksii, 2026-10-19 (UW-B2): warn while there's unsaved work - dirty,
  // or a save pending or queued - never otherwise, for a draft and a
  // listed card alike. Publishing counts too: the first review's own
  // recommendation, taken here as a builder decision, not his. Rationale
  // and what was decided: docs/decisions-inbox/feat-draft-save-unload-warning.md
  // (UW-T2, UW-T6).
  const hasUnsavedWork = dirty || savePending || publishing;
  useUnsavedChanges("animal-form", editable && hasUnsavedWork);

  const show = useCallback((next: AnimalTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "osnovne") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", url);
  }, []);

  /** Shows `next` and then focuses `selector` on it. */
  const goTo = useCallback(
    (next: AnimalTab, selector: string) => {
      pendingFocus.current = selector;
      show(next);
      setFocusTick((count) => count + 1);
    },
    [show],
  );

  // `tab` and `focusTick` say the panel is showing; the target is read off the ref.
  useEffect(() => {
    const selector = pendingFocus.current;
    if (selector === null) return;
    pendingFocus.current = null;
    const target = document.querySelector<HTMLElement>(selector);
    target?.scrollIntoView({ block: "center" });
    target?.focus({ preventScroll: true });
  }, [tab, focusTick]);

  const set = useCallback((change: Partial<FormValues>) => {
    const picked = change.location?.kind === "own_city" ? change.location.city : null;
    if (picked) cityLabels.current.set(picked.value, picked);
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
        window.history.replaceState(
          null,
          "",
          `/kabinet/tvaryny/${saved.id}${window.location.search}`,
        );
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
      if (wrote) {
        setSave({ kind: "saved", at: clock() });
        setSavedShown(true);
      }
      return { kind: wrote ? "saved" : "nothing", view: current };
    } catch (error) {
      let refusedForAField = false;
      switch (codeOf(error)) {
        case "CONFLICT":
          setSave({ kind: "conflict" });
          break;
        case "REGISTRY_CONFIRMED":
          setSave({ kind: "registry_confirmed" });
          break;
        case "DRAFT_LIMIT_REACHED":
          setSave({ kind: "draft_cap" });
          break;
        case "LISTING_FACT_REQUIRED":
          refusedForAField = true;
          setServerProblems([{ field: "description", key: "requiredOnceListed" }]);
          setAttempted(true);
          setSave({ kind: "idle" });
          break;
        case "AGE_DATE_OUT_OF_RANGE": {
          refusedForAField = true;
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
      return { kind: refusedForAField ? "invalid" : "refused", view: current };
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

  // A refused first save would be refused again on every tick: stop until the person acts.
  const autosaving =
    editable && isDraft && creatable && save.kind !== "conflict" && save.kind !== "draft_cap";

  // The error summary mounts in the same render that bumps the counter.
  useEffect(() => {
    if (summaryFocus > 0) summaryRef.current?.focus();
  }, [summaryFocus]);

  // The Publish button unmounts with the draft actions; focus goes to the status line that says it worked.
  useEffect(() => {
    if (published) statusRef.current?.focus();
  }, [published]);

  /** A person's own request to save: a refusal for a field sends focus to the summary. */
  const saveFromButton = useCallback(async () => {
    const outcome = await saveNow();
    if (outcome.kind === "invalid") setSummaryFocus((count) => count + 1);
  }, [saveNow]);

  // A draft: 10 s after the last change (T6). Each change restarts the wait:
  // `values` is a dependency for that alone (a new object on every change),
  // so typing a description saves once the typing stops, not every 10 s.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `values` restarts the timer; the save reads it through `valuesRef`.
  useEffect(() => {
    if (!autosaving || !dirty) return;
    const timer = window.setTimeout(() => void saveNow(), AUTOSAVE_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [autosaving, dirty, saveNow, values]);

  const reload = useCallback(async (): Promise<KabinetAnimalView | null> => {
    if (view === null) return null;
    try {
      const current = await client.shelter.animals.byId({ animalId: view.id });
      setView(current);
      setValues(valuesOf(current, kyivCalendarDateOf(clock()), ownCityOf(current)));
      setServerProblems([]);
      setSave({ kind: "idle" });
      return current;
    } catch {
      setAnnouncement(t.errors.loadFailed);
      return null;
    }
  }, [client, clock, view, ownCityOf]);

  /** A photo write changes the photos and their crops, the edit time and (RH-B7) the listing: only those are taken from it. */
  const onPhotoView = useCallback((photoView: KabinetAnimalView) => {
    setView((current) =>
      current === null
        ? photoView
        : ({
            ...current,
            photos: photoView.photos,
            photoCrops: photoView.photoCrops,
            listing: photoView.listing,
            lastUpdatedAt: photoView.lastUpdatedAt,
          } as KabinetAnimalView),
    );
  }, []);

  /** «Скасувати»: back to what is saved. */
  const cancelEdits = () => {
    if (view === null) return;
    setValues(valuesOf(view, kyivCalendarDateOf(clock()), ownCityOf(view)));
    setServerProblems([]);
    setAttempted(false);
    setTouched(new Set());
    setSave({ kind: "idle" });
  };

  const summaryItems = summaryItemsOf(problems, goTo);
  const viewHref =
    view !== null && (view.listing.kind === "published" || view.listing.kind === "reserved")
      ? publicAnimalPath(view.id)
      : undefined;
  // The save pill is for a saved card only: a draft saves itself and never shows one (S7).
  let pill: SaveBarState | null = null;
  if (editable && !isDraft) {
    if (save.kind === "saving") pill = { kind: "saving" };
    else if (save.kind === "conflict")
      pill = {
        kind: "blocked",
        message: t.errors.conflict,
        action: {
          label: uk.kabinet.profileEdit.errors.conflictReload,
          onPress: () => void reload(),
        },
      };
    else if (save.kind === "registry_confirmed")
      pill = { kind: "blocked", message: t.errors.registryConfirmed };
    else if (save.kind === "failed") pill = { kind: "failed" };
    else if (attempted && summaryItems.length > 0)
      pill = { kind: "invalid", count: summaryItems.length };
    else if (dirty) pill = { kind: "unsaved" };
    else if (save.kind === "saved" && savedShown)
      pill = { kind: "saved", at: save.at, ...(viewHref === undefined ? {} : { viewHref }) };
  }
  // A listed card's line under the tabs: the pill's message, or the quiet state.
  let statusMessage: string | null = null;
  if (editable && !isDraft) {
    if (pill !== null) statusMessage = saveBarTextOf(pill);
    else if (save.kind === "saved") {
      statusMessage = fillTemplate(uk.kabinet.profileEdit.state.savedAt, { time: timeOf(save.at) });
    } else statusMessage = uk.kabinet.profileEdit.saveBar.allSaved;
  }
  // A draft's autosave status, in its footer. A failed or refused save is `SaveProblems`'s to say;
  // the saved time hides while there are edits (Oleksii, 2026-10-19). A problem shown under a field
  // is counted here: an autosave can't write it, and no button would say so.
  const shownItems = summaryItemsOf(shownProblems, goTo);
  let draftStatus: DraftStatus | null = null;
  if (editable && isDraft) {
    if (save.kind === "saving") draftStatus = { message: saveBarTextOf(SAVING), state: SAVING };
    else if (save.kind !== "idle" && save.kind !== "saved") draftStatus = null;
    else if (view === null && !creatable) {
      draftStatus = { message: t.draft.notSavedYet, state: UNSAVED };
    } else if (shownItems.length > 0) {
      const state: SaveBarState = { kind: "invalid", count: shownItems.length };
      draftStatus = { message: saveBarTextOf(state), state };
    } else if (dirty) draftStatus = { message: saveBarTextOf(UNSAVED), state: UNSAVED };
    else if (save.kind === "saved") {
      draftStatus = {
        message: fillTemplate(t.draft.savedAt, { time: timeOf(save.at) }),
        state: null,
      };
    } else if (view !== null) {
      draftStatus = { message: uk.kabinet.profileEdit.saveBar.allSaved, state: null };
    }
  }

  const heading = view === null ? t.titleNew : view.name;
  const shelterShown = cardsArePublic(shelterVisibility);
  // Seen by people: a published or reserved card of a shelter whose cards
  // are on the public surfaces (verified or listed before verification, not paused). Both halves, because
  // the feed, the gallery and `animals.byId` each check both.
  const visibleListing = view !== null && isDiscoverable(view.listing) && shelterShown;
  // «Тепер картку бачать…» only where the card is shown, «…щойно притулок
  // пройде перевірку» only before a pass (never to a paused or suspended
  // shelter, which has passed): `publishedAnnouncementOf`.
  const publishedAnnouncement = publishedAnnouncementOf(shelterVisibility);

  const awaitingApproval = publishGate.kind === "blocked";
  // Why «Опублікувати» is disabled, written beside it: the gate first, as this form can't fix it.
  const publishReason = awaitingApproval
    ? uk.kabinet.application.publishBlocked
    : gaps.length > 0
      ? missingSentence(gaps)
      : null;
  const publish = async () => {
    if (!editable || publishing) return;
    if (awaitingApproval) {
      setAnnouncement(uk.kabinet.application.publishBlocked);
      return;
    }
    if (gaps.length > 0) {
      // The gaps are listed once, in «Публікація», next to the links that lead to each; no second sentence.
      goTo("publikatsiia", "#publication");
      return;
    }
    setPublishing(true);
    try {
      const saved = await saveNow();
      if (saved.kind === "invalid") setSummaryFocus((count) => count + 1);
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
        case "AWAITING_APPROVAL":
          setAnnouncement(uk.kabinet.application.publishBlocked);
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
      // A concurrent second call joins this one's own save (UW-T9) rather
      // than starting another.
      leaveSaveRef.current ??= saveNow();
      await leaveSaveRef.current;
      leaveSaveRef.current = null;
      // `location.assign` below fires `beforeunload` synchronously, before
      // React re-renders and runs the effect that would otherwise remove
      // the listener - so this intentional navigation is only ever waved
      // through once nothing is left unsaved (recomputed fresh from the
      // refs, not from the save's own outcome: more typing during the
      // await, another save still pending, or a publish still in flight,
      // must still warn) (UW-T4, UW-T8).
      const stillDirty = dirtyOf(viewRef.current, valuesRef.current, initialValuesRef.current);
      if (!stillDirty && pendingSaveCount.current === 0 && !publishingRef.current) {
        clearUnsavedNow("animal-form");
      }
      window.location.assign(back.href);
      return;
    }
    if (!isDraft && dirty && !confirmLeave()) event.preventDefault();
  };

  // A draft's empty required fields wear «потрібно для публікації»; a card already listed never does.
  const required = isDraft ? gaps.map((gap) => gap.kind) : [];

  const panels: Record<AnimalTab, React.ReactNode> = {
    osnovne: (
      <FormSection framing="flush" id="basics" title={t.sections.basics} titleless>
        <BasicsFields
          values={values}
          set={set}
          problems={shownProblems}
          disabled={!editable}
          required={required}
          stored={view}
          now={now}
        />
        {location === undefined ? null : (
          <LocationFields
            idPrefix="animal"
            shelterCityName={location.shelterCityName}
            value={values.location}
            onChange={(next) => set({ location: next })}
            search={cityPicker.search}
            messages={cityPicker.messages}
            error={problemText(shownProblems, "location")}
            disabled={!editable}
          />
        )}
      </FormSection>
    ),
    foto: (
      <FormSection framing="flush" id="photos" title={t.photos.title} titleless>
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
        ) : // Photos belong to a saved draft: say what makes one, in his words.
        creatable ? null : (
          <Text look="hint">{t.draft.notSavedYet}</Text>
        )}
      </FormSection>
    ),
    "pro-tvarynu": (
      <FormSection framing="flush" id="about" title={t.sections.about} titleless>
        <AboutFields
          values={values}
          set={set}
          problems={shownProblems}
          disabled={!editable}
          required={required}
        />
      </FormSection>
    ),
    zdorovia: (
      <FormSection framing="flush" id="health" title={t.sections.health} titleless>
        <HealthFields
          values={values}
          set={set}
          problems={shownProblems}
          disabled={!editable}
          vaccination={view?.vaccination ?? null}
        />
      </FormSection>
    ),
    publikatsiia: (
      <FormSection framing="flush" id="publication" title={t.sections.publication} titleless>
        {isDraft ? (
          <DraftPublication
            awaitingApproval={awaitingApproval}
            gaps={gaps}
            onGo={(gap) => goTo(GAP_TAB[gap.kind], GAP_TARGET[gap.kind])}
          />
        ) : (
          <ListedPublication
            visible={visibleListing}
            // True since K2's «Ще шукає» (P10): on the cards that carry the date.
            dateUnchanged={view !== null && isDiscoverable(view.listing)}
          />
        )}
        {published && shelterShown && view !== null ? (
          <LinkButton variant="secondary" href={`/tvaryny/${view.id}`} className="self-start">
            {t.publish.viewPublic}
          </LinkButton>
        ) : null}
      </FormSection>
    ),
  };

  return (
    <div className="flex w-full min-w-0 max-w-176 flex-col gap-4 desktop:gap-6">
      <header className="flex flex-col gap-3">
        {/* A plain link, not next/link: leaving runs the unsaved-work save first (`leave`). */}
        <a href={back.href} className={`self-start ${buttonClass("ghost")}`} onClick={leave}>
          {back.label}
        </a>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Heading level={1} look="display-l" id="animal-form-title" className="break-words">
            {heading}
          </Heading>
          {view !== null ? <ListingStatusChip kind={view.listing.kind} /> : null}
        </div>
        {view !== null && view.listing.kind === "draft" ? (
          <Text look="hint">
            {fillTemplate(t.header.createdNotPublished, { when: createdWhen(view.createdAt, now) })}
          </Text>
        ) : null}
      </header>

      {summaryFocus > 0 && shownProblems.length > 0 ? (
        <ErrorSummary items={shownItems} ref={summaryRef} />
      ) : null}

      <form
        className="flex flex-col gap-4 desktop:gap-6"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void saveFromButton();
        }}
        onBlur={(event) => {
          const field = fieldOfTarget(event.target);
          // Moving between a date's day, month and year is still typing that one date.
          const datePart = field === "birthDate" || field === "asOf";
          if (datePart && fieldOfTarget(event.relatedTarget) === field) return;
          if (field !== null) setTouched((current) => new Set([...current, field]));
          if (autosaving && dirty) void saveNow();
        }}
      >
        <Tabs
          look="underline"
          {...(editable && !isDraft
            ? { status: <SaveStatusLine message={statusMessage} state={pill} /> }
            : {})}
          label={t.sections.tabsLabel}
          selectedId={tab}
          onSelect={(id) => show(id as AnimalTab)}
          tabs={ANIMAL_TABS.filter((id) => id !== "publikatsiia" || editable).map((id) => ({
            id,
            label: <TabLabel label={TAB_LABEL[id]} status={tabStatusOf(id, gaps)} />,
            panel: panels[id],
          }))}
        />
      </form>

      {editable && isDraft ? (
        <StickyActionBar>
          <DraftActions
            save={save}
            status={draftStatus}
            publishReason={publishReason}
            publishing={publishing}
            onRetry={() => void saveFromButton()}
            onShow={() => shownItems[0]?.onSelect?.()}
            onPublish={() => void publish()}
            onReload={() => void reload()}
          />
          <p role="status" className="text-caption text-ink-2 empty:sr-only">
            {announcement}
          </p>
        </StickyActionBar>
      ) : (
        <p
          ref={statusRef}
          role="status"
          tabIndex={-1}
          className="text-caption text-ink-2 focus-ring empty:sr-only"
        >
          {announcement}
        </p>
      )}
      {editable && !isDraft ? (
        <SavePill
          state={pill}
          saveLabel={t.listed.saveChanges}
          onSave={() => void saveFromButton()}
          onRetry={() => void saveFromButton()}
          onCancel={cancelEdits}
          onShow={() => summaryItems[0]?.onSelect?.()}
          onSavedElapsed={() => setSavedShown(false)}
        />
      ) : null}
    </div>
  );
}

/** Which validated field an element belongs to, by the id the sections give it. */
const fieldOfTarget = (target: EventTarget | null): FieldProblem["field"] | null => {
  if (target === null) return null;
  const id = (target as HTMLElement).id ?? "";
  const name = (target as HTMLInputElement).name ?? "";
  // A date's parts: the day carries the field's id, the month and year add a suffix.
  const datePart = id.replace(/-(?:month|year)$/, "");
  if (id === "animal-name") return "name";
  if (name === "animal-species") return "species";
  if (id === "animal-description") return "description";
  if (id === "animal-medical-notes") return "medicalNotes";
  if (datePart === "animal-birth-date") return "birthDate";
  if (datePart === "animal-as-of") return "asOf";
  if (id === "animal-temperament-custom") return "temperamentCustom";
  if (id === "animal-colour-custom") return "colourCustom";
  if (id === "animal-location-city") return "location";
  return null;
};

/**
 * «Публікація» on a draft: who sees it (nobody yet) and what is still missing, the way the
 * disabled «Опублікувати» is described. Each gap is a link that switches to its tab and focuses
 * the field, so the list is a route, not just a sentence.
 */
function DraftPublication({
  awaitingApproval,
  gaps,
  onGo,
}: {
  awaitingApproval: boolean;
  gaps: readonly PublishGap[];
  onGo: (gap: PublishGap) => void;
}) {
  return (
    <>
      <Text look="hint">{t.draft.notVisible}</Text>
      {awaitingApproval ? <Text look="label">{uk.kabinet.application.publishBlocked}</Text> : null}
      <MissingPanel gaps={gaps} onGo={onGo} />
    </>
  );
}

/** «Публікація» on a listed card: whether people see it, and what an edit does to its date. */
function ListedPublication({
  visible,
  dateUnchanged,
}: {
  visible: boolean;
  dateUnchanged: boolean;
}) {
  return (
    <>
      <Text look="label">{visible ? t.listed.liveOnSave : t.listed.notShownNow}</Text>
      {dateUnchanged ? <Text look="hint">{t.listed.dateUnchanged}</Text> : null}
    </>
  );
}

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
        <InlineStatus tone="error" className="flex flex-col items-start gap-2">
          <span>{t.errors.conflict}</span>
          <Button variant="secondary" onClick={onReload}>
            {e.errors.conflictReload}
          </Button>
        </InlineStatus>
      );
    case "registry_confirmed":
      return <InlineStatus tone="error">{t.errors.registryConfirmed}</InlineStatus>;
    case "draft_cap":
      return <InlineStatus tone="error">{uk.kabinet.application.draftCap}</InlineStatus>;
    case "failed":
      return (
        <InlineStatus tone="error" className="flex flex-col items-start gap-2">
          <span>{t.draft.saveFailed}</span>
          <Button variant="secondary" onClick={onSave}>
            {e.state.retry}
          </Button>
        </InlineStatus>
      );
    default:
      return null;
  }
}

/** A draft's autosave status: the line's text and the state its dot shows. */
type DraftStatus = { message: string; state: SaveBarState | null };

/**
 * The draft's bar (R4): the autosave status and one filled «Опублікувати», no save button (a draft
 * saves itself). While it can't publish the button stays focusable with `aria-disabled`, described
 * by the reason under the status (KAB:93). A save refused for a field adds «Показати».
 */
function DraftActions({
  save,
  status,
  publishReason,
  publishing,
  onRetry,
  onShow,
  onPublish,
  onReload,
}: {
  save: SaveState;
  status: DraftStatus | null;
  publishReason: string | null;
  publishing: boolean;
  onRetry: () => void;
  onShow: () => void;
  onPublish: () => void;
  onReload: () => void;
}) {
  return (
    <>
      <SaveProblems save={save} onSave={onRetry} onReload={onReload} />
      <div className="flex flex-col gap-2 tablet:flex-row tablet:items-center tablet:justify-between tablet:gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <SaveStatusLine message={status?.message ?? null} state={status?.state ?? null} />
          {publishReason === null ? null : (
            <p id="publish-reason" className="text-caption text-ink-2">
              {publishReason}
            </p>
          )}
        </div>
        <div className="flex gap-2 tablet:shrink-0">
          {status?.state?.kind === "invalid" ? (
            <Button variant="secondary" className="flex-1 tablet:flex-none" onClick={onShow}>
              {uk.kabinet.profileEdit.saveBar.show}
            </Button>
          ) : null}
          <Button
            variant="primary"
            className="flex-1 tablet:flex-none"
            aria-disabled={publishReason !== null || undefined}
            aria-describedby={publishReason === null ? undefined : "publish-reason"}
            aria-busy={publishing || undefined}
            onClick={onPublish}
          >
            {t.publish.button}
          </Button>
        </div>
      </div>
    </>
  );
}
