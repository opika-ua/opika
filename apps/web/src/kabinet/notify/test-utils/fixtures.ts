import { randomUUID } from "node:crypto";
import type { Database } from "@opika/db";
import { animalRepo, cityRepo, kabinetInvitationRepo, shelterRepo } from "@opika/db/repos";
import { authMember, authUser, superAdmins } from "@opika/db/schema";
import { makeAnimal, makeCity, makeShelter } from "@opika/db/test";
import type { AnimalListingState, Shelter, ShelterVerification } from "@opika/domain";
import { type OutgoingEmail, ProviderSendError } from "../../email-provider";
import type { ProviderMail } from "../../email-senders";
import type { NotifyDeps } from "../deliver";

/** Shared by the notify tests only: a fake provider and the rows a mail's recipients come from. */

export const NOW = new Date("2026-11-10T06:00:00.000Z");
export const DAY = 24 * 60 * 60 * 1000;

export function fakeMail() {
  const sent: OutgoingEmail[] = [];
  const state: {
    failing: boolean;
    /** The HTTP status a failing send reports; null is "no answer" (a timeout). */
    status: number | null;
    onSend: (() => void) | null;
    /** How long a send takes, so two runs at once really interleave. */
    delayMs: number;
  } = { failing: false, status: 500, onSend: null, delayMs: 0 };
  const mail: ProviderMail = {
    sender: {
      async send(email) {
        state.onSend?.();
        if (state.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, state.delayMs));
        if (state.failing) throw new ProviderSendError("resend", state.status, "provider down");
        sent.push(email);
        return { status: 200, messageId: null };
      },
    },
    blockedStatus: async () => ({ kind: "not_blocked" }),
    refuseCopyPending: true,
  };
  return { mail, sent, state };
}

export function depsOf(
  db: Database,
  mail: ProviderMail,
  options: { now?: Date | (() => Date); eventCap?: number } = {},
): NotifyDeps & { sleeps: number[]; logs: string[] } {
  const sleeps: number[] = [];
  const logs: string[] = [];
  return {
    db,
    mail,
    context: { baseURL: "https://example.org", operatorName: "Олексій" },
    // A clock that never moves unless asked to, so every send after the first asks for the full spacing.
    now: () => (typeof options.now === "function" ? options.now() : (options.now ?? NOW)),
    eventCap: options.eventCap ?? 40,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    log: (line) => {
      logs.push(line);
    },
    sleeps,
    logs,
  };
}

export async function seedUser(db: Database, email: string): Promise<string> {
  const id = randomUUID();
  await db.insert(authUser).values({
    id,
    name: "Людина",
    email,
    emailVerified: true,
    image: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  return id;
}

export async function seedOperator(
  db: Database,
  email: string,
  options: { revoked?: boolean } = {},
): Promise<string> {
  const userId = await seedUser(db, email);
  await db.insert(superAdmins).values({
    id: randomUUID(),
    userId,
    grantedAt: NOW,
    revokedAt: options.revoked ? NOW : null,
  });
  return userId;
}

/** A shelter in a city of its own, with one member per address and an organization linking them. */
export async function seedShelter(
  db: Database,
  options: { admins?: string[]; overrides?: Partial<Shelter> } = {},
): Promise<{ shelter: Shelter; adminIds: string[] }> {
  const city = makeCity();
  await cityRepo(db).insert(city);
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id } as never,
    ...options.overrides,
  } as never);
  await shelterRepo(db).insert(shelter);
  const adminIds: string[] = [];
  const emails = options.admins ?? [];
  if (emails.length > 0) {
    // The way production links one: the first invite creates the organization.
    const organizationId = await kabinetInvitationRepo(db).ensureOrganization(
      shelter.id,
      { organizationId: randomUUID() },
      NOW,
    );
    for (const email of emails) {
      const userId = await seedUser(db, email);
      adminIds.push(userId);
      await db.insert(authMember).values({
        id: randomUUID(),
        organizationId,
        userId,
        role: "admin",
        createdAt: NOW,
      });
    }
  }
  return { shelter, adminIds };
}

const evidence = { items: [], submittedAt: NOW };

export const PENDING: ShelterVerification = { status: "pending", submittedAt: NOW, evidence };
export const VERIFIED = {
  status: "verified",
  verifiedAt: NOW,
  verifiedBy: "0ec0ec0e-0000-4000-8000-000000000001",
  evidence,
} as unknown as ShelterVerification;

/** One card of a shelter, in the listing state given; its last confirmation is `confirmedAt`. */
export async function seedCard(
  db: Database,
  shelter: Shelter,
  listing:
    | { kind: "published" | "reserved"; confirmedAt: Date }
    | { kind: "draft" | "adopted" | "withdrawn" },
): Promise<void> {
  const state: AnimalListingState =
    listing.kind === "published"
      ? {
          kind: "published",
          publishedAt: listing.confirmedAt,
          confirmedAt: listing.confirmedAt,
          undoable: null,
        }
      : listing.kind === "reserved"
        ? {
            kind: "reserved",
            since: listing.confirmedAt,
            publishedAt: listing.confirmedAt,
            confirmedAt: listing.confirmedAt,
            undoable: null,
          }
        : listing.kind === "adopted"
          ? { kind: "adopted", adoptedAt: NOW }
          : listing.kind === "withdrawn"
            ? { kind: "withdrawn", withdrawnAt: NOW, reason: { code: "other", note: null } }
            : { kind: "draft" };
  const animal = makeAnimal({ shelterId: shelter.id, listing: state } as never);
  await animalRepo(db).insert(animal, shelter.publicLocation.cityId as never);
}
