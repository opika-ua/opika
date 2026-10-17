import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { listFiltersOf } from "../../../features/kabinet/operator/list-params";
import { OperatorShell } from "../../../features/kabinet/operator/OperatorShell";
import { operatorShelterListOf } from "../../../features/kabinet/operator/pages";
import { ShelterListScreen } from "../../../features/kabinet/operator/ShelterListScreen";
import { operatorRequest } from "./operator-request";

export const metadata: Metadata = {
  title: uk.kabinet.operator.shell.pageTitle.list,
};

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * S1 · Притулки (R-UI 1), the operator's home: `/kabinet` redirects the
 * operator here (RU-T1). The page guards itself: 404 while sign-in is
 * unavailable or without the location key (RU-T5), then the registry
 * router's own access check on the list read: no session goes to sign-in,
 * anyone signed in but not the operator gets 404 (plan §4).
 */
export default async function OperatorSheltersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { principal, deps, operator } = await operatorRequest();
  const filters = listFiltersOf(await searchParams);
  const list = await operatorShelterListOf(principal, deps, filters);
  switch (list.kind) {
    case "sign_in":
      redirect("/kabinet/vkhid");
      break;
    case "not_found":
      notFound();
      break;
    case "load_failed":
    case "list":
      return (
        <OperatorShell operator={operator} current="shelters">
          <ShelterListScreen
            filters={filters}
            content={
              list.kind === "list"
                ? { kind: "list", page: list.page, cityNames: list.cityNames }
                : { kind: "load_failed" }
            }
          />
        </OperatorShell>
      );
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = list;
      return unreachable;
    }
  }
}
