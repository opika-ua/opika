import { z } from "zod";

/**
 * "Save for later," never "like" (DR1-Q3, Oleksii, verbatim: "save. Button: «Зберегти»; saved
 * state: «Збережено». Page title: «Збережені тварини»; slug /zberezheni. Bookmark icon, no
 * heart."). The storage key and every internal field stay `likes*` (DR1-D14): renaming them
 * is churn with no one reading them, since nothing user-facing says "like."
 */
const STORAGE_KEY = "likes.v1";

/** DR1-D14: refuse past the cap rather than silently drop the oldest save. */
export const MAX_LIKES = 200;

const LikesStoreV1Schema = z.object({
  version: z.literal(1),
  items: z.array(
    z.object({
      animalId: z.string(),
      /** ISO 8601, `Date#toISOString()`. The person's own order (newest first), not a ranking. */
      likedAt: z.string(),
    }),
  ),
});

export type LikesStoreV1 = z.infer<typeof LikesStoreV1Schema>;

const EMPTY_STORE: LikesStoreV1 = { version: 1, items: [] };

/**
 * Anything that fails to parse is treated as empty, never a crash and never a partial list —
 * the next write overwrites it. Covers a future `version` this build doesn't know (kept simple:
 * only `1` exists today, so an unknown version parses as empty rather than attempting migration
 * that has nothing yet to migrate from).
 */
const parseStore = (raw: string | null): LikesStoreV1 => {
  if (raw === null) return EMPTY_STORE;
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = LikesStoreV1Schema.safeParse(parsed);
    return result.success ? result.data : EMPTY_STORE;
  } catch {
    return EMPTY_STORE;
  }
};

/**
 * `localStorage` throws in private mode in some browsers, and when the user has blocked site
 * storage. The control still toggles for the page's lifetime (the plan's own words) rather than
 * silently doing nothing, so this in-memory store is the fallback every read and write falls
 * back to — scoped to this module's lifetime (a reload loses it, same as `localStorage` would
 * have refused to keep it anyway).
 */
let memoryFallback: LikesStoreV1 | undefined;
let storageIsBlocked = false;

const readRaw = (): LikesStoreV1 => {
  if (memoryFallback !== undefined) return memoryFallback;
  try {
    return parseStore(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    storageIsBlocked = true;
    memoryFallback = EMPTY_STORE;
    return memoryFallback;
  }
};

/**
 * `SAME_TAB_CHANGE_EVENT` exists because `storage` (below) never fires for
 * the document that made the write — by spec, it's cross-tab only. A writer
 * that already knows its own new value (`SaveButton`'s `toggle()`,
 * `useSavedCards`' `removeSaved`) doesn't need this: both set their own
 * state directly, right after their own write. A component that's merely
 * watching from elsewhere in the tree and isn't the one writing — the
 * header's `SavedNavLink`, which has no other way to learn "something was
 * just saved on this same page" — does.
 */
const SAME_TAB_CHANGE_EVENT = "likes-store-changed";

const writeRaw = (store: LikesStoreV1): void => {
  if (memoryFallback !== undefined) {
    memoryFallback = store;
  } else {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      storageIsBlocked = true;
      memoryFallback = store;
    }
  }
  window.dispatchEvent(new Event(SAME_TAB_CHANGE_EVENT));
};

/** Whether this page's save control is running on the in-memory fallback, for the saved page's own notice. */
export const likesStorageIsBlocked = (): boolean => storageIsBlocked;

export const readLikesStore = (): LikesStoreV1 => readRaw();

export const isAnimalSaved = (animalId: string): boolean =>
  readRaw().items.some((item) => item.animalId === animalId);

export type ToggleSavedResult =
  | { readonly kind: "saved" }
  | { readonly kind: "removed" }
  | { readonly kind: "cap_reached" };

/**
 * The one write path. Adding past `MAX_LIKES` refuses with `cap_reached` rather than dropping
 * the oldest save — DR1-D14's own reasoning: a silent drop would lose a choice the person made
 * on purpose, with nothing on screen explaining why their list got shorter.
 */
export const toggleSavedAnimal = (animalId: string, now: Date): ToggleSavedResult => {
  const store = readRaw();
  const already = store.items.some((item) => item.animalId === animalId);
  if (already) {
    writeRaw({ ...store, items: store.items.filter((item) => item.animalId !== animalId) });
    return { kind: "removed" };
  }
  if (store.items.length >= MAX_LIKES) return { kind: "cap_reached" };
  writeRaw({
    ...store,
    items: [{ animalId, likedAt: now.toISOString() }, ...store.items],
  });
  return { kind: "saved" };
};

/**
 * Two listeners, not one: `storage` fires on every *other* document using
 * this origin (never the one that wrote — the plan's own note), filtered to
 * this store's key so an unrelated `localStorage` write elsewhere on the
 * site doesn't trigger a re-read; `SAME_TAB_CHANGE_EVENT` fires in *this*
 * document, for every write regardless of who made it. A caller that's one
 * of the writers (`SaveButton`, `useSavedCards`'s `removeSaved`) already
 * updates its own state directly and just gets a redundant, idempotent
 * re-read from its own write — harmless. A caller that only watches
 * (`SavedNavLink`) needs the second listener to ever learn about a save
 * made elsewhere on the same page at all.
 */
export const subscribeToLikesChanges = (onChange: () => void): (() => void) => {
  const storageListener = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) onChange();
  };
  window.addEventListener("storage", storageListener);
  window.addEventListener(SAME_TAB_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", storageListener);
    window.removeEventListener(SAME_TAB_CHANGE_EVENT, onChange);
  };
};
