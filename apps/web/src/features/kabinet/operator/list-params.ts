import { VERIFICATION_STATUSES, type VerificationStatus } from "@opika/domain";
import { OPERATOR_HOME } from "../routes";

/**
 * Page sizes, the same for the server's first page and the browser's next
 * ones: the list at the contract's ceiling (50), history in pages of 20.
 */
export const SHELTERS_PAGE = 50;
export const HISTORY_PAGE = 20;

/** One shelter's page (S4). */
export const shelterPath = (shelterId: string): string => `${OPERATOR_HOME}/${shelterId}`;

/**
 * S1's search and status filter live in the URL (RU-T4), so a filtered list
 * can be reloaded, bookmarked or sent back to with the browser's own button.
 * Transliterated like the gallery's own parameters (`?misto=`, `?stor=`).
 */
export const LIST_PARAMS = { search: "poshuk", status: "status" } as const;

/** `registry.shelters.list`'s own bound on `search` (the contract refuses a longer one). */
const SEARCH_MAX = 200;

export type ShelterListFilters = {
  /** Matched against the display name only (RG-T3); null when there is none. */
  search: string | null;
  status: VerificationStatus | null;
};

type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

/** A repeated parameter reads as its first value: a hand-edited URL still lists something. */
const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const isStatus = (value: string): value is VerificationStatus =>
  (VERIFICATION_STATUSES as readonly string[]).includes(value);

/**
 * The filters a URL asks for, in the shape the procedure accepts. Never a
 * reason to refuse the page: blank or unknown values mean "no filter", and a
 * search longer than the contract allows is cut to it, so a link a person
 * typed or trimmed still opens the list rather than an error.
 */
export function listFiltersOf(params: SearchParams): ShelterListFilters {
  const search = first(params[LIST_PARAMS.search])?.trim().slice(0, SEARCH_MAX).trim() ?? "";
  const status = first(params[LIST_PARAMS.status]) ?? "";
  return { search: search === "" ? null : search, status: isStatus(status) ? status : null };
}

/** The list URL for `filters`, with only the parameters that filter something. */
export function listHrefOf(filters: ShelterListFilters): string {
  const query = new URLSearchParams();
  if (filters.search !== null) query.set(LIST_PARAMS.search, filters.search);
  if (filters.status !== null) query.set(LIST_PARAMS.status, filters.status);
  const encoded = query.toString();
  return encoded === "" ? OPERATOR_HOME : `${OPERATOR_HOME}?${encoded}`;
}

export const isFiltered = (filters: ShelterListFilters): boolean =>
  filters.search !== null || filters.status !== null;
