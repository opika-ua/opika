import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDb } from "../../../../api/db";
import { anonymousRouterClient } from "../../../../api/server-client";
import { KabinetBrand } from "../../../../features/kabinet/KabinetBrand";
import { CreateShelterForm } from "../../../../features/kabinet/operator/create/CreateShelterForm";
import { operatorPageOf } from "../../../../features/kabinet/operator/create/operator-page";
import { kabinetIdentityOf } from "../../../../kabinet/principal";
import { kabinetAuthOrNotFound } from "../../available-auth";

export const metadata: Metadata = {
  title: uk.kabinet.operator.shell.pageTitle.create,
};

/**
 * S2 · `/kabinet/prytulky/novyi`: the operator creates a shelter and invites
 * its first admin (`docs/r-ui-plan.md` §1). The page guards itself (§4), in
 * this order, each before anything it would otherwise touch:
 *
 * 1. sign-in unavailable: 404, before the auth instance (as every kabinet
 *    page; the layout's 404 runs concurrently and can't stop this one);
 * 2. no `LOCATION_HMAC_SECRET`: 404, the page's side of the API's 503
 *    (RU-T5, RG-Q10): without the key the registry can't create a shelter
 *    honestly, so the screen that would try isn't served;
 * 3. the visitor, by the API's own access matrix (`operatorPageOf`):
 *    anonymous to sign-in, anyone but an operator outside support mode 404.
 *
 * The create itself goes from the browser to `/api/kabinet/registry/*`
 * (`registry-create-client.ts`), which applies the same matrix, the Origin
 * check, the per-user limit and the 503 again: this page grants nothing.
 * The city list is public data (`cities.list`).
 */
export default async function NewShelterPage() {
  const auth = kabinetAuthOrNotFound();
  if (!process.env.LOCATION_HMAC_SECRET) notFound();
  const db = getDb();
  const identity = await kabinetIdentityOf(
    auth,
    db,
    new Headers(await headers()),
    new Date(),
    process.env.NODE_ENV === "production",
  );
  const page = operatorPageOf(identity.principal);
  if (page.kind === "sign_in") redirect("/kabinet/vkhid");
  if (page.kind === "not_found") notFound();

  const cities = await anonymousRouterClient(db).cities.list({});
  // R-UI 1 rebase: replace this header and main with the operator shell (nav, name, role label, «Вийти»).
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex min-h-16 items-center bg-rg-surface px-4 tablet:px-8">
        <KabinetBrand />
      </header>
      <main className="flex flex-1 flex-col px-4 pt-5 pb-6 tablet:px-8 tablet:pt-8">
        <CreateShelterForm cities={cities.map((city) => ({ id: city.id, name: city.name.uk }))} />
      </main>
    </div>
  );
}
