import { type FeedFilters, NO_FILTERS, parseFeedFilters } from "@opika/domain/core";

const STORAGE_KEY = "opika:filters";

/**
 * `sessionStorage`, not `localStorage` - a link shared into Telegram
 * always opens what it says. Filter state is per-tab for that reason: a link with a
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

  return parseFeedFilters(json) ?? NO_FILTERS;
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
