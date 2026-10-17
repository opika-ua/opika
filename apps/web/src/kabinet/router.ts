import {
  apiErrors,
  type KabinetAccess,
  type KabinetCursor,
  shelterKabinetContract,
} from "@opika/contracts";
import { implement, ORPCError } from "@orpc/server";
import {
  decodeKabinetAnimalsCursor,
  decodeKabinetHistoryCursor,
  encodeKabinetAnimalsCursor,
  encodeKabinetHistoryCursor,
  kabinetAnimalsFingerprint,
} from "../api/cursor";
import {
  type AccessDecision,
  assertShelterWritePolicyPermitted,
  decideAccess,
  type ShelterReadScope,
  type ShelterWriteScope,
} from "./access";
import type { KabinetContext } from "./context";
import {
  animalsById,
  animalsConfirm,
  animalsCreateDraft,
  animalsDeleteDraft,
  animalsList,
  animalsTransition,
  animalsUndoConfirm,
  animalsUpdate,
} from "./handlers/animals";
import { historyList } from "./handlers/history";
import { photosAdd, photosRemove, photosReorder } from "./handlers/photos";
import {
  profileCancelDonationProposal,
  profileGet,
  profilePause,
  profileProposeDonation,
  profileResume,
  profileUpdateContact,
  profileUpdateFreshnessSentence,
  verificationRequestReview,
} from "./handlers/profile";

const base = implement(shelterKabinetContract).$context<KabinetContext>();

/**
 * The access matrix, applied once for every procedure: it reads the access
 * the contract declares on the procedure (deny-by-default, a procedure with
 * none is refused) and asks `decideAccess`. A handler never decides who may
 * call it; it receives the scope this hands it, with the `shelterId` taken
 * from the actor, never from input.
 *
 * Before anything else, the test-only write policy is refused on a deployed
 * instance (KH-T1): read from `process.env` here, at the one place every
 * kabinet procedure on both routers passes, rather than taken from the
 * caller, so a mistaken production path fails closed (500) on every
 * procedure, reads included, instead of opening writes.
 */
export function accessOrThrow(
  procedure: { "~orpc": { meta: unknown } },
  context: Pick<KabinetContext, "principal" | "shelterWrites">,
): Exclude<AccessDecision, { kind: "deny" }> {
  assertShelterWritePolicyPermitted(context.shelterWrites, {
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
  });
  const meta = procedure["~orpc"].meta as { access?: KabinetAccess | null };
  const decision = decideAccess(meta.access ?? null, context.principal, context.shelterWrites);
  if (decision.kind === "deny") {
    throw new ORPCError(decision.code, {
      status: apiErrors[decision.code].status,
      message: apiErrors[decision.code].message,
    });
  }
  return decision;
}

const guarded = base.use(async ({ context, procedure, next }) =>
  next({ context: { access: accessOrThrow(procedure, context) } }),
);

/**
 * The scope a handler declared it needs. The contract's access meta and the
 * handler's mode are written in two places, so a mismatch (a write handler
 * on a procedure declared `read`) fails loudly here instead of letting a
 * support view reach a write.
 */
function readScope(access: AccessDecision): ShelterReadScope {
  if (access.kind === "allow_shelter_read" || access.kind === "allow_shelter_write") {
    return access.scope;
  }
  throw new Error(`Shelter handler reached with ${access.kind}`);
}

function writeScope(access: AccessDecision): ShelterWriteScope {
  if (access.kind === "allow_shelter_write") return access.scope;
  throw new Error(`Write handler reached with ${access.kind}`);
}

