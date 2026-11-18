import type { EmailStatus, ShelterId } from "@opika/domain";
import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { authUser } from "../schema/auth";
import { shelters } from "../schema/shelters";

/**
 * How a shelter came to be, beside the domain `Shelter` rather than on it: only the kabinet's
 * banners, the publish gate and the operator's queue read it. `email` is the registrant's
 * `email_verified`; an erased registrant reads as unconfirmed.
 */
export type ShelterRegistrationFacts =
  | { source: "operator" }
  | { source: "self_registration"; appliedAt: Date; email: EmailStatus };

export function registrationFactsRepo(db: Database) {
  return {
    async of(shelterId: ShelterId): Promise<ShelterRegistrationFacts | null> {
      const [row] = await db
        .select({
          source: shelters.registrationSource,
          appliedAt: shelters.appliedAt,
          emailVerified: authUser.emailVerified,
        })
        .from(shelters)
        .leftJoin(authUser, eq(authUser.id, shelters.registrantUserId))
        .where(eq(shelters.id, shelterId))
        .limit(1);
      if (row === undefined) return null;
      // The CHECK `shelters_self_registration_facts` keeps the two in step.
      if (row.source === "operator" || row.appliedAt === null) return { source: "operator" };
      return {
        source: "self_registration",
        appliedAt: row.appliedAt,
        email: row.emailVerified === true ? "confirmed" : "unconfirmed",
      };
    },
  };
}
