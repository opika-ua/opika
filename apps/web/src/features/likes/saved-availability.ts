import { MAX_LIKES, readLikesStore, subscribeToLikesChanges } from "./likes-store";

/**
 * What the server said about a saved id. `gone`: no name to show (reset, deleted, never public),
 * so it will not come back and may be pruned. `unavailable`: a known animal that is not shown now
 * (adopted, withdrawn, its shelter paused) - it may return from a pause, so the id stays stored.
 */
export type SavedAvailability = "available" | "unavailable" | "gone";

type ServerItem =
  | { kind: "available"; animalId: string }
  | { kind: "unavailable"; animalId: string; name: string | null };

export function classifySavedItems(
  ids: readonly string[],
  items: readonly ServerItem[],
): Map<string, SavedAvailability> {
  const byId = new Map(items.map((item) => [item.animalId, item]));
  return new Map(
    ids.map((id) => {
      const item = byId.get(id);
      const state: SavedAvailability =
        item?.kind === "available"
          ? "available"
          : item?.kind === "unavailable" && item.name !== null
            ? "unavailable"
            : "gone";
      return [id, state];
    }),
  );
}

/** An id not asked about yet counts: a fresh save is servable, and the badge must not flicker down. */
export function servableCount(
  ids: readonly string[],
  known: ReadonlyMap<string, SavedAvailability>,
): number {
  return ids.filter((id) => {
    const state = known.get(id);
    return state === undefined || state === "available";
  }).length;
}

const CACHE_KEY = "saved-availability.v1";
/** Short, so an adoption shows within minutes, long enough that page loads do not each ask. */
const CACHE_TTL_MS = 5 * 60 * 1000;

const known = new Map<string, SavedAvailability>();
let loadedAt = 0;
let inFlight: Promise<void> | null = null;

const restoreCache = (now: number): void => {
  if (known.size > 0 || loadedAt > 0) return;
  try {
    const raw: unknown = JSON.parse(window.sessionStorage.getItem(CACHE_KEY) ?? "null");
    if (typeof raw !== "object" || raw === null) return;
    const { at, states } = raw as { at?: unknown; states?: unknown };
    if (typeof at !== "number" || now - at > CACHE_TTL_MS || typeof states !== "object") return;
    loadedAt = at;
    for (const [id, state] of Object.entries(states as Record<string, unknown>)) {
      if (state === "available" || state === "unavailable" || state === "gone")
        known.set(id, state);
    }
  } catch {
    // Blocked storage or bad JSON: ask again.
  }
};

const persistCache = (): void => {
  try {
    window.sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ at: loadedAt, states: Object.fromEntries(known) }),
    );
  } catch {
    // Not worth a failure: the next page asks again.
  }
};

/** Test seam: forgets what was learned so one test cannot leak into the next. */
export const resetSavedAvailabilityForTests = (): void => {
  known.clear();
  loadedAt = 0;
  inFlight = null;
  try {
    window.sessionStorage.removeItem(CACHE_KEY);
  } catch {}
};

type CardsByIds = (input: { animalIds: string[] }) => Promise<{ items: readonly ServerItem[] }>;

/**
 * Asks the server about the ids not known yet (or all of them once the answer is stale) and
 * prunes the ones that are `gone`. A failed request changes nothing: the count falls back to
 * the stored ids rather than hiding saves because of a bad connection. `cardsByIds` is a
 * parameter so the logic is testable without the network client.
 */
export async function refreshSavedAvailability(
  cardsByIds: CardsByIds,
  now: number,
  prune: (animalIds: readonly string[]) => void,
): Promise<void> {
  restoreCache(now);
  if (now - loadedAt > CACHE_TTL_MS) known.clear();
  const ids = readLikesStore()
    .items.map((item) => item.animalId)
    .filter((id) => !known.has(id))
    .slice(0, MAX_LIKES);
  if (ids.length === 0) return;
  try {
    const { items } = await cardsByIds({ animalIds: ids });
    for (const [id, state] of classifySavedItems(ids, items)) known.set(id, state);
    loadedAt = now;
    persistCache();
    const gone = ids.filter((id) => known.get(id) === "gone");
    if (gone.length > 0) prune(gone);
  } catch {
    // Offline or rate limited: keep counting the stored ids.
  }
}

/**
 * The header's saved count, minus what the server no longer serves. Reads the store for the
 * first number, then corrects it once the answer is in. `onCount(null)` is never emitted: the
 * stored count is always a safe first answer.
 */
export function watchServableSavedCount(
  onCount: (count: number) => void,
  loadCardsByIds: () => Promise<CardsByIds>,
  prune: (animalIds: readonly string[]) => void,
): () => void {
  let cancelled = false;
  const publish = () => {
    if (cancelled) return;
    onCount(
      servableCount(
        readLikesStore().items.map((item) => item.animalId),
        known,
      ),
    );
  };
  const read = () => {
    const now = Date.now();
    restoreCache(now);
    publish();
    const stale = now - loadedAt > CACHE_TTL_MS;
    const ids = readLikesStore().items.map((item) => item.animalId);
    // Nothing to ask (no saves, or all answered recently): never load the client for it.
    if (!stale && ids.every((id) => known.has(id))) return;
    if (inFlight === null) {
      inFlight = loadCardsByIds()
        .then((cardsByIds) => refreshSavedAvailability(cardsByIds, Date.now(), prune))
        .catch(() => {})
        .finally(() => {
          inFlight = null;
        });
    }
    void inFlight.then(publish);
  };
  read();
  const unsubscribe = subscribeToLikesChanges(read);
  return () => {
    cancelled = true;
    unsubscribe();
  };
}
