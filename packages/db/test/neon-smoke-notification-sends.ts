import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../src/client";
import { executeRows } from "../src/raw-rows";
import { notificationSendsRepo } from "../src/repos/notification-sends-repo";
import { authUser } from "../src/schema/auth";
import { notificationSends } from "../src/schema/notification-sends";
import { outcomeOf } from "./neon-smoke-verified-data";

type Outcome = { name: string; ok: boolean; detail: string };

const DAY = 86_400_000;

/**
 * Migration 0025 on Neon's driver: the claim, reclaim, mark and purge statements, the user-delete
 * SET NULL, and the catalog (FKs, CHECK, index, the new shelters column). Fixture rows are
 * deleted at the end, so the table is back to 0 rows; run it on a fresh child branch, where it
 * starts at 0 (the purge check counts on that).
 */
export async function runNotificationSendsSmoke(db: Database): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });
  const repo = notificationSendsRepo(db);
  const now = new Date();
  const tag = randomUUID();
  const key = (label: string) => `smoke:${tag}:${label}`;
  const base = { kind: "smoke", shelterId: null, recipientUserId: null };
  const rowOf = async (dedupKey: string) =>
    (await db.select().from(notificationSends).where(eq(notificationSends.dedupKey, dedupKey)))[0];
  const userId = randomUUID();
  const keys = ["fresh", "retry", "sent", "old", "recent", "owned"].map(key);

  try {
    const first = await repo.claim(now, { ...base, dedupKey: key("fresh") });
    const second = await repo.claim(now, { ...base, dedupKey: key("fresh") });
    check(
      "0025: claiming a fresh key returns 1 row, claiming it again returns 0",
      first && !second && (await rowOf(key("fresh")))?.status === "claimed",
      `first ${first}, second ${second}`,
    );

    await repo.claim(now, { ...base, dedupKey: key("retry") });
    const failed = await repo.mark(now, key("retry"), "failed");
    const reclaimed = await repo.reclaim(now, key("retry"));
    const afterReclaim = await rowOf(key("retry"));
    await repo.mark(now, key("retry"), "failed");
    const capped = await repo.reclaim(now, key("retry"));
    check(
      "0025: mark failed, reclaim returns true once (attempts 2, claimed), and false at the cap",
      failed &&
        reclaimed &&
        afterReclaim?.status === "claimed" &&
        afterReclaim.attempts === 2 &&
        !capped,
      `failed ${failed}, reclaimed ${reclaimed}, attempts ${afterReclaim?.attempts}, capped ${!capped}`,
    );

    await repo.claim(now, { ...base, dedupKey: key("sent") });
    await repo.mark(now, key("sent"), "sent");
    const sentReclaim = await repo.reclaim(now, key("sent"));
    check(
      "0025: reclaim of a sent row returns false and leaves it sent",
      !sentReclaim && (await rowOf(key("sent")))?.status === "sent",
      `reclaim ${sentReclaim}`,
    );

    const old = new Date(now.getTime() - 91 * DAY);
    const recent = new Date(now.getTime() - DAY);
    await repo.claim(old, { ...base, dedupKey: key("old") });
    await repo.claim(recent, { ...base, dedupKey: key("recent") });
    // The three rows above were created just now (inside the window), so only the old one goes.
    const purged = await repo.purgeOlderThan(now);
    check(
      "0025: purgeOlderThan(90 days) deletes exactly the 91-day-old row and keeps the 1-day-old one",
      purged === 1 &&
        (await rowOf(key("old"))) === undefined &&
        (await rowOf(key("recent"))) !== undefined,
      `purged ${purged}`,
    );

    await db.insert(authUser).values({
      id: userId,
      name: "Смоук",
      email: `smoke-${tag}@example.invalid`,
      emailVerified: false,
      image: null,
      createdAt: now,
      updatedAt: now,
    });
    await repo.claim(now, { ...base, dedupKey: key("owned"), recipientUserId: userId });
    const linked = (await rowOf(key("owned")))?.recipientUserId === userId;
    await db.delete(authUser).where(eq(authUser.id, userId));
    const kept = await rowOf(key("owned"));
    check(
      "0025: deleting a user keeps their send row with recipient_user_id NULL",
      linked && kept !== undefined && kept.recipientUserId === null,
      `linked ${linked}, row ${kept === undefined ? "gone" : "kept"}`,
    );

    const fks = await executeRows<{ conname: string; confdeltype: string }>(
      db,
      sql`SELECT conname, confdeltype FROM pg_constraint
          WHERE conrelid = 'notification_sends'::regclass AND contype = 'f' ORDER BY conname`,
    );
    check(
      "0025: both notification_sends foreign keys are ON DELETE SET NULL (confdeltype n)",
      fks.length === 2 && fks.every((fk) => fk.confdeltype === "n"),
      fks.map((fk) => `${fk.conname} ${fk.confdeltype}`).join(", "),
    );

    const queued = await outcomeOf(async () => {
      await db.execute(
        sql`INSERT INTO notification_sends (dedup_key, kind, status, created_at, updated_at)
            VALUES (${key("queued")}, 'smoke', 'queued', now(), now())`,
      );
    });
    check(
      "0025: a status outside claimed, sent, failed is refused by notification_sends_status_check",
      queued === "notification_sends_status_check",
      queued,
    );

    const index = await executeRows<{ indexname: string }>(
      db,
      sql`SELECT indexname FROM pg_indexes
          WHERE tablename = 'notification_sends' AND indexname = 'notification_sends_status_created_idx'`,
    );
    check(
      "0025: the (status, created_at) index notification_sends_status_created_idx exists",
      index.length === 1,
      `${index.length} found`,
    );

    const column = await executeRows<{ is_nullable: string }>(
      db,
      sql`SELECT is_nullable FROM information_schema.columns
          WHERE table_name = 'shelters' AND column_name = 'freshness_reminder_off_at'`,
    );
    const [set] = await executeRows<{ n: number | string }>(
      db,
      sql`SELECT count(*)::int AS n FROM shelters WHERE freshness_reminder_off_at IS NOT NULL`,
    );
    check(
      "0025: shelters.freshness_reminder_off_at exists, is nullable and is NULL on every shelter",
      column.length === 1 && column[0]?.is_nullable === "YES" && Number(set?.n) === 0,
      `${column.length} column, nullable ${column[0]?.is_nullable}, ${set?.n} shelters with it set`,
    );
  } finally {
    // Delete failures must not hide a failed check above, so this runs whatever happened.
    await db.delete(notificationSends).where(inArray(notificationSends.dedupKey, keys));
    await db.delete(authUser).where(eq(authUser.id, userId));
  }

  return out;
}
