import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CreateShelterForm } from "../../../../features/kabinet/operator/create/CreateShelterForm";
import { operatorCreatePageOf } from "../../../../features/kabinet/operator/create/create-page";
import { OperatorShell } from "../../../../features/kabinet/operator/OperatorShell";
import { operatorRequest } from "../operator-request";

export const metadata: Metadata = {
  title: uk.kabinet.operator.shell.pageTitle.create,
};

/**
 * S2 · Новий притулок (R-UI 2): the operator creates a shelter and invites
 * its first admin (`docs/r-ui-plan.md` §1). The page guards itself like
 * R-UI 1's: `operatorRequest` answers the 404 while sign-in is unavailable
 * or without the location key (RU-T5), before auth or the database; then
 * the registry router's own access check on `registry.shelters.create`
 * (`operatorCreatePageOf`): no session goes to sign-in, anyone signed in
 * but the operator outside support mode gets 404 (plan §4).
 *
 * The create itself goes from the browser to `/api/kabinet/registry/*`
 * (`registry-create-client.ts`), which applies the same matrix, the Origin
 * check, the per-user limit and the 503 again: this page grants nothing.
 */
export default async function NewShelterPage() {
  const { principal, deps, operator } = await operatorRequest();
  const page = await operatorCreatePageOf(principal, deps);
  switch (page.kind) {
    case "sign_in":
      redirect("/kabinet/vkhid");
      break;
    case "not_found":
      notFound();
      break;
    case "create":
      return (
        <OperatorShell operator={operator} current="new_shelter">
          <CreateShelterForm cities={page.cities} />
        </OperatorShell>
      );
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = page;
      return unreachable;
    }
  }
}
