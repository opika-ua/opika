import { randomUUID } from "node:crypto";
import type { Database } from "@opika/db";
import { cityRepo, kabinetInvitationRepo, shelterRepo } from "@opika/db/repos";
import { authMember, authUser, superAdmins } from "@opika/db/schema";
import { makeCity, makeShelter } from "@opika/db/test";
import type { Shelter, ShelterVerification } from "@opika/domain";
import type { OutgoingEmail } from "../email-provider";
import type { ProviderMail } from "../email-senders";
import type { NotifyDeps } from "./deliver";

/** Shared by the notify tests only: a fake provider and the rows a mail's recipients come from. */

export const NOW = new Date("2026-11-10T06:00:00.000Z");
export const DAY = 24 * 60 * 60 * 1000;

export function fakeMail() {
  const sent: OutgoingEmail[] = [];
  const state = { failing: false };
  const mail: ProviderMail = {
    sender: {
      async send(email) {
        if (state.failing) throw new Error("provider down");
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
  options: { now?: Date } = {},
): NotifyDeps & { sleeps: number[]; logs: string[] } {
  const sleeps: number[] = [];
  const logs: string[] = [];
  return {
    db,
    mail,
    context: { baseURL: "https://example.org", operatorName: "Олексій" },
    // A clock that never moves, so every send after the first has to ask for the full spacing.
    now: () => options.now ?? NOW,
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
