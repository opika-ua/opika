import type { CityLabelView } from "@opika/contracts";
import type { AnimalId, CityId } from "@opika/domain";
import { placeName } from "@opika/i18n/public";
import { useCallback, useEffect, useState } from "react";
import { savedBrowserClient } from "../../api/browser-client";
import {
  likesStorageIsBlocked,
  type RemovedSave,
  readLikesStore,
  removeSavedAnimal,
  restoreSavedAnimal,
  subscribeToLikesChanges,
} from "./likes-store";

export type SavedCardResult = Awaited<
  ReturnType<typeof savedBrowserClient.animals.cardsByIds>
>["items"][number];

/**
 * Designer feedback batch C (2026-10-23): a pure, directly testable
 * description of what the saved page should show, derived from the two
 * pieces of async state below. `ids === null` is the brief moment before
 * `localStorage` has been read at all (client-only, so never true once an
 * effect has run); once ids are known, `loading` carries the count so the
 * page can show that many skeletons, sized like real cards, before
 * `items` resolves - never the empty state for a list that merely hasn't
 * loaded yet.
 */
export type SavedCardsLoadState =
  | { readonly kind: "unknown" }
  | { readonly kind: "loading"; readonly count: number }
  | { readonly kind: "empty" }
  | { readonly kind: "ready"; readonly items: readonly SavedCardResult[] };

export function savedCardsLoadStateOf(
  ids: readonly string[] | null,
  resolved: ReadonlyMap<string, SavedCardResult | null>,
): SavedCardsLoadState {
  if (ids === null) return { kind: "unknown" };
  if (ids.length === 0) return { kind: "empty" };
  if (!ids.every((id) => resolved.has(id))) return { kind: "loading", count: ids.length };
  const items = ids.flatMap((id) => resolved.get(id) ?? []);
  return { kind: "ready", items };
}

export interface SavedCardsState {
  readonly load: SavedCardsLoadState;
  /** A name for each city the available cards are in (`cardsByIds` carries one label per city). */
  readonly cityNames: Readonly<Record<CityId, string>>;
  readonly storageBlocked: boolean;
  /** Takes the save out at once (the list and the header count follow); the record feeds `restoreSaved`. */
  removeSaved(animalId: AnimalId): RemovedSave | null;
  /** Puts a removed save back at its old place; the card is still cached, so no fetch. */
  restoreSaved(removed: RemovedSave): void;
}

/**
 * The saved page's own data: the ordered ids from `likes-store` (newest
 * first - the store's own order), refetched from `animals.cardsByIds`
 * whenever that list changes.
 *
 * `ids` starts `null` (not `[]`) specifically so this never reads as "zero
 * saved" before `localStorage` has actually been read — the earlier `[]`
 * default meant a visitor *with* saved animals briefly got the real empty
 * state rendered: the mount effect below set `ids` to the real (non-empty)
 * list, but the *other* effect, keyed on `ids.join(",")`, ran in the same
 * pass with its own stale closure over the render's `ids` - still `[]` at
 * that point - and set `items: []` from that stale read before ever
 * re-running against the real ids. `null` removes the stale state there
 * was ever a read of: the fetch effect below now simply does nothing while
 * `ids` is `null`, and runs once, correctly, when `ids` actually changes.
 *
 * `storage` fires only for *other* tabs (the Web Storage spec's own rule),
 * so a save undone on the saved page itself (`removeSaved`) updates the
 * id list directly rather than waiting for an event that will never come
 * from this document.
 */
export function useSavedCards(): SavedCardsState {
  const [ids, setIds] = useState<readonly string[] | null>(null);
  // Every card the page has fetched, by id (`null`: asked for, no answer). Kept after a removal so
  // an undo puts the card back without another request.
  const [resolved, setResolved] = useState<ReadonlyMap<string, SavedCardResult | null>>(new Map());
  const [cityLabels, setCityLabels] = useState<readonly CityLabelView[]>([]);
  const [storageBlocked, setStorageBlocked] = useState(false);

  const readIds = useCallback(() => {
    const store = readLikesStore();
    setIds(store.items.map((item) => item.animalId));
    setStorageBlocked(likesStorageIsBlocked());
  }, []);

  useEffect(() => {
    readIds();
    return subscribeToLikesChanges(readIds);
  }, [readIds]);

  useEffect(() => {
    if (ids === null) return;
    // A removal or an undo only reorders ids already fetched: nothing to ask for.
    if (ids.every((id) => resolved.has(id))) return;
    let cancelled = false;
    savedBrowserClient.animals
      .cardsByIds({ animalIds: ids as AnimalId[] })
      .then((res) => {
        if (cancelled) return;
        setResolved((current) => {
          const next = new Map(current);
          for (const id of ids) next.set(id, null);
          for (const item of res.items) next.set(item.animalId, item);
          return next;
        });
        setCityLabels(res.cityLabels);
      })
      .catch(() => {
        // Offline, or the per-IP limit - the page keeps its last known
        // state rather than clearing it; a retry happens the next time
        // `ids` changes (another save/remove) or the page reloads.
      });
    return () => {
      cancelled = true;
    };
    // Depends on `ids?.join(",")`, not `ids` itself: `ids` is a fresh array
    // every render (from `store.items.map` above), so depending on the
    // array identity would refetch every render; joining compares content.
    // Review of 6825ffd, finding 6: `null?.join(",")` is `undefined`, not
    // `""` - a different value from `[]`'s `""`, which is exactly what's
    // wanted: the very first transition out of `null` always counts as a
    // dependency change and reruns this effect, whether the real list
    // turns out empty or not.
  }, [ids?.join(",")]);

  const removeSaved = useCallback(
    (animalId: AnimalId) => {
      const removed = removeSavedAnimal(animalId);
      readIds();
      return removed;
    },
    [readIds],
  );

  const restoreSaved = useCallback(
    (removed: RemovedSave) => {
      restoreSavedAnimal(removed);
      readIds();
    },
    [readIds],
  );

  const cityNames = Object.fromEntries(cityLabels.map((city) => [city.id, placeName(city)]));
  return {
    load: savedCardsLoadStateOf(ids, resolved),
    cityNames,
    storageBlocked,
    removeSaved,
    restoreSaved,
  };
}