export const shelterKabinetRouter = guarded.router({
  shelter: {
    profile: {
      get: guarded.shelter.profile.get.handler(({ context }) =>
        profileGet(context, readScope(context.access)),
      ),
      updateContact: guarded.shelter.profile.updateContact.handler(({ context, input, errors }) =>
        profileUpdateContact(context, writeScope(context.access), input, errors),
      ),
      updateFreshnessSentence: guarded.shelter.profile.updateFreshnessSentence.handler(
        ({ context, input, errors }) =>
          profileUpdateFreshnessSentence(context, writeScope(context.access), input, errors),
      ),
      proposeDonation: guarded.shelter.profile.proposeDonation.handler(({ context, input }) =>
        profileProposeDonation(context, writeScope(context.access), input),
      ),
      cancelDonationProposal: guarded.shelter.profile.cancelDonationProposal.handler(
        ({ context }) => profileCancelDonationProposal(context, writeScope(context.access)),
      ),
      pause: guarded.shelter.profile.pause.handler(({ context, input, errors }) =>
        profilePause(context, writeScope(context.access), input, errors),
      ),
      resume: guarded.shelter.profile.resume.handler(({ context, errors }) =>
        profileResume(context, writeScope(context.access), errors),
      ),
    },
    verification: {
      requestReview: guarded.shelter.verification.requestReview.handler(({ context, errors }) =>
        verificationRequestReview(context, writeScope(context.access), errors),
      ),
    },
    history: {
      list: guarded.shelter.history.list.handler(({ context, input, errors }) => {
        const scope = readScope(context.access);
        let after: { at: Date; id: string } | null = null;
        if (input.cursor !== null) {
          const decoded = decodeKabinetHistoryCursor(
            input.cursor,
            scope.shelterId,
            context.cursorSecret,
          );
          if (decoded === null) throw errors.INVALID_CURSOR();
          after = decoded.data;
        }
        return historyList(
          context,
          scope,
          { after, limit: input.limit },
          (position) =>
            encodeKabinetHistoryCursor(
              position,
              scope.shelterId,
              context.cursorSecret,
            ) as KabinetCursor,
        );
      }),
    },
    animals: {
      list: guarded.shelter.animals.list.handler(({ context, input, errors }) => {
        const scope = readScope(context.access);
        const fingerprint = kabinetAnimalsFingerprint(scope.shelterId, input.listing);
        let after: { at: Date; id: string } | null = null;
        if (input.cursor !== null) {
          const decoded = decodeKabinetAnimalsCursor(
            input.cursor,
            fingerprint,
            context.cursorSecret,
          );
          if (decoded === null) throw errors.INVALID_CURSOR();
          after = decoded.data;
        }
        return animalsList(
          context,
          scope,
          { listing: input.listing, after, limit: input.limit },
          (position) =>
            encodeKabinetAnimalsCursor(
              position,
              fingerprint,
              context.cursorSecret,
            ) as KabinetCursor,
        );
      }),
      byId: guarded.shelter.animals.byId.handler(({ context, input, errors }) =>
        animalsById(context, readScope(context.access), input, errors),
      ),
      createDraft: guarded.shelter.animals.createDraft.handler(({ context, input }) =>
        animalsCreateDraft(context, writeScope(context.access), input),
      ),
      update: guarded.shelter.animals.update.handler(({ context, input, errors }) =>
        animalsUpdate(context, writeScope(context.access), input, errors),
      ),
      transition: guarded.shelter.animals.transition.handler(({ context, input, errors }) =>
        animalsTransition(context, writeScope(context.access), input, errors),
      ),
      confirm: guarded.shelter.animals.confirm.handler(({ context, input, errors }) =>
        animalsConfirm(context, writeScope(context.access), input, errors),
      ),
      undoConfirm: guarded.shelter.animals.undoConfirm.handler(({ context, input, errors }) =>
        animalsUndoConfirm(context, writeScope(context.access), input, errors),
      ),
      deleteDraft: guarded.shelter.animals.deleteDraft.handler(({ context, input, errors }) =>
        animalsDeleteDraft(context, writeScope(context.access), input, errors),
      ),
    },
    photos: {
      add: guarded.shelter.photos.add.handler(({ context, input, errors }) =>
        photosAdd(context, writeScope(context.access), input, errors),
      ),
      reorder: guarded.shelter.photos.reorder.handler(({ context, input, errors }) =>
        photosReorder(context, writeScope(context.access), input, errors),
      ),
      remove: guarded.shelter.photos.remove.handler(({ context, input, errors }) =>
        photosRemove(context, writeScope(context.access), input, errors),
      ),
    },
  },
});

export type ShelterKabinetRouter = typeof shelterKabinetRouter;
