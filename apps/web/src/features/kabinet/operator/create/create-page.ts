import { cityRepo } from "@opika/db/repos";
import type { KabinetPrincipal } from "../../../../kabinet/actor";
import { registryRouter } from "../../../../kabinet/registry-router";
import { accessOrThrow } from "../../../../kabinet/router";
import { type OperatorPageDeps, type OperatorRefusal, refusalOf } from "../pages";
import type { CityOption } from "./CreateShelterForm";

export type OperatorCreatePage = OperatorRefusal | { kind: "create"; cities: CityOption[] };

/**
 * S2 · `/kabinet/prytulky/novyi`: who gets the create form, and its city
 * list (`docs/r-ui-plan.md` §4).
 *
 * Who: exactly who may call `registry.shelters.create`, decided by the
 * registry router's own access check on that served procedure
 * (`accessOrThrow`, what its middleware applies to every call), never by a
 * check of the principal of this page's own. The page reads nothing of the
 * registry, so there is no read to guard; asking the procedure the form will
 * call answers "who may use this form" directly. A refusal is answered as on
 * R-UI 1's pages (`refusalOf`): no session goes to sign-in, anyone signed in
 * but the operator outside support mode gets a 404.
 *
 * The cities: public data, read straight from the repository (the public
 * `cities.list` is gone, since no page may ship the settlement list).
 *
 * **N4 DEBT (`Claude outputs/N3-full-list-reads.md`)**: this is the one remaining full-list read.
 * With ~30k settlements imported it would put every settlement in the page's `<select>`; the
 * searchable picker (`cities.search`) replaces it and `cityRepo.listAll` is deleted with it. The
 * production import waits for that.
 */
export async function operatorCreatePageOf(
  principal: KabinetPrincipal,
  deps: Pick<OperatorPageDeps, "db" | "shelterWrites">,
): Promise<OperatorCreatePage> {
  try {
    accessOrThrow(registryRouter.registry.shelters.create, {
      principal,
      shelterWrites: deps.shelterWrites,
    });
  } catch (error) {
    const refusal = refusalOf(error);
    if (refusal !== null) return refusal;
    throw error;
  }
  const cities = await cityRepo(deps.db).listAll();
  return {
    kind: "create",
    cities: cities.map((city) => ({ id: city.id, name: city.name.uk })),
  };
}
