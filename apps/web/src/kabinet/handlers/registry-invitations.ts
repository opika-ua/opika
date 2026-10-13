import type { apiErrors, RegistryShelterView, ShelterAdminView } from "@opika/contracts";
import {
  cityRepo,
  kabinetInvitationRepo,
  kabinetInvitedUsersRepo,
  kabinetRegistryRepo,
  kabinetShelterRepo,
  shelterRepo,
} from "@opika/db/repos";
import {
  type CityId,
  type EvidenceItemInput,
  type ExactAddress,
  type FreshnessSentence,
  type LocalizedText,
  type LocationPrivacyPolicy,
  type ModeratorId,
  publicLocationOf,
  type Shelter,
  type ShelterAdminId,
  type ShelterContact,
  type ShelterId,
  type ShelterLegalEntity,
} from "@opika/domain";
import { ORPCError, type ORPCErrorConstructorMap } from "@orpc/server";
import { loadShelterOr404, type RegistryDeps, registryShelterView } from "./registry-reads";
import { acceptEvidence } from "./registry-writes";

/**
 * **The one module that calls the invitation writer** (RG-Q9, Oleksii):
 * `registry.shelters.create` (its first admin) and `registry.admins.*`.
 * `no-self-serve-yet.test.ts` allowlists exactly this path, and only while
 * production sign-in answers 503 and accept-invitation isn't forwarded:
 * moving or splitting this file fails that test, and so does either
 * condition flipping, because that is the day a shelter can sign in and the
 * /prytulkam copy (A1–A3, B1) has to be live.
 *
 * Nothing here sends an email. The invitation exists in the database; how
 * the invitee hears of it arrives with the provider in the invite PR.
 */

type E<K extends keyof typeof apiErrors> = ORPCErrorConstructorMap<Pick<typeof apiErrors, K>>;

/** S4's admins list goes stale lazily (RS-Q1): every admins.* call clears the dead invited users of its shelter first. */
async function cleanUpInvitedUsers(deps: RegistryDeps, organizationId: string): Promise<void> {
  const users = kabinetInvitedUsersRepo(deps.db);
  const candidates = await users.cleanupCandidates({ organizationId, now: deps.now });
  if (candidates.length > 0) {
    await users.deleteCandidates(
      candidates.map((candidate) => candidate.userId),
      deps.now,
    );
  }
}

const organizationOf = (deps: RegistryDeps, shelterId: ShelterId): Promise<string | null> =>
  kabinetRegistryRepo(deps.db).organizationIdOf(shelterId);

async function invite(
  deps: RegistryDeps,
  moderatorId: ModeratorId,
  input: { shelterId: ShelterId; name: string; email: string },
): Promise<{ kind: "invited"; view: ShelterAdminView } | { kind: "already_a_member" }> {
  const result = await kabinetInvitationRepo(deps.db).invite({
    shelterId: input.shelterId,
    email: input.email,
    name: input.name,
    inviterUserId: moderatorId,
    ids: { invitationId: deps.newId(), userId: deps.newId(), organizationId: deps.newId() },
    now: deps.now,
    // Written in the invitation's own statement: no invitation without its line.
    history: {
      id: deps.newId(),
      entry: {
        kind: "admin_invited",
        at: deps.now,
        moderatorId,
        email: input.email.trim().toLowerCase(),
      },
    },
  });
  if (result.kind === "already_a_member") return result;
  const admins = await kabinetRegistryRepo(deps.db).adminsOf(input.shelterId);
  const row = admins.find((admin) => admin.userId === result.userId);
  if (row === undefined) throw new Error(`Invited user ${result.userId} missing from admins`);
  return {
    kind: "invited",
    view: {
      id: row.userId as ShelterAdminId,
      name: row.name,
      email: row.email,
      invite: row.invite,
    },
  };
}

// ─── shelters.create ────────────────────────────────────────────────────────

/**
 * S2: the shelter, its evidence and its first admin's invitation. Starts
 * `pending`, ready for S3's review; creating never decides verification.
 *
 * Not one transaction (neon-http has none): the shelter and its
 * `shelter_created` line are one statement, the invitation follows. The
 * address is checked against existing memberships first, so the only way to
 * end with a shelter and no invitation is a race on that same address or a
 * crash in between; the shelter is then simply admin-less, and S4's invite
 * finishes the job.
 */
