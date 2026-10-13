import { type KabinetCursor, registryContract } from "@opika/contracts";
import type { LocationPrivacyPolicy, ModeratorId } from "@opika/domain";
import { implement } from "@orpc/server";
import {
  decodeRegistryHistoryCursor,
  decodeRegistrySheltersCursor,
  encodeRegistryHistoryCursor,
  encodeRegistrySheltersCursor,
  type RegistrySheltersPosition,
  registrySheltersFingerprint,
} from "../api/cursor";
import type { AccessDecision } from "./access";
import type { KabinetContext } from "./context";
import {
  registryAdminsInvite,
  registryAdminsRemove,
  registryAdminsResendInvite,
  registrySheltersCreate,
} from "./handlers/registry-invitations";
import {
  loadShelterOr404,
  registryHistoryList,
  registrySheltersById,
  registrySheltersList,
} from "./handlers/registry-reads";
import {
  registryApprove,
  registryDonationApprove,
  registryDonationReject,
  registryReinstate,
  registryReject,
  registryResubmit,
  registryStartReview,
  registrySuspend,
  registryUpdateProfile,
  registryUpdateVerifiedData,
} from "./handlers/registry-writes";
import { accessOrThrow } from "./router";
import { enterSupport, exitSupport } from "./support";

const base = implement(registryContract).$context<KabinetContext>();

/** The same access matrix as the shelter router, applied once per procedure. */
const guarded = base.use(async ({ context, procedure, next }) =>
  next({ context: { access: accessOrThrow(procedure, context.principal) } }),
);

/** The operator a registry handler acts as. Anything else reaching one is a wiring fault. */
function operator(access: AccessDecision): ModeratorId {
  if (access.kind === "allow_registry") return access.moderatorId;
  throw new Error(`Registry handler reached with ${access.kind}`);
}

/** The route answers 503 before any registry call when the key is missing (RG-Q10). */
function locationPolicyOf(context: KabinetContext): LocationPrivacyPolicy {
  if (context.locationPolicy === null)
    throw new Error("Registry reached without a location policy");
  return context.locationPolicy;
}

export const registryRouter = guarded.router({
  registry: {
    shelters: {
      list: guarded.registry.shelters.list.handler(({ context, input, errors }) => {
        operator(context.access);
        const fingerprint = registrySheltersFingerprint(input.search, input.status);
        let after: RegistrySheltersPosition | null = null;
        if (input.cursor !== null) {
          const decoded = decodeRegistrySheltersCursor(
            input.cursor,
            fingerprint,
            context.cursorSecret,
          );
          if (decoded === null) throw errors.INVALID_CURSOR();
          after = decoded.data;
        }
        return registrySheltersList(
          context,
          {
            search: input.search,
            status: input.status,
            after,
            limit: input.limit,
          },
          (position) =>
            encodeRegistrySheltersCursor(
              position,
              fingerprint,
              context.cursorSecret,
            ) as KabinetCursor,
        );
      }),
      byId: guarded.registry.shelters.byId.handler(({ context, input, errors }) => {
        operator(context.access);
        return registrySheltersById(context, input, errors);
      }),
      create: guarded.registry.shelters.create.handler(({ context, input, errors }) =>
        registrySheltersCreate(
          context,
          operator(context.access),
          locationPolicyOf(context),
          input,
          errors,
        ),
      ),
      updateVerifiedData: guarded.registry.shelters.updateVerifiedData.handler(
        ({ context, input, errors }) =>
          registryUpdateVerifiedData(
            context,
            operator(context.access),
            locationPolicyOf(context),
            input,
            errors,
          ),
      ),
      updateProfile: guarded.registry.shelters.updateProfile.handler(({ context, input, errors }) =>
        registryUpdateProfile(context, operator(context.access), input, errors),
      ),
    },
    verification: {
      startReview: guarded.registry.verification.startReview.handler(({ context, input, errors }) =>
        registryStartReview(context, operator(context.access), input, errors),
      ),
      approve: guarded.registry.verification.approve.handler(({ context, input, errors }) =>
        registryApprove(context, operator(context.access), input, errors),
      ),
      reinstate: guarded.registry.verification.reinstate.handler(({ context, input, errors }) =>
        registryReinstate(context, operator(context.access), input, errors),
      ),
      reject: guarded.registry.verification.reject.handler(({ context, input, errors }) =>
        registryReject(context, operator(context.access), input, errors),
      ),
      suspend: guarded.registry.verification.suspend.handler(({ context, input, errors }) =>
        registrySuspend(context, operator(context.access), input, errors),
      ),
      resubmit: guarded.registry.verification.resubmit.handler(({ context, input, errors }) =>
        registryResubmit(context, operator(context.access), input, errors),
      ),
    },
    donation: {
      approve: guarded.registry.donation.approve.handler(({ context, input, errors }) =>
        registryDonationApprove(context, operator(context.access), input, errors),
      ),
      reject: guarded.registry.donation.reject.handler(({ context, input, errors }) =>
        registryDonationReject(context, operator(context.access), input, errors),
      ),
    },
    admins: {
      invite: guarded.registry.admins.invite.handler(({ context, input, errors }) =>
        registryAdminsInvite(context, operator(context.access), input, errors),
      ),
      resendInvite: guarded.registry.admins.resendInvite.handler(({ context, input, errors }) =>
        registryAdminsResendInvite(context, operator(context.access), input, errors),
      ),
      remove: guarded.registry.admins.remove.handler(({ context, input, errors }) =>
        registryAdminsRemove(context, operator(context.access), input, errors),
      ),
    },
    history: {
      list: guarded.registry.history.list.handler(({ context, input, errors }) => {
        operator(context.access);
        let after: { at: Date; id: string } | null = null;
        if (input.cursor !== null) {
          const decoded = decodeRegistryHistoryCursor(
            input.cursor,
            input.shelterId,
            context.cursorSecret,
          );
          if (decoded === null) throw errors.INVALID_CURSOR();
          after = decoded.data;
        }
        return registryHistoryList(
          context,
          { shelterId: input.shelterId, after, limit: input.limit },
          (position) =>
            encodeRegistryHistoryCursor(
              position,
              input.shelterId,
              context.cursorSecret,
            ) as KabinetCursor,
          errors,
        );
      }),
    },
    support: {
      enter: guarded.registry.support.enter.handler(async ({ context, input, errors }) => {
        const moderatorId = operator(context.access);
        await loadShelterOr404(context, input.shelterId, errors);
        await enterSupport(context, moderatorId, input.shelterId);
        return {};
      }),
    },
  },
  session: {
    exitSupport: guarded.session.exitSupport.handler(async ({ context }) => {
      if (context.access.kind !== "allow_support_exit") {
        throw new Error(`exitSupport reached with ${context.access.kind}`);
      }
      await exitSupport(context, context.access.moderatorId, context.cookieHeader);
      return {};
    }),
  },
});

export type RegistryRouter = typeof registryRouter;
