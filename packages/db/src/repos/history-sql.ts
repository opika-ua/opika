import { historyEntryAt, type ShelterHistoryEntry } from "@opika/domain";
import { type SQL, sql } from "drizzle-orm";

/**
 * One `shelter_history` row as a SELECT list, in the table's column order
 * (id, shelter_id, kind, at, entry), for `INSERT … SELECT` statements that
 * write a change and its history line together. The one place this SQL
 * lives, so a fix to it (the jsonb encoding below) can't land in one copy and
 * miss another.
 *
 * `shelterId` is a SQL expression, because the id often comes from the
 * statement's own CTE (`"upd"."id"`), which is what makes the history row
 * conditional on the change having happened.
 *
 * Text then jsonb, never a bare `::jsonb`: postgres.js would otherwise
 * JSON-encode the string a second time (see test/legacy-rows.ts).
 */
export const historyRowSelect = (
  row: { id: string; entry: ShelterHistoryEntry },
  shelterId: SQL,
): SQL =>
  sql`${row.id}, ${shelterId}, ${row.entry.kind}, ${historyEntryAt(row.entry).toISOString()}::timestamptz, ${JSON.stringify(row.entry)}::text::jsonb`;
