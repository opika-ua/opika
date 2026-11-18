"use client";

import "../../../zod-client-config";
import type { ShelterHistoryEntry, ShelterId } from "@opika/domain";
import { uk } from "@opika/i18n";
import { useState } from "react";
import { Button } from "../../../ui/Button";
import { Heading } from "../../../ui/Heading";
import { Panel } from "../../../ui/Panel";
import { Text } from "../../../ui/Text";
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
  first: Page<ShelterHistoryEntry> & { cities: Readonly<Record<string, string>> };
  people: HistoryPeople;
  client?: RegistryReadClient;
  restart?: () => void;
}) {
  // Each page names the cities its own lines need; a later page adds to what the first knew.
  const [cities, setCities] = useState(first.cities);
  const { items, hasMore, state, more } = useMore(
    first,
    async (cursor) => {
      const page = await client.registry.history.list({ shelterId, cursor, limit: HISTORY_PAGE });
      setCities((known) => ({ ...known, ...page.cities }));
      return page;
    },
    restart,
  );
  return (
    <Panel
      as="section"
      aria-labelledby="operator-history"
      padding="lg"
      className="flex min-w-0 flex-col gap-4"
    >
      <Heading level={2} look="body-l" id="operator-history">
        {t.title}
      </Heading>
      <Text look="hint">{t.note}</Text>
      {items.length === 0 ? (
        <Text>{t.empty}</Text>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((entry, index) => {
            const line = historyLineOf(entry, { ...people, cities });
            return (
              // History rows carry no id in this view; their order is the record's.
              <li key={`${line.at.toISOString()}-${index}`} className="flex flex-col gap-1">
                <Text look="label" className="break-words">
                  {historyLineText(line)}
                </Text>
                <time dateTime={line.at.toISOString()} className="text-caption text-ink-2">
                  {formatDateTime(line.at)}
                </time>
              </li>
            );
          })}
        </ol>
      )}
      {state.kind === "failed" ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <Text look="label">{uk.kabinet.operator.errors.failed}</Text>
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
    </Panel>
  );
}
