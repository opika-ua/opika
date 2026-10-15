import type { KabinetShelterView } from "@opika/contracts";
import { cityRepo } from "@opika/db/repos";
import type { CityId } from "@opika/domain";
import { createRouterClient, ORPCError } from "@orpc/server";
import { SHELTER_WRITE_POLICY } from "../../kabinet/access";
import type { KabinetPrincipal } from "../../kabinet/actor";
import type { KabinetContext } from "../../kabinet/context";
import { shelterKabinetRouter } from "../../kabinet/router";

/**
 * What `/kabinet` shows to whom (KS-Q1, Oleksii: "A"). The page calls the
 * served procedure in-process, so the router's own access middleware decides
 * and `KabinetShelterViewSchema`'s output parse strips (review of #93,
 * finding 2): the page can never show more than `shelter.profile.get` returns.
 *
 * - no session: the sign-in page;
 * - a shelter admin: their own shelter;
 * - a support view: the shelter it entered, read-only, with the S5 banner;
 * - anyone else (no role, conflicting roles, a super_admin outside support
 *   mode): not found. The operator's own screens are API only (RG-Q1); a
 *   super_admin sees a shelter's cabinet only by entering support, which is
 *   what makes the viewing visible and time-boxed.
 */
export type KabinetHome =
  | { kind: "sign_in" }
  | { kind: "not_found" }
  | {
      kind: "shelter";
      view: KabinetShelterView;
      /** The premises' city, for the address row; null if the id resolves to nothing. */
      cityName: string | null;
      viewer: "admin" | "support";
    };

/**
 * `invites` and `linkBaseURL` are the route's real values, not inert ones:
 * `shelter.profile.get` reads neither today, but they are what the kabinet
 * RPC route would give the same procedure, so a later change that starts
 * reading them can't silently get a sender that claims a send it never made.
 */
export type KabinetHomeDeps = Pick<
  KabinetContext,
  "db" | "now" | "newId" | "invites" | "linkBaseURL"
>;

/**
 * Only `shelter.profile.get`, picked, never the whole router: a page render
 * can't write a cookie, so a procedure that queues one (support entry or
 * exit) must not be reachable from here, the same rule as
 * `api/server-client.ts`. That procedure reads none of the context fields
 * given inert values below.
 */
const homeRouter = { shelter: { profile: { get: shelterKabinetRouter.shelter.profile.get } } };

export async function kabinetHomeOf(
  principal: KabinetPrincipal,
  deps: KabinetHomeDeps,
): Promise<KabinetHome> {
  const client = createRouterClient(homeRouter, {
    context: (): KabinetContext => ({
      ...deps,
      principal,
      cursorSecret: "",
      operatorDisplayName: "",
      locationPolicy: null,
      setCookies: [],
      cookieHeader: null,
      production: false,
      shelterWrites: SHELTER_WRITE_POLICY,
    }),
  });
  let view: KabinetShelterView;
  try {
    view = await client.shelter.profile.get({});
  } catch (error) {
    if (error instanceof ORPCError && error.code === "UNAUTHENTICATED") return { kind: "sign_in" };
    if (error instanceof ORPCError && error.code === "FORBIDDEN") return { kind: "not_found" };
    throw error;
  }
  // A city is public data (it names the card's location), not something the
  // shelter view withholds; the view carries only its id.
  const city = await cityRepo(deps.db).findById(view.exactAddress.cityId as CityId);
  return {
    kind: "shelter",
    view,
    cityName: city?.name.uk ?? null,
    viewer: principal.kind === "support_view" ? "support" : "admin",
  };
}

/**
 * Whether `/kabinet/vkhid` sends this visitor straight to `/kabinet`: exactly
 * when the home page would show them a shelter, so a live session never sits
 * on a sign-in form that looks signed out (review of #93, finding 1). Anyone
 * else sees the form; sending a roleless account to `/kabinet` would only
 * land it on a 404.
 */
export const leavesSignIn = (principal: KabinetPrincipal): boolean =>
  principal.kind === "shelter_admin" || principal.kind === "support_view";