export async function registrySheltersCreate(
  deps: RegistryDeps,
  moderatorId: ModeratorId,
  policy: LocationPrivacyPolicy,
  input: {
    displayName: string;
    description: LocalizedText;
    legalEntity: ShelterLegalEntity;
    exactAddress: ExactAddress;
    contact: ShelterContact;
    freshnessSentence: FreshnessSentence;
    evidence: readonly EvidenceItemInput[];
    firstAdmin: { name: string; email: string };
  },
  errors: E<"INVALID_EVIDENCE" | "ALREADY_A_MEMBER">,
): Promise<RegistryShelterView> {
  const accepted = acceptEvidence(input.evidence, { moderatorId, now: deps.now });
  if (accepted.kind === "refused") {
    throw errors.INVALID_EVIDENCE({ data: { reason: accepted.reason } });
  }
  if ((await cityRepo(deps.db).findById(input.exactAddress.cityId as CityId)) === null) {
    // A client fault (the form offers known cities only), not one of the
    // contract's typed refusals; answered as a bad request, never a 500.
    throw new ORPCError("BAD_REQUEST", { status: 400, message: "Unknown city" });
  }
  if (await kabinetRegistryRepo(deps.db).isMember(input.firstAdmin.email)) {
    throw errors.ALREADY_A_MEMBER();
  }

  const id = deps.newId() as ShelterId;
  const shelter: Shelter = {
    id,
    displayName: input.displayName,
    description: input.description,
    legalEntity: input.legalEntity,
    publicLocation: publicLocationOf(id, input.exactAddress, policy),
    exactAddress: input.exactAddress,
    contact: input.contact,
    donation: null,
    pendingDonation: null,
    version: 0,
    freshnessSentence: input.freshnessSentence,
    verification: { status: "pending", submittedAt: deps.now, evidence: accepted.evidence },
    createdAt: deps.now,
    lastUpdatedAt: deps.now,
  };
  await kabinetShelterRepo(deps.db).createWithHistory(shelter, {
    id: deps.newId(),
    entry: { kind: "shelter_created", at: deps.now, moderatorId, via: "registry" },
  });
  await invite(deps, moderatorId, { shelterId: id, ...input.firstAdmin });
  // Lost the race on the first admin's address after the check above: the
  // shelter exists now, so answering ALREADY_A_MEMBER would invite a retry
  // that creates a second one (review, finding 3). The view it returns shows
  // no admin, which is the truth, and S4's invite completes it.
  const created = await shelterRepo(deps.db).findById(id);
  if (created === null) throw new Error(`Shelter ${id} vanished right after creation`);
  return registryShelterView(deps, created);
}

// ─── admins ─────────────────────────────────────────────────────────────────

export async function registryAdminsInvite(
  deps: RegistryDeps,
  moderatorId: ModeratorId,
  input: { shelterId: ShelterId; name: string; email: string },
  errors: E<"ALREADY_A_MEMBER" | "NOT_FOUND">,
): Promise<ShelterAdminView> {
  await loadShelterOr404(deps, input.shelterId, errors);
  const organizationId = await organizationOf(deps, input.shelterId);
  if (organizationId !== null) await cleanUpInvitedUsers(deps, organizationId);
  const invited = await invite(deps, moderatorId, input);
  if (invited.kind === "already_a_member") throw errors.ALREADY_A_MEMBER();
  return invited.view;
}

/** Who `adminId` is on this shelter: a member, a pending invitation, or nobody here. */
async function adminOn(deps: RegistryDeps, shelterId: ShelterId, adminId: ShelterAdminId) {
  const admins = await kabinetRegistryRepo(deps.db).adminsOf(shelterId);
  return admins.find((admin) => admin.userId === adminId) ?? null;
}

/** A pending admin's link, valid again for the full 72 hours. A member has nothing to resend: NOT_FOUND. */
export async function registryAdminsResendInvite(
  deps: RegistryDeps,
  moderatorId: ModeratorId,
  input: { shelterId: ShelterId; adminId: ShelterAdminId },
  errors: E<"NOT_FOUND">,
): Promise<Record<string, never>> {
  await loadShelterOr404(deps, input.shelterId, errors);
  const organizationId = await organizationOf(deps, input.shelterId);
  if (organizationId === null) throw errors.NOT_FOUND();
  await cleanUpInvitedUsers(deps, organizationId);
  const admin = await adminOn(deps, input.shelterId, input.adminId);
  if (admin === null || admin.invite.status !== "pending") throw errors.NOT_FOUND();
  const invitations = kabinetInvitationRepo(deps.db);
  const latest = await invitations.latestPending(organizationId, admin.email);
  const resent =
    latest === null
      ? null
      : await invitations.resend(latest.id, deps.now, {
          id: deps.newId(),
          shelterId: input.shelterId,
          entry: { kind: "admin_invitation_resent", at: deps.now, moderatorId, email: admin.email },
        });
  if (resent === null) throw errors.NOT_FOUND();
  return {};
}

/**
 * RG-Q6: a member loses the membership and every session at once; a pending
 * admin's invitations are withdrawn. Removing the last admin is allowed.
 * Either way it is recorded. The clean-up then removes an invited user this
 * left dead, the same as on any other admins.* call.
 */
export async function registryAdminsRemove(
  deps: RegistryDeps,
  moderatorId: ModeratorId,
  input: { shelterId: ShelterId; adminId: ShelterAdminId },
  errors: E<"NOT_FOUND">,
): Promise<Record<string, never>> {
  await loadShelterOr404(deps, input.shelterId, errors);
  const organizationId = await organizationOf(deps, input.shelterId);
  if (organizationId === null) throw errors.NOT_FOUND();
  const admin = await adminOn(deps, input.shelterId, input.adminId);
  if (admin === null) throw errors.NOT_FOUND();
  const invitations = kabinetInvitationRepo(deps.db);
  const history = (wasPending: boolean) => ({
    id: deps.newId(),
    shelterId: input.shelterId,
    entry: {
      kind: "admin_removed" as const,
      at: deps.now,
      moderatorId,
      email: admin.email,
      wasPending,
    },
  });
  const removed =
    admin.invite.status === "accepted"
      ? await invitations.removeMember({
          organizationId,
          userId: admin.userId,
          history: history(false),
        })
      : await invitations.withdrawPending({
          organizationId,
          email: admin.email,
          history: history(true),
        });
  // Lost a race with an accept or another removal: nothing of what the
  // operator saw is left to remove.
  if (!removed) throw errors.NOT_FOUND();
  await cleanUpInvitedUsers(deps, organizationId);
  return {};
}
