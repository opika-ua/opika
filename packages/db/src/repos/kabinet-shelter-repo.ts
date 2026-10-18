import {
  type DonationLink,
  type ExactAddress,
  type FreshnessSentence,
  historyEntryAt,
  type LocalizedText,
  type PendingDonation,
  type PublicLocation,
  type Shelter,
  type ShelterContact,
  type ShelterHistoryEntry,
  type ShelterId,
  type ShelterLegalEntity,
  type ShelterVerification,
} from "@opika/domain";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import { animals } from "../schema/animals";
import { shelterHistory } from "../schema/shelter-history";
import { shelters } from "../schema/shelters";
import { historyRowSelect } from "./history-sql";
import { localizedTextToColumns, shelterToRow } from "./mappers";

/**
 * One audited change to a shelter, as a union rather than an arbitrary column
 * patch: each variant is exactly the columns its history entry describes, so
 * an audited write can't quietly change something its entry doesn't record.
 */
export type AuditedShelterChange =
  | { kind: "contact"; contact: ShelterContact }
  | { kind: "freshness_sentence"; freshnessSentence: FreshnessSentence }
  | { kind: "pending_donation"; pendingDonation: PendingDonation | null }
  | { kind: "verification"; verification: ShelterVerification }
  | { kind: "description"; description: LocalizedText }
  | { kind: "legal_entity"; legalEntity: ShelterLegalEntity }
  /**
   * The premises moved (S4). The public location is recomputed by the caller
   * with the location policy and travels with the address, never apart from
   * it, so the fuzzed pin can't describe an address the row no longer holds.
   */
  | { kind: "exact_address"; exactAddress: ExactAddress; publicLocation: PublicLocation }
  /** The operator approved the proposed link: it goes live and the proposal clears (N20). */
  | { kind: "donation_approved"; donation: DonationLink }
  /** The operator renamed the shelter (R-UI 4); recorded as `display_name_changed`. */
  | { kind: "display_name"; displayName: string };

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
    case "description": {
      const columns = localizedTextToColumns(change.description);
      return {
        descriptionUk: columns.uk,
        descriptionEnText: columns.enText,
        descriptionEnProvenance: columns.enProvenance,
      };
    }
    case "legal_entity":
      return { legalEntity: change.legalEntity };
    case "exact_address":
      return {
        exactAddress: change.exactAddress,
        publicLocation: change.publicLocation,
        cityId: change.publicLocation.cityId,
        exactLat: String(change.exactAddress.coordinates.lat),
        exactLng: String(change.exactAddress.coordinates.lng),
      };
    case "donation_approved":
      return { donation: change.donation, pendingDonation: null };
    case "display_name":
      return { displayName: change.displayName };
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
  const repo = {
    async applyAudited(input: {
      shelterId: ShelterId;
      expectedVersion: number;
      change: AuditedShelterChange;
      entry: ShelterHistoryEntry;
      historyId: string;
      now: Date;
    }): Promise<AuditedWriteResult> {
      return repo.applyAuditedMany({
        shelterId: input.shelterId,
        expectedVersion: input.expectedVersion,
        changes: [input.change],
        entries: [{ id: input.historyId, entry: input.entry }],
        now: input.now,
      });
    },

    /**
     * Several audited changes as one write: one version bump, one history
     * row per entry (an operator's profile edit that touches contact and
     * description is two facts, recorded as two lines). Still one statement,
     * so either every column and every entry lands or none does.
     *
     * An address change also moves every animal still at the shelter
     * (`public_location IS NULL`) to the new city, in the same statement:
     * their `city_id` mirrors the shelter's (CLAUDE.md, "`city_id` on
     * animals"), and a second statement could fail after the first. A
     * data-modifying CTE runs to completion whether or not the outer query
     * reads it. Fostered animals keep their own city.
     */
    async applyAuditedMany(input: {
      shelterId: ShelterId;
      expectedVersion: number;
      changes: readonly AuditedShelterChange[];
      entries: readonly { id: string; entry: ShelterHistoryEntry }[];
      now: Date;
    }): Promise<AuditedWriteResult> {
      if (input.entries.length === 0) throw new Error("An audited write needs at least one entry");
      const columns = Object.assign({}, ...input.changes.map(columnsOf));
      const upd = db.$with("upd").as(
        db
          .update(shelters)
          .set({
            ...columns,
            version: sql`${shelters.version} + 1`,
            lastUpdatedAt: input.now,
          })
          .where(and(eq(shelters.id, input.shelterId), eq(shelters.version, input.expectedVersion)))
          .returning({ id: shelters.id }),
      );
      const moved = input.changes.find((change) => change.kind === "exact_address");
      const withs =
        moved === undefined
          ? [upd]
          : [
              upd,
              db.$with("moved").as(
                db
                  .update(animals)
                  .set({ cityId: moved.publicLocation.cityId as never })
                  .where(
                    and(
                      sql`${animals.shelterId} IN (SELECT "id" FROM "upd")`,
                      isNull(animals.publicLocation),
                    ),
                  )
                  .returning({ id: animals.id }),
              ),
            ];
      // One SELECT per entry, each reading `upd`: no update, no history.
      const rows = sql.join(
        input.entries.map(
          (row) => sql`SELECT ${historyRowSelect(row, sql`"upd"."id"`)} FROM "upd"`,
        ),
        sql` UNION ALL `,
      );
      const inserted = await db
        .with(...withs)
        .insert(shelterHistory)
        .select(rows)
        .returning({ id: shelterHistory.id });
      return inserted.length === input.entries.length ? { kind: "ok" } : { kind: "conflict" };
    },

    /**
     * A new shelter and its `shelter_created` entry, as one statement: a
     * shelter never exists without the line saying who brought it in.
     */
    async createWithHistory(shelter: Shelter, history: { id: string; entry: ShelterHistoryEntry }) {
      const created = db
        .$with("created")
        .as(db.insert(shelters).values(shelterToRow(shelter)).returning({ id: shelters.id }));
      await db
        .with(created)
        .insert(shelterHistory)
        .select(sql`SELECT ${historyRowSelect(history, sql`"created"."id"`)} FROM "created"`);
    },

    /** A history line for something that changes no shelter column (an admin invited or reminded). */
    async appendHistory(input: { id: string; shelterId: ShelterId; entry: ShelterHistoryEntry }) {
      await db.insert(shelterHistory).values({
        id: input.id,
        shelterId: input.shelterId,
        kind: input.entry.kind,
        at: historyEntryAt(input.entry),
        entry: input.entry,
      });
    },

    /**
     * One page of a shelter's history, newest first, keyset on `(at DESC, id
     * DESC)` (never OFFSET). Reads only: RS-Q1 keeps the shelter's history
     * read side-effect-free.
     */
    async historyPage(input: {
      shelterId: ShelterId;
      after: { at: Date; id: string } | null;
      limit: number;
    }): Promise<{ items: ShelterHistoryEntry[]; next: { at: Date; id: string } | null }> {
      const conditions = [eq(shelterHistory.shelterId, input.shelterId)];
      if (input.after !== null) {
        const keyset = or(
          lt(shelterHistory.at, input.after.at),
          and(eq(shelterHistory.at, input.after.at), lt(shelterHistory.id, input.after.id)),
        );
        if (keyset) conditions.push(keyset);
      }
      const rows = await db
        .select({ id: shelterHistory.id, at: shelterHistory.at, entry: shelterHistory.entry })
        .from(shelterHistory)
        .where(and(...conditions))
        .orderBy(desc(shelterHistory.at), desc(shelterHistory.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      const last = page.at(-1);
      return {
        items: page.map((row) => row.entry),
        next: rows.length > input.limit && last ? { at: last.at, id: last.id } : null,
      };
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
  return repo;
}
