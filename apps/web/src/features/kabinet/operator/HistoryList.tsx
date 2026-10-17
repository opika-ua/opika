"use client";

import type { ShelterHistoryEntry, ShelterId } from "@opika/domain";
import { uk } from "@opika/i18n";
import { Button } from "../../controls/controls";
import { BODY, CAPTION, CARD, CARD_TITLE, ERROR_TEXT, STRONG } from "../profile-edit/styles";
import { formatDateTime } from "./format";
import { type HistoryPeople, historyLineOf, historyLineText } from "./history-lines";
import { HISTORY_PAGE } from "./list-params";
import { type RegistryReadClient, registryReadBrowserClient } from "./registry-browser-client";
import { type Page, reloadPage, useMore } from "./use-more";

const t = uk.kabinet.operator.history;

/**
 * S4's history, newest first: the server's first page, then «Показати ще»
 * from the browser by the page's cursor (keyset, bound to this shelter). Each
 * entry renders through `historyLineOf`, so every kind reads one impersonal
 * line with its actor after « · », and its moment beside it.
 */
export function HistoryList({
  shelterId,
  first,
  people,
  client = registryReadBrowserClient,
  restart = reloadPage,
}: {
  shelterId: ShelterId;
  first: Page<ShelterHistoryEntry>;
  people: HistoryPeople;
  client?: RegistryReadClient;
  restart?: () => void;
}) {
  const { items, hasMore, state, more } = useMore(
    first,
    (cursor) => client.registry.history.list({ shelterId, cursor, limit: HISTORY_PAGE }),
    restart,
  );
  return (
    <section aria-labelledby="operator-history" className={CARD}>
      <h2 id="operator-history" className={CARD_TITLE}>
        {t.title}
      </h2>
      <p className={CAPTION}>{t.note}</p>
      {items.length === 0 ? (
        <p className={BODY}>{t.empty}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((entry, index) => {
            const line = historyLineOf(entry, people);
            return (
              // History rows carry no id in this view; their order is the record's.
              <li key={`${line.at.toISOString()}-${index}`} className="flex flex-col gap-1">
                <p className={`${STRONG} break-words`}>{historyLineText(line)}</p>
                <time dateTime={line.at.toISOString()} className={CAPTION}>
                  {formatDateTime(line.at)}
                </time>
              </li>
            );
          })}
        </ol>
      )}
      {state.kind === "failed" ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className={ERROR_TEXT}>{uk.kabinet.operator.errors.failed}</p>
          <Button variant="secondary" onClick={more}>
            {uk.kabinet.profileEdit.state.retry}
          </Button>
        </div>
      ) : hasMore ? (
        <Button
          variant="secondary"
          className="self-start"
          aria-busy={state.kind === "loading"}
          onClick={more}
        >
          {t.more}
        </Button>
      ) : null}
    </section>
  );
}
