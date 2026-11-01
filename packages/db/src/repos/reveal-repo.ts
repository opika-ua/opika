import type { AdopterId, AnimalId, ContactReveal, RevealId, ShelterId } from "@opika/domain";
import {
  and,
  countDistinct,
  desc,
  eq,
  exists,
  gt,
  lt,
  notExists,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { type Database, inOneTransaction } from "../client";
import { adopters } from "../schema/adopters";
import { reveals } from "../schema/reveals";
import { revealToRow, rowToReveal } from "./mappers";

/** The per-adopter reveal budget: a window start and how many distinct shelters fit in it. */
export type RevealBudget = { since: Date; maxShelters: number };

/**
 * What `insertWithinShelterBudget` did. Only `inserted` wrote anything; the other two are the
 * guard's refusals, told apart afterwards by whether this adopter's reveal of the animal exists.
 * That row travels with the refusal, so the caller answers with it without reading it again.
 */
export type RevealInsertOutcome =
  | { kind: "inserted" }
  | { kind: "animal_already_revealed"; existing: ContactReveal }
  | { kind: "over_budget" };

export function revealRepo(db: Database) {
  const ofAdopterSince = (adopterId: AdopterId, since: Date) =>
    and(eq(reveals.adopterId, adopterId), gt(reveals.revealedAt, since));
  const shelterRevealedSince = (adopterId: AdopterId, shelterId: ShelterId, since: Date) =>
    db
      .select({ id: reveals.id })
      .from(reveals)
      .where(and(ofAdopterSince(adopterId, since), eq(reveals.shelterId, shelterId)));
  const distinctSheltersSince = (adopterId: AdopterId, since: Date) =>
    db
      .select({ cnt: countDistinct(reveals.shelterId) })
      .from(reveals)
      .where(ofAdopterSince(adopterId, since));

  /** Exactly the rule `checkRevealRateLimit` applies, plus "never the same animal twice", as SQL. */
  const withinBudget = (reveal: ContactReveal, budget: RevealBudget) =>
    and(
      notExists(
        db
          .select({ id: reveals.id })
          .from(reveals)
          .where(
            and(eq(reveals.adopterId, reveal.adopterId), eq(reveals.animalId, reveal.animalId)),
          ),
      ),
      or(
        exists(shelterRevealedSince(reveal.adopterId, reveal.shelterId, budget.since)),
        lt(sql`(${distinctSheltersSince(reveal.adopterId, budget.since)})`, budget.maxShelters),
      ),
    );

  const findByAdopterAndAnimal = async (
    adopterId: AdopterId,
    animalId: AnimalId,
  ): Promise<ContactReveal | null> => {
    const rows = await db
      .select()
      .from(reveals)
      .where(and(eq(reveals.adopterId, adopterId), eq(reveals.animalId, animalId)))
      .limit(1);
    const row = rows[0];
    return row ? rowToReveal(row) : null;
  };

  return {
    async findById(id: RevealId): Promise<ContactReveal | null> {
      const rows = await db.select().from(reveals).where(eq(reveals.id, id)).limit(1);
      const row = rows[0];
      return row ? rowToReveal(row) : null;
    },

    findByAdopterAndAnimal,

    /**
     * Keyset-paginated list of reveals for an adopter.
     *
     * Ordering: `(revealed_at DESC, id DESC)`. The id tiebreaker prevents
     * skips or duplicates when two reveals share a timestamp - the same
     * defect class as OFFSET pagination.
     */
    async listByAdopter(
      adopterId: AdopterId,
      opts: { limit: number; cursor?: { revealedAt: Date; id: string } },
    ): Promise<readonly ContactReveal[]> {
      const conditions: SQL[] = [eq(reveals.adopterId, adopterId)];

      if (opts.cursor) {
        const cursorTs = opts.cursor.revealedAt.toISOString();
        conditions.push(
          sql`(${reveals.revealedAt} < ${cursorTs}::timestamptz
            OR (${reveals.revealedAt} = ${cursorTs}::timestamptz
              AND ${reveals.id} < ${opts.cursor.id}))`,
        );
      }

      const rows = await db
        .select()
        .from(reveals)
        .where(and(...conditions))
        .orderBy(desc(reveals.revealedAt), desc(reveals.id))
        .limit(opts.limit);

      return rows.map(rowToReveal);
    },

    /**
     * Count *distinct shelters* an adopter has revealed contact details for,
     * within a time window.
     *
     * Used by the reveal rate limiter. Deliberately shelter-count, not
     * row-count: contacts are scrapeable per shelter, not per animal, so a
     * device right-swiping many animals at the same shelter should not cost
     * more than one unit - `hasRevealedShelterRecently` below is what lets
     * the caller skip this check entirely for a shelter already counted.
     * Keeping this query inside the repository prevents the Drizzle query
     * builder from leaking into feature code (standing check: repository
     * boundary).
     */
    async countDistinctSheltersRecentByAdopter(adopterId: AdopterId, since: Date): Promise<number> {
      const rows = await distinctSheltersSince(adopterId, since);
      return rows[0]?.cnt ?? 0;
    },

    /**
     * Whether an adopter has already revealed *this* shelter's contact
     * details within a time window - the free-re-reveal check the rate
     * limiter runs before it ever counts against the budget.
     */
    async hasRevealedShelterRecently(
      adopterId: AdopterId,
      shelterId: ShelterId,
      since: Date,
    ): Promise<boolean> {
      const rows = await shelterRevealedSince(adopterId, shelterId, since).limit(1);
      return rows.length > 0;
    },

    async insert(reveal: ContactReveal): Promise<void> {
      await db.insert(reveals).values(revealToRow(reveal));
    },

    /**
     * Writes `reveal` only if the budget allows it, judged against every reveal already
     * committed (audit F8): a shelter this adopter revealed since `budget.since` is free, a new
     * one needs fewer than `budget.maxShelters` distinct shelters in that window, and the same
     * animal is never written twice.
     *
     * The guard alone can't close the race: each statement sees only what was committed when it
     * began, so two reveals at 29 would both pass. So the adopter's row is locked first, in the
     * same transaction (`FOR NO KEY UPDATE`, which a swipe's or a session's foreign-key check
     * doesn't wait on): a second reveal by this adopter waits there, and its guarded insert, a
     * new statement, then counts the first one's row.
     */
    async insertWithinShelterBudget(
      reveal: ContactReveal,
      budget: RevealBudget,
    ): Promise<RevealInsertOutcome> {
      const row = revealToRow(reveal);
      const [, inserted] = await inOneTransaction(db, (tx) => [
        tx
          .select({ id: adopters.id })
          .from(adopters)
          .where(eq(adopters.id, row.adopterId))
          .for("no key update"),
        tx
          .insert(reveals)
          .select(
            sql`SELECT ${row.id}, ${row.adopterId}, ${row.animalId}, ${row.shelterId}, ${sql.param(row.revealedAt, reveals.revealedAt)}::timestamptz, ${sql.param(row.shelterSnapshot, reveals.shelterSnapshot)}::jsonb, ${sql.param(row.animalSnapshot, reveals.animalSnapshot)}::jsonb WHERE ${withinBudget(reveal, budget)}`,
          )
          .returning({ id: reveals.id }),
      ]);
      if (inserted.length > 0) return { kind: "inserted" };
      const existing = await findByAdopterAndAnimal(reveal.adopterId, reveal.animalId);
      return existing === null
        ? { kind: "over_budget" }
        : { kind: "animal_already_revealed", existing };
    },
  };
}
