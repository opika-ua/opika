import { VERIFICATION_STATUSES, type VerificationStatus } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { buttonClass, FOCUS_RING, TextField } from "../../controls/controls";
import { BODY, CAPTION, ERROR_TEXT } from "../profile-edit/styles";
import { NEW_SHELTER_PATH } from "../routes";
import {
  isFiltered,
  LIST_PARAMS,
  listHrefOf,
  SHELTERS_PATH,
  type ShelterListFilters,
} from "./list-params";
import type { ShelterListPage } from "./pages";
import { ShelterRows } from "./ShelterRows";

const t = uk.kabinet.operator.list;

/** What S1 shows below its heading: the rows, or why there are none. */
export type ShelterListContent =
  | { kind: "load_failed" }
  | { kind: "list"; page: ShelterListPage; cityNames: Readonly<Record<string, string>> };

/**
 * S1 · Притулки (R-UI 1): every shelter, those waiting on the operator first
 * (the repository's rank), a name search and a status filter carried in the
 * URL (RU-T4), and the rows.
 *
 * The search is a plain GET form, so it works before any script loads and
 * lands on a URL the browser can go back to; Enter submits it. The status
 * filter is a row of links with the counts the procedure returns, which
 * follow the search but not the filter (`statusCounts`).
 *
 * «Новий притулок» (`list.create`, R-UI 2) opens S2 from the heading.
 *
 * The states: the list; no match for a search or filter (`list.noMatch`); no
 * shelters at all (`list.empty`, which names that button, with a link to S2
 * of its own); the list failing to load, with a retry.
 */
export function ShelterListScreen({
  filters,
  content,
}: {
  filters: ShelterListFilters;
  content: ShelterListContent;
}) {
  const counts = content.kind === "list" ? content.page.counts : null;
  const total =
    counts === null ? null : VERIFICATION_STATUSES.reduce((sum, status) => sum + counts[status], 0);
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight text-rg-ink">{t.title}</h1>
          {total !== null ? (
            <p className={BODY}>{fillTemplate(t.total, { count: String(total) })}</p>
          ) : null}
          <p className={CAPTION}>{t.orderNote}</p>
        </div>
        <a href={NEW_SHELTER_PATH} className={buttonClass("primary")}>
          {t.create}
        </a>
      </div>

      <search>
        <form method="get" action={SHELTERS_PATH} className="flex flex-col gap-2">
          <TextField
            id="operator-shelter-search"
            name={LIST_PARAMS.search}
            type="search"
            enterKeyHint="search"
            label={t.search}
            defaultValue={filters.search ?? ""}
          />
          {filters.status !== null ? (
            <input type="hidden" name={LIST_PARAMS.status} value={filters.status} />
          ) : null}
        </form>
      </search>

      {counts !== null ? <StatusFilter filters={filters} counts={counts} /> : null}

      {content.kind === "load_failed" ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className={ERROR_TEXT}>{t.loadFailed}</p>
          <a href={listHrefOf(filters)} className={buttonClass("secondary")}>
            {uk.kabinet.profileEdit.state.retry}
          </a>
        </div>
      ) : content.page.items.length === 0 ? (
        isFiltered(filters) ? (
          <p className={BODY}>{t.noMatch}</p>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <p className={BODY}>{t.empty}</p>
            <a href={NEW_SHELTER_PATH} className={buttonClass("secondary")}>
              {t.create}
            </a>
          </div>
        )
      ) : (
        <ShelterRows
          // A new filter is a new list: never carry one list's pages into another.
          key={listHrefOf(filters)}
          first={{ items: content.page.items, nextCursor: content.page.nextCursor }}
          filters={filters}
          cityNames={content.cityNames}
        />
      )}
    </>
  );
}

/** «Усі · N» then one link per status, each keeping the search. */
function StatusFilter({
  filters,
  counts,
}: {
  filters: ShelterListFilters;
  counts: Record<VerificationStatus, number>;
}) {
  const all = VERIFICATION_STATUSES.reduce((sum, status) => sum + counts[status], 0);
  const options: { status: VerificationStatus | null; label: string }[] = [
    { status: null, label: fillTemplate(t.filterAll, { count: String(all) }) },
    ...VERIFICATION_STATUSES.map((status) => ({
      status,
      label: fillTemplate(t.filterStatus, {
        status: uk.kabinet.profileStatus[status],
        count: String(counts[status]),
      }),
    })),
  ];
  return (
    <ul className="flex flex-wrap gap-2">
      {options.map((option) => (
        <li key={option.status ?? "all"}>
          <a
            href={listHrefOf({ search: filters.search, status: option.status })}
            aria-current={option.status === filters.status ? "page" : undefined}
            className={`inline-flex min-h-target items-center rounded-rg-chip bg-rg-fill px-4 text-base text-rg-ink aria-[current=page]:bg-rg-ink aria-[current=page]:text-rg-surface ${FOCUS_RING}`}
          >
            {option.label}
          </a>
        </li>
      ))}
    </ul>
  );
}
