import { ShelterIdSchema } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { ShelterActionsScreen } from "../../../../features/kabinet/operator/actions/ShelterActionsScreen";
import { OperatorShell } from "../../../../features/kabinet/operator/OperatorShell";
import { operatorShelterOf } from "../../../../features/kabinet/operator/pages";
import { operatorRequest } from "../operator-request";

type Params = Promise<{ id: string }>;

/**
 * One read per request for the page and its title. Not a shelter id at all
 * is the same 404 as an unknown one.
 */
const loadShelter = cache(async (rawId: string) => {
  const request = await operatorRequest();
  const id = ShelterIdSchema.safeParse(rawId);
  const shelter = id.success
    ? await operatorShelterOf(request.principal, request.deps, id.data)
    : ({ kind: "not_found" } as const);
  return { request, shelter };
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { shelter } = await loadShelter((await params).id);
  return shelter.kind === "shelter"
    ? {
        title: fillTemplate(uk.kabinet.operator.shell.pageTitle.shelter, {
          name: shelter.view.displayName,
        }),
      }
    : {};
}

/**
 * S4 · one shelter (R-UI 1), with the operator's actions on it (R-UI 3).
 * Guards itself like S1: 404 while sign-in is unavailable or without the
 * location key (RU-T5), then the registry router decides on the record's
 * read: no session goes to sign-in; not the operator, or no such shelter, is
 * the same 404 (plan §4). The actions write from the browser through
 * `/api/kabinet`, and re-read by rendering this page again.
 */
export default async function OperatorShelterPage({ params }: { params: Params }) {
  const { request, shelter } = await loadShelter((await params).id);
  switch (shelter.kind) {
    case "sign_in":
      redirect("/kabinet/vkhid");
      break;
    case "not_found":
      notFound();
      break;
    case "shelter":
      return (
        <OperatorShell operator={request.operator} current={null}>
          <ShelterActionsScreen
            view={shelter.view}
            cityName={shelter.cityName}
            history={shelter.history}
            blocked={shelter.blocked}
            me={shelter.me}
            now={request.deps.now}
          />
        </OperatorShell>
      );
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = shelter;
      return unreachable;
    }
  }
}
