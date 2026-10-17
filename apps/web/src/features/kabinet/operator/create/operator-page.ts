import type { ModeratorId } from "@opika/domain";
import { decideAccess, SHELTER_WRITE_POLICY } from "../../../../kabinet/access";
import type { KabinetPrincipal } from "../../../../kabinet/actor";

// R-UI 1 rebase: replace with R-UI 1's operator page guard once it lands.

/**
 * Who gets S2 (`docs/r-ui-plan.md` §4): exactly who the registry API serves,
 * decided by the API's own access matrix (`decideAccess` on the `registry`
 * surface), never by a `principal.kind` check of the page's own. A
 * super_admin outside support mode gets the page; nobody signed in gets
 * sign-in; everyone else signed in (a shelter admin, a support view, no
 * role, conflicting roles) gets a 404 that claims nothing.
 *
 * The registry branch of `decideAccess` never reads the shelter write
 * policy, so the refusal constant is passed: R-UI needs no allowlist (§4).
 */
export type OperatorPage =
  | { kind: "sign_in" }
  | { kind: "not_found" }
  | { kind: "operator"; moderatorId: ModeratorId };

export function operatorPageOf(principal: KabinetPrincipal): OperatorPage {
  const decision = decideAccess({ surface: "registry" }, principal, SHELTER_WRITE_POLICY);
  if (decision.kind === "allow_registry") {
    return { kind: "operator", moderatorId: decision.moderatorId };
  }
  if (decision.kind === "deny" && decision.code === "UNAUTHENTICATED") return { kind: "sign_in" };
  return { kind: "not_found" };
}
