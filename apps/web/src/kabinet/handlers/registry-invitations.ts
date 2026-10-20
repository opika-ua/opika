import {
  type apiErrors,
  type CreatedShelterView,
  type EmailSendOutcome,
  type InvitationReminder,
  type InvitedAdminView,
  type ShelterAdminView,
  UNKNOWN_CITY_MESSAGE,
} from "@opika/contracts";
import {
  type AddressRole,
  cityRepo,
  INVITATION_TTL_MS,
  kabinetInvitationRepo,
  kabinetInvitedUsersRepo,
  kabinetInviteTokenRepo,
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
import { INVITE_LINK, linkTo } from "../email-links";
import type { InviteShelterVerification } from "../email-senders";
import { invitationReminderOf } from "../invitation-reminder";
import { newInviteToken } from "../invite-password";
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
 * Each write that makes an invitation live (create's first admin, invite,
 * resend) emails the invitee a link to «Створіть пароль» (IN-Q3; PW-2, a new
 * hashed token each time), after the write and never deciding it, and returns what became of the email so the
 * operator sees it directly (IN-E7, Oleksii, 2026-10-14). A failed or blocked
 * email leaves the invitation in place; a resend retries the email. A sent
 * one comes back with the reminder to tell the shelter personally (IN-E13).
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

/**
 * The invite's second sentence follows the shelter's verification status at send time (Q-C):
 * a verified shelter's changes appear at once. Paused is a status of its own in the domain, not
 * "verified" with a flag, but a paused shelter has passed verification, so it gets the verified
 * sentence (his decision, PC-T10: "paused → the verified sentence; suspended/rejected → the
 * before-verification sentence"). Pending and under review have not passed it yet.
 */
const inviteVerificationOf = (shelter: Pick<Shelter, "verification">): InviteShelterVerification =>
  shelter.verification.status === "verified" || shelter.verification.status === "paused"
    ? "verified"
    : "not_yet_verified";

/**
 * The invite email for one live invitation, with a new link (PW-2): a fresh random token, stored
 * hashed, good until the invitation's own expiry, replacing any earlier link of this invitation
 * (`kabinetInviteTokenRepo.issue`), so only the newest email's link works. The invitation id is
 * not the link's secret any more. Storing the link can throw (the database); the send never does:
 * a sender that does is `provider_error`. Either way the invitation stays, and a resend retries
 * both.
 */
async function emailInvitation(
  deps: RegistryDeps,
  input: {
    email: string;
    shelterName: string;
    shelterVerification: InviteShelterVerification;
    invitationId: string;
    expiresAt: Date;
  },
): Promise<EmailSendOutcome> {
  const token = newInviteToken();
  await kabinetInviteTokenRepo(deps.db).issue({
    id: deps.newId(),
    invitationId: input.invitationId,
    token,
    expiresAt: input.expiresAt,
    now: deps.now,
  });
  try {
    return await deps.invites.send({
      email: input.email,
      shelterName: input.shelterName,
      shelterVerification: input.shelterVerification,
      operatorName: deps.operatorDisplayName,
      url: linkTo(deps.linkBaseURL, INVITE_LINK, token),
      validForHours: Math.round(INVITATION_TTL_MS / 3_600_000),
    });
  } catch {
    return { kind: "failed", reason: "provider_error" };
  }
}

async function invite(
  deps: RegistryDeps,
  moderatorId: ModeratorId,
  input: {
    shelterId: ShelterId;
    shelterName: string;
    shelterVerification: InviteShelterVerification;
    name: string;
    email: string;
  },
): Promise<
  | { kind: "invited"; view: ShelterAdminView; email: EmailSendOutcome }
  | { kind: "address_has_a_role"; reason: AddressRole }
> {
  const invitationId = deps.newId();
  const result = await kabinetInvitationRepo(deps.db).invite({
    shelterId: input.shelterId,
    email: input.email,
    name: input.name,
    inviterUserId: moderatorId,
    ids: { invitationId, userId: deps.newId(), organizationId: deps.newId() },
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
  if (result.kind === "address_has_a_role") return result;
  const admins = await kabinetRegistryRepo(deps.db).adminsOf(input.shelterId);
  const row = admins.find((admin) => admin.userId === result.userId);
  if (row === undefined) throw new Error(`Invited user ${result.userId} missing from admins`);
  const email = await emailInvitation(deps, {
    email: row.email,
    shelterName: input.shelterName,
    shelterVerification: input.shelterVerification,
    invitationId,
    expiresAt: result.expiresAt,
  });
  return {
    kind: "invited",
    email,
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
  errors: E<"INVALID_EVIDENCE" | "ADDRESS_HAS_A_ROLE">,
): Promise<CreatedShelterView> {
  const accepted = acceptEvidence(input.evidence, { moderatorId, now: deps.now });
  if (accepted.kind === "refused") {
    throw errors.INVALID_EVIDENCE({ data: { reason: accepted.reason } });
  }
  if ((await cityRepo(deps.db).findById(input.exactAddress.cityId as CityId)) === null) {
    // A client fault (the form offers known cities only), not one of the
    // contract's typed refusals; answered as a bad request, never a 500.
    throw new ORPCError("BAD_REQUEST", { status: 400, message: UNKNOWN_CITY_MESSAGE });
  }
  // Checked before anything is created (RG-T10): a shelter, an operator
  // grant, or a live invitation elsewhere all refuse the first admin, with
  // the reason, so S2 can say which. The shelter doesn't exist yet, so any
  // live invitation counts as elsewhere.
  const role = await kabinetInvitationRepo(deps.db).roleOfAddress({
    email: input.firstAdmin.email,
    shelterId: null,
    now: deps.now,
  });
  if (role !== null) throw errors.ADDRESS_HAS_A_ROLE({ data: { reason: role } });

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
  const invited = await invite(deps, moderatorId, {
    shelterId: id,
    shelterName: input.displayName,
    // Created `pending` just above, so the first invite is always the before-verification one.
    shelterVerification: inviteVerificationOf(shelter),
    ...input.firstAdmin,
  });
  // Lost the race on the first admin's address after the check above: the
  // shelter exists now, so answering ADDRESS_HAS_A_ROLE would invite a retry
  // that creates a second one (review, finding 3). The view it returns shows
  // no admin, which is the truth, and S4's invite completes it.
  const created = await shelterRepo(deps.db).findById(id);
  if (created === null) throw new Error(`Shelter ${id} vanished right after creation`);
  return {
    ...(await registryShelterView(deps, created)),
    firstAdminInvitationEmail: invited.kind === "invited" ? invited.email : null,
    firstAdminInvitationReminder:
      invited.kind === "invited"
        ? invitationReminderOf(invited.email, deps.invites.fromAddress)
        : null,
  };
}

// ─── admins ─────────────────────────────────────────────────────────────────

export async function registryAdminsInvite(
  deps: RegistryDeps,
  moderatorId: ModeratorId,
  input: { shelterId: ShelterId; name: string; email: string },
  errors: E<"ADDRESS_HAS_A_ROLE" | "NOT_FOUND">,
): Promise<InvitedAdminView> {
  const shelter = await loadShelterOr404(deps, input.shelterId, errors);
  const organizationId = await organizationOf(deps, input.shelterId);
  if (organizationId !== null) await cleanUpInvitedUsers(deps, organizationId);
  const invited = await invite(deps, moderatorId, {
    ...input,
    shelterName: shelter.displayName,
    shelterVerification: inviteVerificationOf(shelter),
  });
  if (invited.kind === "address_has_a_role") {
    throw errors.ADDRESS_HAS_A_ROLE({ data: { reason: invited.reason } });
  }
  return {
    ...invited.view,
    invitationEmail: invited.email,
    invitationReminder: invitationReminderOf(invited.email, deps.invites.fromAddress),
  };
}

/** Who `adminId` is on this shelter: a member, a pending invitation, or nobody here. */
async function adminOn(deps: RegistryDeps, shelterId: ShelterId, adminId: ShelterAdminId) {
  const admins = await kabinetRegistryRepo(deps.db).adminsOf(shelterId);
  return admins.find((admin) => admin.userId === adminId) ?? null;
}

/**
 * A pending admin's link, valid again for the full 72 hours, emailed again.
 * A member has nothing to resend: NOT_FOUND.
 */
export async function registryAdminsResendInvite(
  deps: RegistryDeps,
  moderatorId: ModeratorId,
  input: { shelterId: ShelterId; adminId: ShelterAdminId },
  errors: E<"NOT_FOUND" | "ADDRESS_HAS_A_ROLE">,
): Promise<{ invitationEmail: EmailSendOutcome; invitationReminder: InvitationReminder }> {
  const shelter = await loadShelterOr404(deps, input.shelterId, errors);
  const organizationId = await organizationOf(deps, input.shelterId);
  if (organizationId === null) throw errors.NOT_FOUND();
  await cleanUpInvitedUsers(deps, organizationId);
  const admin = await adminOn(deps, input.shelterId, input.adminId);
  if (admin === null || admin.invite.status !== "pending") throw errors.NOT_FOUND();
  const invitations = kabinetInvitationRepo(deps.db);
  const latest = await invitations.latestPending(organizationId, admin.email);
  if (latest === null) throw errors.NOT_FOUND();
  const resent = await invitations.resend(latest.id, deps.now, {
    id: deps.newId(),
    shelterId: input.shelterId,
    entry: { kind: "admin_invitation_resent", at: deps.now, moderatorId, email: admin.email },
  });
  // The role check lives in the repo's resend, at the write (every path
  // that makes an invitation live again checks it, Oleksii 2026-10-13).
  if (resent.kind === "not_pending") throw errors.NOT_FOUND();
  if (resent.kind === "address_has_a_role") {
    throw errors.ADDRESS_HAS_A_ROLE({ data: { reason: resent.reason } });
  }
  const invitationEmail = await emailInvitation(deps, {
    email: admin.email,
    shelterName: shelter.displayName,
    shelterVerification: inviteVerificationOf(shelter),
    invitationId: latest.id,
    expiresAt: resent.expiresAt,
  });
  return {
    invitationEmail,
    invitationReminder: invitationReminderOf(invitationEmail, deps.invites.fromAddress),
  };
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
