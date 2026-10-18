import type { KabinetShelterView } from "@opika/contracts";
import { createRouterClient, ORPCError } from "@orpc/server";
import { decideAccess } from "../../../kabinet/access";
import type { KabinetPrincipal } from "../../../kabinet/actor";
import type { KabinetContext } from "../../../kabinet/context";
import { PHOTO_UPLOADS_NOT_CONFIGURED } from "../../../kabinet/photo-uploads";
import { shelterKabinetRouter } from "../../../kabinet/router";
import type { AnimalFormEditing } from "../animal-form/AnimalForm";
import type { KabinetHomeDeps } from "../home";
import { animalListShownTo } from "../routes";
import { ANIMAL_LIST_PAGE, type AnimalListPageData } from "./list-model";

/**
 * What `/kabinet/tvaryny` shows to whom (K2), decided like K3's pages: the
 * served procedures run in-process, so the router's own access middleware
 * decides and the output schemas strip.
 *
 * - no session: the sign-in page;
 * - a shelter admin whose writes the served policy opens (until PR 6, the
 *   K-Q17 allowlist's test shelter alone): the list, with its moves;
 * - a support view of the shelter it entered: the same list, every action
 *   disabled (S5);
 * - a shelter admin whose writes are refused: not found (P1,
 *   `animalListShownTo`), the kabinet it had before K2;
 * - anyone else (no role, conflicting roles, **a super_admin outside support
 *   mode**): not found, as at `/kabinet` and K3's pages.
 */
export type KabinetAnimalListPage =
  | { kind: "sign_in" }
  | { kind: "not_found" }
  | {
      kind: "list";
      shelter: KabinetShelterView;
      viewer: "admin" | "support";
      editing: AnimalFormEditing;
      first: AnimalListPageData;
    };

/** Two reads, picked: the shelter (its name, and whether its cards are shown) and the first page. */
const listPageRouter = {
  shelter: {
    profile: { get: shelterKabinetRouter.shelter.profile.get },
    animals: { list: shelterKabinetRouter.shelter.animals.list },
  },
};

const isCode = (error: unknown, ...codes: string[]) =>
  error instanceof ORPCError && codes.includes(error.code);

export async function kabinetAnimalListPageOf(
  principal: KabinetPrincipal,
  deps: KabinetHomeDeps,
): Promise<KabinetAnimalListPage> {
  if (principal.kind === "anonymous") return { kind: "sign_in" };
  if (principal.kind !== "shelter_admin" && principal.kind !== "support_view") {
    return { kind: "not_found" };
  }
  const viewer = principal.kind === "support_view" ? "support" : "admin";
  const write = decideAccess({ surface: "shelter", mode: "write" }, principal, deps.shelterWrites);
  const editing: AnimalFormEditing =
    write.kind === "allow_shelter_write" ? { kind: "open" } : { kind: "read_only" };
  if (!animalListShownTo(viewer, editing)) return { kind: "not_found" };

  const client = createRouterClient(listPageRouter, {
    context: (): KabinetContext => ({
      ...deps,
      principal,
      locationPolicy: null,
      setCookies: [],
      cookieHeader: null,
      production: false,
      // Reads only; the served route carries the real upload config.
      photoUploads: PHOTO_UPLOADS_NOT_CONFIGURED,
    }),
  });
  try {
    const [shelter, first] = await Promise.all([
      client.shelter.profile.get({}),
      client.shelter.animals.list({
        filter: { kind: "all" },
        cursor: null,
        limit: ANIMAL_LIST_PAGE,
      }),
    ]);
    return { kind: "list", shelter, viewer, editing, first };
  } catch (error) {
    if (isCode(error, "UNAUTHENTICATED")) return { kind: "sign_in" };
    if (isCode(error, "FORBIDDEN")) return { kind: "not_found" };
    throw error;
  }
}
