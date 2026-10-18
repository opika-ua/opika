import type { KabinetAnimalView, KabinetShelterView } from "@opika/contracts";
import { AnimalIdSchema } from "@opika/domain";
import { createRouterClient, ORPCError } from "@orpc/server";
import { decideAccess } from "../../kabinet/access";
import type { KabinetPrincipal } from "../../kabinet/actor";
import type { KabinetContext } from "../../kabinet/context";
import { PHOTO_UPLOADS_NOT_CONFIGURED } from "../../kabinet/photo-uploads";
import { shelterKabinetRouter } from "../../kabinet/router";
import type { AnimalFormEditing } from "./animal-form/AnimalForm";
import { type ShelterVisibility, shelterVisibilityOf } from "./animal-form/labels";
import type { KabinetHomeDeps } from "./home";

/**
 * What `/kabinet/tvaryny/nova` and `/kabinet/tvaryny/[id]` show to whom (K3),
 * decided like `/kabinet`'s home: the served procedures run in-process, so the
 * router's own access middleware decides and the output schemas strip.
 *
 * - no session: the sign-in page;
 * - a shelter admin, or a support view of the shelter it entered: the form,
 *   writable only if `decideAccess` with the served write policy says so (until
 *   PR 6, the K-Q17 allowlist's test shelter alone), read-only otherwise;
 * - anyone else (no role, conflicting roles, **a super_admin outside support
 *   mode**): not found, as at `/kabinet` (the operator sees a shelter's
 *   cabinet only by entering support);
 * - `/nova` without write access: not found. There is nothing to show
 *   read-only on a page whose only purpose is to create, and a page that
 *   offered a form the API refused would be pretending;
 * - an id that isn't this shelter's animal (missing, another shelter's, or not
 *   an id at all): `missing`, one answer for all three, so the page tells no
 *   more than the API does (copy sheet §12, `errors.notFound`).
 */
export type KabinetAnimalPage =
  | { kind: "sign_in" }
  | { kind: "not_found" }
  | {
      kind: "missing";
      shelter: KabinetShelterView;
      viewer: "admin" | "support";
      /** For the way back: K2 when it is shown to this viewer, the profile otherwise. */
      editing: AnimalFormEditing;
    }
  | {
      kind: "form";
      shelter: KabinetShelterView;
      view: KabinetAnimalView | null;
      viewer: "admin" | "support";
      editing: AnimalFormEditing;
      /** Where the shelter's cards stand with the public: `shelterVisibilityOf`. */
      shelterVisibility: ShelterVisibility;
    };

/**
 * `shelterVisibilityOf` lives beside `ShelterVisibility` in the form's
 * client-safe labels, so K2's client list can use it without pulling this
 * module's server router into the browser bundle; re-exported here for the
 * pages and tests that read it from where the pages decide.
 */
export { shelterVisibilityOf } from "./animal-form/labels";

export type AnimalPageTarget = { kind: "new" } | { kind: "existing"; animalId: string };

/** Two reads, picked: the shelter (for its name and whether its cards are shown) and the animal. */
const animalPageRouter = {
  shelter: {
    profile: { get: shelterKabinetRouter.shelter.profile.get },
    animals: { byId: shelterKabinetRouter.shelter.animals.byId },
  },
};

const isCode = (error: unknown, ...codes: string[]) =>
  error instanceof ORPCError && codes.includes(error.code);

export async function kabinetAnimalPageOf(
  principal: KabinetPrincipal,
  target: AnimalPageTarget,
  deps: KabinetHomeDeps,
): Promise<KabinetAnimalPage> {
  if (principal.kind === "anonymous") return { kind: "sign_in" };
  if (principal.kind !== "shelter_admin" && principal.kind !== "support_view") {
    return { kind: "not_found" };
  }
  const viewer = principal.kind === "support_view" ? "support" : "admin";
  const client = createRouterClient(animalPageRouter, {
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
  let shelter: KabinetShelterView;
  try {
    shelter = await client.shelter.profile.get({});
  } catch (error) {
    if (isCode(error, "UNAUTHENTICATED")) return { kind: "sign_in" };
    if (isCode(error, "FORBIDDEN")) return { kind: "not_found" };
    throw error;
  }
  const write = decideAccess({ surface: "shelter", mode: "write" }, principal, deps.shelterWrites);
  const editing: AnimalFormEditing =
    write.kind === "allow_shelter_write"
      ? { kind: "open", grantedBy: write.grantedBy }
      : { kind: "read_only" };
  const shelterVisibility = shelterVisibilityOf(shelter.verification.status);

  if (target.kind === "new") {
    if (editing.kind === "read_only") return { kind: "not_found" };
    return { kind: "form", shelter, view: null, viewer, editing, shelterVisibility };
  }
  // Not an id at all: the same answer as an id that names nothing here.
  const animalId = AnimalIdSchema.safeParse(target.animalId);
  if (!animalId.success) return { kind: "missing", shelter, viewer, editing };
  try {
    const view = await client.shelter.animals.byId({ animalId: animalId.data });
    return { kind: "form", shelter, view, viewer, editing, shelterVisibility };
  } catch (error) {
    if (isCode(error, "NOT_FOUND", "FORBIDDEN")) {
      return { kind: "missing", shelter, viewer, editing };
    }
    throw error;
  }
}
