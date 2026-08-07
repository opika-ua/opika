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
  let json: unknown;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return NO_FILTERS;
    json = JSON.parse(raw);
  } catch {
    // Both the storage access and the parse are inside the try. A browser
    // with site data blocked throws on the access itself, not just on the
    // write, and neither failure is worth more than "this session doesn't
    // remember" — the stored value is a filter preference, not state the
    // page needs to render.
    return NO_FILTERS;
  }

  const parsed = FeedFiltersSchema.safeParse(json);
  return parsed.success ? parsed.data : NO_FILTERS;
}

export function writeStoredFilters(storage: Storage, filters: FeedFilters): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Same reasoning as the read, plus quota: Safari's private mode has
    // historically exposed a working `sessionStorage` object whose
    // `setItem` throws. Failing to remember a filter must not take the
    // click that set it down with it.
  }
}
