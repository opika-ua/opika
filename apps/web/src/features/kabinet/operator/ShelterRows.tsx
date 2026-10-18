"use client";

import type { RegistryShelterRowView } from "@opika/contracts";
import { fillTemplate, uk } from "@opika/i18n";
import { Button, buttonClass } from "../../controls/controls";
import { CAPTION, CARD, CARD_TITLE, ERROR_TEXT, STRONG } from "../profile-edit/styles";
import { SHELTERS_PAGE, type ShelterListFilters, shelterPath } from "./list-params";
import { type RegistryReadClient, registryReadBrowserClient } from "./registry-browser-client";
import { type Page, reloadPage, useMore } from "./use-more";

const t = uk.kabinet.operator.list;

/** The row's admin line: signed in, then invited (expired included) when there are any. */
export function adminsLineOf(admins: RegistryShelterRowView["admins"]): string {
  if (admins.joined === 0 && admins.invited === 0) return t.noAdmins;
  const joined = fillTemplate(t.admins, { count: String(admins.joined) });
  return admins.invited === 0
    ? joined
    : `${joined} · ${fillTemplate(t.adminsInvited, { count: String(admins.invited) })}`;
}

/**
 * One shelter on S1. Rows only link (RU-T3): no actions here, and no state
 * line the row has no data for. The link reads «Відкрити» and is named with
 * the shelter too, so a screen reader's list of links tells the rows apart.
 */
export function ShelterRow({
  row,
  cityName,
}: {
  row: RegistryShelterRowView;
  cityName: string | null;
}) {
  const nameId = `shelter-${row.id}-name`;
  const openId = `shelter-${row.id}-open`;
  return (
    <li className={CARD}>
      <h2 id={nameId} className={CARD_TITLE}>
        {row.displayName}
      </h2>
      <p className={STRONG}>
        {uk.kabinet.profileStatus[row.status]} · {cityName ?? uk.kabinet.profileNotRecorded}
      </p>
      <p className={CAPTION}>{adminsLineOf(row.admins)}</p>
      {row.donationPending ? <p className={STRONG}>{t.donationPending}</p> : null}
      <a
        id={openId}
        href={shelterPath(row.id)}
        aria-labelledby={`${openId} ${nameId}`}
        className={`${buttonClass("secondary")} self-start`}
      >
        {t.open}
      </a>
    </li>
  );
}

/**
 * S1's rows: the server's first page, then «Показати ще» from the browser
 * with the same filters and the page's cursor (keyset). The filters travel
 * with every page because the server binds each cursor to them.
 */
export function ShelterRows({
  first,
  filters,
  cityNames,
  client = registryReadBrowserClient,
  restart = reloadPage,
}: {
  first: Page<RegistryShelterRowView>;
  filters: ShelterListFilters;
  cityNames: Readonly<Record<string, string>>;
  client?: RegistryReadClient;
  restart?: () => void;
}) {
  const { items, hasMore, state, more } = useMore(
    first,
    (cursor) =>
      client.registry.shelters.list({
        search: filters.search,
        status: filters.status,
        cursor,
        limit: SHELTERS_PAGE,
      }),
    restart,
  );
  return (
    <div className="flex flex-col gap-3">
      {/* Named with the page's own heading word, so it is told apart from the status filter. */}
      <ul aria-label={t.title} className="flex flex-col gap-3">
        {items.map((row) => (
          <ShelterRow key={row.id} row={row} cityName={cityNames[row.cityId] ?? null} />
        ))}
      </ul>
      {state.kind === "failed" ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className={ERROR_TEXT}>{t.loadFailed}</p>
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
          {t.loadMore}
        </Button>
      ) : null}
    </div>
  );
}
