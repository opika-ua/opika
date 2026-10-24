import type { AnimalId } from "@opika/domain";
import { useCallback, useEffect, useState } from "react";
import { savedBrowserClient } from "../../api/browser-client";
import {
  likesStorageIsBlocked,
  readLikesStore,
  subscribeToLikesChanges,
  toggleSavedAnimal,
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
 * `items` resolves — never the empty state for a list that merely hasn't
 * loaded yet.
 */
export type SavedCardsLoadState =
  | { readonly kind: "unknown" }
  | { readonly kind: "loading"; readonly count: number }
  | { readonly kind: "empty" }
  | { readonly kind: "ready"; readonly items: readonly SavedCardResult[] };

export function savedCardsLoadStateOf(
  ids: readonly string[] | null,
  items: readonly SavedCardResult[] | null,
): SavedCardsLoadState {
  if (ids === null) return { kind: "unknown" };
  if (items !== null) return { kind: "ready", items };
  if (ids.length === 0) return { kind: "empty" };
  return { kind: "loading", count: ids.length };
}

export interface SavedCardsState {
  readonly load: SavedCardsLoadState;
  readonly storageBlocked: boolean;
  removeSaved(animalId: AnimalId): void;
}

/**
 * The saved page's own data: the ordered ids from `likes-store` (newest
 * first — the store's own order), refetched from `animals.cardsByIds`
 * whenever that list changes.
 *
 * `ids` starts `null` (not `[]`) specifically so this never reads as "zero
 * saved" before `localStorage` has actually been read — the earlier `[]`
 * default meant a visitor *with* saved animals briefly got the real empty
 * state rendered: the mount effect below set `ids` to the real (non-empty)
 * list, but the *other* effect, keyed on `ids.join(",")`, ran in the same
 * pass with its own stale closure over the render's `ids` — still `[]` at
 * that point — and set `items: []` from that stale read before ever
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
  const [items, setItems] = useState<readonly SavedCardResult[] | null>(null);
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
    if (ids.length === 0) {
      setItems([]);
      return;
    }
    let cancelled = false;
    savedBrowserClient.animals
      .cardsByIds({ animalIds: ids as AnimalId[] })
      .then((res) => {
        if (!cancelled) setItems(res.items);
      })
      .catch(() => {
        // Offline, or the per-IP limit — the page keeps its last known
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
    // `""` — a different value from `[]`'s `""`, which is exactly what's
    // wanted: the very first transition out of `null` always counts as a
    // dependency change and reruns this effect, whether the real list
    // turns out empty or not.
  }, [ids?.join(",")]);

  const removeSaved = useCallback(
    (animalId: AnimalId) => {
      toggleSavedAnimal(animalId, new Date());
      readIds();
    },
    [readIds],
  );

  return { load: savedCardsLoadStateOf(ids, items), storageBlocked, removeSaved };
}
