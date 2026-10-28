import type { KabinetShelterView } from "@opika/contracts";
import { createRouterClient, ORPCError } from "@orpc/server";
import { decideAccess, registryOperatorOf } from "../../kabinet/access";
import type { KabinetPrincipal } from "../../kabinet/actor";
import type { KabinetContext } from "../../kabinet/context";
import { INVITE_PASSWORDS_OFF } from "../../kabinet/invite-password";
import { PHOTO_UPLOADS_NOT_CONFIGURED } from "../../kabinet/photo-uploads";
import { shelterKabinetRouter } from "../../kabinet/router";
import type { KabinetHomeDeps } from "./home";
import { animalListShownTo } from "./routes";

/**
 * Головна, `SHELTER_HOME` (kabinet redesign Phase 2 PR 1 - the research
 * proposal's "what needs attention" landing page, replacing K4's profile
 * editor in that slot). Decided the same way `kabinetHomeOf` and
 * `kabinetAnimalListPageOf` already decide who sees what: the same
 * `registryOperatorOf` check sends the operator to their own list, and the
 * same served procedures (`shelter.profile.get`, `shelter.animals.list`) run
 * through the router's own access middleware and output schemas, so this
 * page can show no more than those procedures would already return to a
 * K4 or K2 request from the same principal. No new procedure, no new SQL,
 * no new permission - two existing reads, composed for one screen.
 */
export type KabinetDashboard =
  | { kind: "sign_in" }
  | { kind: "not_found" }
  | { kind: "operator" }
  | {
      kind: "shelter";
      view: KabinetShelterView;
      viewer: "admin" | "support";
      /** `shelter.animals.list`'s own `counts.draft` - the same number K2's «Чернетки» chip shows. */
      draftCount: number;
      /** `shelter.animals.list`'s own `staleCount` - the same number K2's stale strip shows. */
      staleCount: number;
      /** Whether K2 is reachable at all for this viewer (P1), for the two counts' links. */
      animalListShown: boolean;
      /** The same `editable` K2 and K3 compute: writes open, and an admin, not a support view. */
      canWrite: boolean;
    };

/** Two reads, picked: the profile (verification, pause) and the list's counts (draft, stale). */
const dashboardRouter = {
  shelter: {
    profile: { get: shelterKabinetRouter.shelter.profile.get },
    animals: { list: shelterKabinetRouter.shelter.animals.list },
  },
};

export async function kabinetDashboardOf(
  principal: KabinetPrincipal,
  deps: KabinetHomeDeps,
): Promise<KabinetDashboard> {
  // The same matrix the registry router applies: whoever the API would let
  // read the registry goes to the operator's own screens, as `/kabinet` and
  // `/kabinet/tvaryny` already decide.
  if (registryOperatorOf(principal, deps.shelterWrites) !== null) {
    return { kind: "operator" };
  }
  const client = createRouterClient(dashboardRouter, {
    context: (): KabinetContext => ({
      ...deps,
      principal,
      locationPolicy: null,
      setCookies: [],
      cookieHeader: null,
      production: false,
      // Reads only; the served route carries the real upload config.
      photoUploads: PHOTO_UPLOADS_NOT_CONFIGURED,
      invitePasswords: INVITE_PASSWORDS_OFF,
    }),
  });
  try {
    const [view, animals] = await Promise.all([
      client.shelter.profile.get({}),
      // Counts only: the smallest page the contract allows (K-S4's own min).
      client.shelter.animals.list({ filter: { kind: "all" }, cursor: null, limit: 1 }),
    ]);
    const viewer = principal.kind === "support_view" ? "support" : "admin";
    const write = decideAccess(
      { surface: "shelter", mode: "write" },
      principal,
      deps.shelterWrites,
    );
    const open = write.kind === "allow_shelter_write";
    return {
      kind: "shelter",
      view,
      viewer,
      draftCount: animals.counts.draft,
      staleCount: animals.staleCount,
      animalListShown: animalListShownTo(viewer, { kind: open ? "open" : "read_only" }),
      canWrite: open && viewer === "admin",
    };
  } catch (error) {
    if (error instanceof ORPCError && error.code === "UNAUTHENTICATED") return { kind: "sign_in" };
    if (error instanceof ORPCError && error.code === "FORBIDDEN") return { kind: "not_found" };
    throw error;
  }
}
