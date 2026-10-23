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

export interface SavedCardsState {
  /** `null` while the first fetch is still in flight. */
  readonly items: readonly SavedCardResult[] | null;
  readonly storageBlocked: boolean;
  removeSaved(animalId: AnimalId): void;
}

/**
 * The saved page's own data: the ordered ids from `likes-store` (newest
 * first — the store's own order), refetched from `animals.cardsByIds`
 * whenever that list changes. Server state and client state stay two
 * separate pieces here rather than merged into one: `items` is `null`
 * until the first real answer, so the page can tell "no saves yet" from
 * "not resolved yet" instead of rendering the empty state for a moment
 * before data arrives.
 *
 * `storage` fires only for *other* tabs (the Web Storage spec's own rule),
 * so a save undone on the saved page itself (`removeSaved`) updates the
 * id list directly rather than waiting for an event that will never come
 * from this document.
 */
export function useSavedCards(): SavedCardsState {
  const [ids, setIds] = useState<readonly string[]>([]);
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
    // Depends on `ids.join(",")`, not `ids` itself: `ids` is a fresh array
    // every render (from `store.items.map` above), so depending on the
    // array identity would refetch every render; joining compares content.
  }, [ids.join(",")]);

  const removeSaved = useCallback(
    (animalId: AnimalId) => {
      toggleSavedAnimal(animalId, new Date());
      readIds();
    },
    [readIds],
  );

  return { items, storageBlocked, removeSaved };
}
