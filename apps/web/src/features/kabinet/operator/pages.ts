import type {
  BlockedAddressesView,
  KabinetCursor,
  RegistryShelterRowView,
  RegistryShelterView,
} from "@opika/contracts";
import { cityRepo } from "@opika/db/repos";
import type {
  CityId,
  ModeratorId,
  ShelterHistoryEntry,
  ShelterId,
  VerificationStatus,
} from "@opika/domain";
import { createRouterClient, ORPCError, type RouterClient } from "@orpc/server";
import { registryOperatorOf } from "../../../kabinet/access";
import type { KabinetPrincipal } from "../../../kabinet/actor";
import type { KabinetContext } from "../../../kabinet/context";
import { INVITE_PASSWORDS_OFF } from "../../../kabinet/invite-password";
import { PHOTO_UPLOADS_NOT_CONFIGURED } from "../../../kabinet/photo-uploads";
import { registryRouter } from "../../../kabinet/registry-router";
import { HISTORY_PAGE, SHELTERS_PAGE, type ShelterListFilters } from "./list-params";

/**
 * The operator's pages (R-UI 1) read through the registry's own procedures,
 * in-process: the router's access middleware decides who gets in and its
 * output schemas strip, so a page can show no more than the API would answer
 * (plan §4, the same rule as `home.ts`).
 *
 * **Picked and read-only.** Four reads, never the whole router: no page render
 * may reach a write, and `registry.support.enter` sets a cookie, which a
 * render can't do (the same reason `api/router-client.ts` picks). Writes go
 * from the browser to `/api/kabinet/registry/*` (R-UI 3), which carries the
 * Origin check, the per-user limit and the 503 without the location key.
 */
const operatorReadRouter = {
  registry: {
    shelters: {
      list: registryRouter.registry.shelters.list,
      byId: registryRouter.registry.shelters.byId,
    },
    history: { list: registryRouter.registry.history.list },
    admins: { blockedAddresses: registryRouter.registry.admins.blockedAddresses },
  },
};

type ReadClient = RouterClient<typeof operatorReadRouter>;

/**
 * The served route's real values for what these reads touch: `invites`
 * (the block-list reader behind `blockedAddresses`), `cursorSecret` (both
 * lists page with signed cursors), `shelterWrites` (`SHELTER_WRITE_POLICY`,
 * as the route passes; the registry never reads it).
 */
export type OperatorPageDeps = Pick<
  KabinetContext,
  | "db"
  | "now"
  | "newId"
  | "invites"
  | "linkBaseURL"
  | "shelterWrites"
  | "cursorSecret"
  | "operatorDisplayName"
  | "production"
>;

function readClient(principal: KabinetPrincipal, deps: OperatorPageDeps): ReadClient {
  return createRouterClient(operatorReadRouter, {
    context: (): KabinetContext => ({
      ...deps,
      principal,
      // No read here builds a location: only create and an address change do
      // (`locationPolicyOf`), and they are writes, never reachable from this
      // router. Pages without the key answer 404 before this (RU-T5).
      locationPolicy: null,
      setCookies: [],
      cookieHeader: null,
      photoUploads: PHOTO_UPLOADS_NOT_CONFIGURED,
      invitePasswords: INVITE_PASSWORDS_OFF,
    }),
  });
}

/** Why a page shows nothing of the registry: no session, or not the operator / no such shelter. */
export type OperatorRefusal = { kind: "sign_in" } | { kind: "not_found" };

/**
 * The router's refusal as the page answers it (plan §4): no session goes to
 * sign-in; FORBIDDEN (signed in, not the operator) and NOT_FOUND (no such
 * shelter) are one and the same 404, so the page never says which.
 */
export function refusalOf(error: unknown): OperatorRefusal | null {
  if (!(error instanceof ORPCError)) return null;
  if (error.code === "UNAUTHENTICATED") return { kind: "sign_in" };
  if (error.code === "FORBIDDEN" || error.code === "NOT_FOUND") return { kind: "not_found" };
  return null;
}

/** City names by id, public data the rows name by id only. */
async function cityNamesOf(deps: OperatorPageDeps): Promise<Record<string, string>> {
  const cities = await cityRepo(deps.db).listAll();
  return Object.fromEntries(cities.map((city) => [city.id, city.name.uk]));
}

export type ShelterListPage = {
  items: readonly RegistryShelterRowView[];
  nextCursor: KabinetCursor | null;
  counts: Record<VerificationStatus, number>;
};

export type OperatorList =
  | OperatorRefusal
  /** The list itself failed to load (the database, not access): the page offers a retry. */
  | { kind: "load_failed" }
  | {
      kind: "list";
      filters: ShelterListFilters;
      page: ShelterListPage;
      cityNames: Record<string, string>;
    };

/** S1: the first page for the URL's filters (RU-T4). «Показати ще» pages from the browser. */
export async function operatorShelterListOf(
  principal: KabinetPrincipal,
  deps: OperatorPageDeps,
  filters: ShelterListFilters,
  log: (error: unknown) => void = (error) => console.error("[kabinet] operator list", error),
): Promise<OperatorList> {
  let page: ShelterListPage;
  try {
    page = await readClient(principal, deps).registry.shelters.list({
      search: filters.search,
      status: filters.status,
      cursor: null,
      limit: SHELTERS_PAGE,
    });
  } catch (error) {
    const refusal = refusalOf(error);
    if (refusal !== null) return refusal;
    log(error);
    return { kind: "load_failed" };
  }
  return { kind: "list", filters, page, cityNames: await cityNamesOf(deps) };
}

export type HistoryPage = {
  items: readonly ShelterHistoryEntry[];
  nextCursor: KabinetCursor | null;
};

export type OperatorShelter =
  | OperatorRefusal
  | {
      kind: "shelter";
      view: RegistryShelterView;
      /** The premises' city name, null if the id resolves to nothing. */
      cityName: string | null;
      history: HistoryPage;
      blocked: BlockedAddressesView;
      /** The operator reading: their own history lines read «ви». */
      me: ModeratorId;
    };

/**
 * S4, read-only (R-UI 1): the record first, which decides access and
 * existence, then its history's first page and its blocked addresses.
 */
export async function operatorShelterOf(
  principal: KabinetPrincipal,
  deps: OperatorPageDeps,
  shelterId: ShelterId,
): Promise<OperatorShelter> {
  const client = readClient(principal, deps);
  try {
    const view = await client.registry.shelters.byId({ shelterId });
    const [history, blocked, city] = await Promise.all([
      client.registry.history.list({ shelterId, cursor: null, limit: HISTORY_PAGE }),
      client.registry.admins.blockedAddresses({ shelterId }),
      cityRepo(deps.db).findById(view.exactAddress.cityId as CityId),
    ]);
    // The operator reading, for «ви» in history: the decision the middleware just made.
    const me = registryOperatorOf(principal, deps.shelterWrites);
    if (me === null) return { kind: "not_found" };
    return { kind: "shelter", view, cityName: city?.name.uk ?? null, history, blocked, me };
  } catch (error) {
    const refusal = refusalOf(error);
    if (refusal !== null) return refusal;
    throw error;
  }
}
