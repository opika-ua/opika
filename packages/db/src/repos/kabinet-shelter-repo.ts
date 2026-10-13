import {
  type FreshnessSentence,
  historyEntryAt,
  type PendingDonation,
  type ShelterContact,
  type ShelterHistoryEntry,
  type ShelterId,
  type ShelterVerification,
} from "@opika/domain";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import { shelterHistory } from "../schema/shelter-history";
import { shelters } from "../schema/shelters";

/**
 * One audited change to a shelter, as a union rather than an arbitrary column
 * patch: each variant is exactly the columns its history entry describes, so
 * an audited write can't quietly change something its entry doesn't record.
 */
export type AuditedShelterChange =
  | { kind: "contact"; contact: ShelterContact }
  | { kind: "freshness_sentence"; freshnessSentence: FreshnessSentence }
  | { kind: "pending_donation"; pendingDonation: PendingDonation | null }
  | { kind: "verification"; verification: ShelterVerification };

export type AuditedWriteResult = { kind: "ok" } | { kind: "conflict" };

function columnsOf(change: AuditedShelterChange) {
  switch (change.kind) {
    case "contact":
      return { contact: change.contact };
    case "freshness_sentence":
      return {
        freshnessSentenceUk: change.freshnessSentence?.uk ?? null,
        freshnessSentenceEn: change.freshnessSentence?.en?.text ?? null,
      };
    case "pending_donation":
      return { pendingDonation: change.pendingDonation };
    case "verification":
      return {
        verification: change.verification,
        verificationStatus: change.verification.status,
      };
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = change;
      return unreachable;
    }
  }
}

/**
 * The kabinet's audited shelter writes (proposal §3).
 *
 * Every write is **one statement**: `WITH upd AS (UPDATE shelters … WHERE
 * version = $read RETURNING id) INSERT INTO shelter_history … SELECT … FROM
 * upd`. Production's neon-http driver has no transactions, `db.batch` is
 * atomic but not conditional (a lost race would still insert a history row
 * for a change that never happened), and it doesn't exist on postgres-js. One
 * statement is atomic *and* conditional on both drivers: zero rows updated
 * means zero rows of history, and the caller gets `conflict`.
 *
 * The guard is `version`, bumped by every write here, so the history entry's
 * `previous` is always the value the write actually replaced. The result is
 * read through Drizzle's own `returning()`, not raw `execute()`, whose shape
 * differs between the two drivers (standing constraints, R1).
 */
export function kabinetShelterRepo(db: Database) {
  return {
    async applyAudited(input: {
      shelterId: ShelterId;
      expectedVersion: number;
      change: AuditedShelterChange;
      entry: ShelterHistoryEntry;
      historyId: string;
      now: Date;
    }): Promise<AuditedWriteResult> {
      const upd = db.$with("upd").as(
        db
          .update(shelters)
          .set({
            ...columnsOf(input.change),
            version: sql`${shelters.version} + 1`,
            lastUpdatedAt: input.now,
          })
          .where(and(eq(shelters.id, input.shelterId), eq(shelters.version, input.expectedVersion)))
          .returning({ id: shelters.id }),
      );
      // Text then jsonb, never a bare ::jsonb: postgres.js would otherwise
      // JSON-encode the string a second time (see test/legacy-rows.ts).
      const entryJson = JSON.stringify(input.entry);
      const at = historyEntryAt(input.entry).toISOString();
      const inserted = await db
        .with(upd)
        .insert(shelterHistory)
        .select(
          sql`SELECT ${input.historyId}, "upd"."id", ${input.entry.kind}, ${at}::timestamptz, ${entryJson}::text::jsonb FROM "upd"`,
        )
        .returning({ id: shelterHistory.id });
      return inserted.length === 1 ? { kind: "ok" } : { kind: "conflict" };
    },

    /** The history, newest first, for tests now and `registry.history.list` later. */
    async historyOf(shelterId: ShelterId): Promise<ShelterHistoryEntry[]> {
      const rows = await db
        .select({ entry: shelterHistory.entry })
        .from(shelterHistory)
        .where(eq(shelterHistory.shelterId, shelterId))
        .orderBy(sql`${shelterHistory.at} DESC, ${shelterHistory.id} DESC`);
      return rows.map((row) => row.entry);
    },
  };
}
