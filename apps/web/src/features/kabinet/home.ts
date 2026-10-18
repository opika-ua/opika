import type { KabinetCursor, KabinetShelterView } from "@opika/contracts";
import { cityRepo } from "@opika/db/repos";
import { type CityId, DEFAULT_FRESHNESS_POLICY, type Freshness, freshnessOf } from "@opika/domain";
import { createRouterClient, ORPCError, type RouterClient } from "@orpc/server";
import { decideAccess, registryOperatorOf } from "../../kabinet/access";
import type { KabinetPrincipal } from "../../kabinet/actor";
import type { KabinetContext } from "../../kabinet/context";
import { PHOTO_UPLOADS_NOT_CONFIGURED } from "../../kabinet/photo-uploads";
import { shelterKabinetRouter } from "../../kabinet/router";
import { latestDonationOutcomeOf } from "./profile-edit/donation-outcome";

/**
 * What `/kabinet` shows to whom (KS-Q1, Oleksii: "A"). The page calls the
 * served procedure in-process, so the router's own access middleware decides
 * and `KabinetShelterViewSchema`'s output parse strips (review of #93,
 * finding 2): the page can never show more than `shelter.profile.get` returns.
 *
 * - no session: the sign-in page;
 * - the operator (a super_admin outside support mode, the access matrix's
 *   `allow_registry`): their own screens, `/kabinet/prytulky` (R-UI, RU-T1).
 *   Decided before the profile is read, so the operator never reaches a
 *   shelter screen from here; a super_admin sees a shelter's cabinet only by
 *   entering support, which is what makes the viewing visible and time-boxed;
 * - a shelter admin: their own shelter;
 * - a support view: the shelter it entered, read-only, with the S5 banner;
 * - anyone else (no role, conflicting roles): not found.
 */
export type KabinetHome =
  | { kind: "sign_in" }
  | { kind: "not_found" }
  | { kind: "operator" }
  | {
      kind: "shelter";
      view: KabinetShelterView;
      /** The premises' city, for the address row; null if the id resolves to nothing. */
      cityName: string | null;
      viewer: "admin" | "support";
      editing: ProfileEditing;
    };

/**
 * The animal the voice editor's preview fills `{імʼя}` with (N11), and the
 * day count the real freshness block would show on its page.
 */
export type PreviewAnimal = { name: string; freshness: Freshness };

/**
 * Whether this viewer may change the profile (K4), decided by the same
 * `decideAccess` the router applies to every shelter write, with the same
 * policy: a page that offered an editor the API then refused would be
 * pretending. `read_only` for a support view and, until PR 6, for every
 * shelter outside the K-Q17 allowlist, which then sees exactly the page it
 * saw before K4.
 */
export type ProfileEditing =
  | { kind: "read_only" }
  | {
      kind: "open";
      /** Null when the shelter has no animal at all (`voice.previewNoAnimals`). */
      previewAnimal: PreviewAnimal | null;
      /** The newest donation line is the operator declining the last proposal (answer 12). */
      donationDeclined: boolean;
    };

/**
 * `invites` and `linkBaseURL` are the route's real values, not inert ones:
 * `shelter.profile.get` reads neither today, but they are what the kabinet
 * RPC route would give the same procedure, so a later change that starts
 * reading them can't silently get a sender that claims a send it never made.
 * `shelterWrites` is `SHELTER_WRITE_POLICY`, the served route's own policy;
 * `cursorSecret` and `operatorDisplayName` are the route's too, since the
 * history read pages and names the operator.
 */
export type KabinetHomeDeps = Pick<
  KabinetContext,
  | "db"
  | "now"
  | "newId"
  | "invites"
  | "linkBaseURL"
  | "shelterWrites"
  | "cursorSecret"
  | "operatorDisplayName"
>;

/**
 * Three reads, picked, never the whole router: a page render can't write a
 * cookie, so a procedure that queues one (support entry or exit) must not be
 * reachable from here, the same rule as `api/server-client.ts`. No write is
 * here either: the editor writes from the browser, through the API. These
 * procedures read none of the context fields given inert values below.
 */
