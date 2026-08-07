import { type FeedFilters, FeedFiltersSchema, NO_FILTERS } from "@opika/domain";

const STORAGE_KEY = "opika:filters";

/**
 * `sessionStorage`, not `localStorage` — the one storage decision
 * docs/design/README.md makes explicitly is the gallery/deck view-mode
 * memory ("Gallery ↔ Deck": "the last mode lives in sessionStorage, not
 * permanently — a link shared into Telegram always opens the gallery").
 * Filter state gets the same treatment for the same reason: a link with a
 * city baked into it should open exactly what it says, not a stale
 * preference from a previous visit.
 */
export function readStoredFilters(storage: Storage): FeedFilters {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return NO_FILTERS;

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NO_FILTERS;
  }

  const parsed = FeedFiltersSchema.safeParse(json);
  return parsed.success ? parsed.data : NO_FILTERS;
}

export function writeStoredFilters(storage: Storage, filters: FeedFilters): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(filters));
}
