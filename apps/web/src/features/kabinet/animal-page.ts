import type { KabinetAnimalView, KabinetShelterView } from "@opika/contracts";
import {
  AnimalIdSchema,
  FEED_VISIBLE_VERIFICATION_STATUSES,
  type VerificationStatus,
} from "@opika/domain";
import { createRouterClient, ORPCError } from "@orpc/server";
import { decideAccess } from "../../kabinet/access";
import type { KabinetPrincipal } from "../../kabinet/actor";
import type { KabinetContext } from "../../kabinet/context";
import { PHOTO_UPLOADS_NOT_CONFIGURED } from "../../kabinet/photo-uploads";
import { shelterKabinetRouter } from "../../kabinet/router";
import type { AnimalFormEditing } from "./animal-form/AnimalForm";
import type { ShelterVisibility } from "./animal-form/labels";
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
  | { kind: "missing"; shelter: KabinetShelterView; viewer: "admin" | "support" }
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
 * `visible` is the public surfaces' own rule (`FEED_VISIBLE_VERIFICATION_STATUSES`
 * in the feed and gallery predicate, `verified` in `animals.byId`), not a
 * second copy of it: a paused, suspended or not-yet-verified shelter's cards
 * are shown nowhere. The switch then sorts every status those surfaces don't
 * show by why, because the form's sentences differ: before a pass (pending,
 * under review, or rejected, which may resubmit) the cards show «щойно
 * притулок пройде перевірку»; after one (paused, suspended) that sentence
 * would be false. `verified` sits with those: it reaches the switch only if
 * the surfaces ever stop showing a verified shelter, and such a shelter has
 * passed. Exhaustive, so a new status fails to compile until it is placed.
 */
export const shelterVisibilityOf = (status: VerificationStatus): ShelterVisibility => {
  if ((FEED_VISIBLE_VERIFICATION_STATUSES as readonly string[]).includes(status)) return "visible";
  switch (status) {
    case "pending":
    case "under_review":
    case "rejected":
      return "awaiting_verification";
    case "verified":
    case "paused":
    case "suspended":
      return "hidden";
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled status; unreachable at runtime */
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
};

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
  if (!animalId.success) return { kind: "missing", shelter, viewer };
  try {
    const view = await client.shelter.animals.byId({ animalId: animalId.data });
    return { kind: "form", shelter, view, viewer, editing, shelterVisibility };
  } catch (error) {
    if (isCode(error, "NOT_FOUND", "FORBIDDEN")) return { kind: "missing", shelter, viewer };
    throw error;
  }
}