const homeRouter = {
  shelter: {
    profile: { get: shelterKabinetRouter.shelter.profile.get },
    animals: { list: shelterKabinetRouter.shelter.animals.list },
    history: { list: shelterKabinetRouter.shelter.history.list },
  },
};

/**
 * How far back the page looks for the newest donation line (answer 12): ten
 * pages of 50. A decline older than 500 history lines with no donation line
 * since is not shown (inbox K4-T3); the reads are keyset, so a page is cheap.
 */
const DONATION_HISTORY_PAGES = 10;
const HISTORY_PAGE = 50;

/** The first animals page is enough to find one to preview with. */
const PREVIEW_ANIMALS_PAGE = 50;

type HomeClient = RouterClient<typeof homeRouter>;

/**
 * The animal the preview uses: one adopters can see, with its real day count;
 * failing that any animal, read as it would be on the day it is published
 * (inbox K4-T4); none, when the shelter has no animal.
 */
async function previewAnimalOf(client: HomeClient, now: Date): Promise<PreviewAnimal | null> {
  const page = await client.shelter.animals.list({
    filter: { kind: "all" },
    cursor: null,
    limit: PREVIEW_ANIMALS_PAGE,
  });
  const visible = page.items.find((item) => item.freshness !== null);
  if (visible?.freshness) return { name: visible.name, freshness: visible.freshness };
  const any = page.items[0];
  if (any === undefined) return null;
  return { name: any.name, freshness: freshnessOf(now, now, DEFAULT_FRESHNESS_POLICY) };
}

async function donationDeclinedOf(client: HomeClient): Promise<boolean> {
  let cursor: KabinetCursor | null = null;
  for (let page = 0; page < DONATION_HISTORY_PAGES; page += 1) {
    const result = await client.shelter.history.list({ cursor, limit: HISTORY_PAGE });
    const outcome = latestDonationOutcomeOf(result.items);
    if (outcome !== null) return outcome.kind === "declined";
    if (result.nextCursor === null) return false;
    cursor = result.nextCursor;
  }
  return false;
}

export async function kabinetHomeOf(
  principal: KabinetPrincipal,
  deps: KabinetHomeDeps,
): Promise<KabinetHome> {
  // The same matrix the registry router applies (`decideAccess`), never a
  // `principal.kind` check of this page's own: whoever the API would let
  // read the registry goes to the operator's screens.
  if (registryOperatorOf(principal, deps.shelterWrites) !== null) {
    return { kind: "operator" };
  }
  const client = createRouterClient(homeRouter, {
    context: (): KabinetContext => ({
      ...deps,
      principal,
      locationPolicy: null,
      setCookies: [],
      cookieHeader: null,
      production: false,
      // The home page only reads; the served route carries the real upload config.
      photoUploads: PHOTO_UPLOADS_NOT_CONFIGURED,
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
  const write = decideAccess({ surface: "shelter", mode: "write" }, principal, deps.shelterWrites);
  const editing: ProfileEditing =
    write.kind === "allow_shelter_write"
      ? {
          kind: "open",
          previewAnimal: await previewAnimalOf(client, deps.now),
          donationDeclined: view.pendingDonation === null && (await donationDeclinedOf(client)),
        }
      : { kind: "read_only" };
  return {
    kind: "shelter",
    view,
    cityName: city?.name.uk ?? null,
    viewer: principal.kind === "support_view" ? "support" : "admin",
    editing,
  };
}

/**
 * Whether `/kabinet/vkhid` sends this visitor straight to `/kabinet`: exactly
 * when the home page would show them something, a shelter or (for the
 * operator) a redirect to their list, so a live session never sits on a
 * sign-in form that looks signed out (review of #93, finding 1). Anyone else
 * sees the form; sending a roleless account to `/kabinet` would only land it
 * on a 404.
 */
export const leavesSignIn = (principal: KabinetPrincipal): boolean =>
  principal.kind === "shelter_admin" ||
  principal.kind === "support_view" ||
  principal.kind === "super_admin";
