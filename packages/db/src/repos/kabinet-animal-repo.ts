import {
  type Animal,
  type AnimalId,
  type AnimalListingState,
  type CityId,
  confirmationAnchorOf,
  LISTING_KINDS,
  type ListingKind,
  type ShelterId,
  waitAnchorOf,
} from "@opika/domain";
import { and, desc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import { animals } from "../schema/animals";
import { animalToRowWithCity, rowToAnimal } from "./mappers";

export type KabinetAnimalPosition = { at: Date; id: string };

export type ConditionalWrite = { kind: "ok" } | { kind: "conflict" };

/**
 * Why a draft delete wrote nothing. `referenced` is the database refusing
 * because a swipe or reveal still points at the row (the FK has no cascade):
 * caught here and returned as a value, on either driver, so it reaches the
 * caller as a typed answer and never as an untyped 500 (HS-Q9, Oleksii).
 */
export type DraftDelete = { kind: "ok" } | { kind: "not_deleted" } | { kind: "referenced" };

const FOREIGN_KEY_VIOLATION = "23503";

/**
 * postgres-js throws a `PostgresError` and neon-http a `NeonDbError`; Drizzle
 * wraps either as `cause`. Both carry the SQLSTATE as `code`.
 */
function isForeignKeyViolation(error: unknown): boolean {
  for (
    let e: unknown = error;
    e !== null && typeof e === "object";
    e = (e as { cause?: unknown }).cause
  ) {
    if ((e as { code?: unknown }).code === FOREIGN_KEY_VIOLATION) return true;
  }
  return false;
}

/**
 * The kabinet's animal reads and writes. Ownership is the handler's check (it
 * must answer NOT_FOUND for a missing id and FORBIDDEN for another shelter's,
 * S3-Q2), so `findWithCity` returns any animal and the handler compares
 * `shelterId`; every list here is scoped to one shelter by construction.
 *
 * Two kinds of write, on disjoint columns (HS-T8):
 * - **Edits** (`writeEditIf`) compare-and-set on the integer `version` the form
 *   read, and bump it (S3-T6, Oleksii: timestamps rejected on precision, JS ms
 *   vs Postgres µs).
 * - **Listing moves** (`writeListingIf`) compare-and-set on the listing itself
 *   (jsonb equality with the value the request read) and never touch
 *   `last_updated_at`.
 */
export function kabinetAnimalRepo(db: Database) {
  return {
    async findWithCity(
      id: AnimalId,
    ): Promise<{ animal: Animal; cityId: CityId; firstPublishedAt: Date | null } | null> {
      const [row] = await db.select().from(animals).where(eq(animals.id, id)).limit(1);
      return row
        ? {
            animal: rowToAnimal(row),
            cityId: row.cityId as CityId,
            firstPublishedAt: row.firstPublishedAt,
          }
        : null;
    },

    async insert(animal: Animal, cityId: CityId): Promise<void> {
      await db.insert(animals).values(animalToRowWithCity(animal, cityId));
    },

    /**
     * A K3 form save: the edited fields, `last_updated_at` and a bumped
     * `version`, nothing else, compare-and-set on the `version` the form read
     * (S3-T6, RG-Q7). It never writes
     * the listing, so a «Ще шукає» landing while the form is open is neither
     * overwritten nor a conflict (HS-T8, Oleksii: edits and confirmations are
     * separate facts, written to disjoint fields).
     */
    async writeEditIf(
      animal: Animal,
      cityId: CityId,
      expectedVersion: number,
    ): Promise<ConditionalWrite> {
      const row = animalToRowWithCity(animal, cityId);
      const updated = await db
        .update(animals)
        .set({
          name: row.name,
          species: row.species,
          sex: row.sex,
          size: row.size,
          age: row.age,
          ageAnchorAt: row.ageAnchorAt,
          descriptionUk: row.descriptionUk,
          descriptionEnText: row.descriptionEnText,
          descriptionEnProvenance: row.descriptionEnProvenance,
          vaccination: row.vaccination,
          spayNeuter: row.spayNeuter,
          lastUpdatedAt: row.lastUpdatedAt,
          version: sql`${animals.version} + 1`,
        })
        .where(and(eq(animals.id, animal.id), eq(animals.version, expectedVersion)))
        .returning({ id: animals.id });
      return updated.length === 1 ? { kind: "ok" } : { kind: "conflict" };
    },

    /**
     * A listing move (publish, reserve, «Ще шукає», undo, …): the listing and
     * the columns derived from it, and **never `last_updated_at`** (HS-T8: a
     * confirmation is not an edit). The compare-and-set token is the listing
     * itself as read: jsonb equality on the stored value, so a move planned on
     * a listing someone else has since changed writes nothing. No separate
     * version column is needed, and the edited time never moves.
     */
    async writeListingIf(
      animalId: AnimalId,
      next: AnimalListingState,
      expected: AnimalListingState,
    ): Promise<ConditionalWrite> {
      const updated = await db
        .update(animals)
        .set({
          listing: next,
          listingKind: next.kind,
          waitAnchorAt: waitAnchorOf(next),
          lastConfirmedAt: confirmationAnchorOf(next),
          // Filled in on the first publish, never cleared by any later move.
          firstPublishedAt: sql`COALESCE(${animals.firstPublishedAt}, ${
            next.kind === "published" || next.kind === "reserved"
              ? next.publishedAt.toISOString()
              : null
          }::timestamptz)`,
        })
        .where(
          and(
            eq(animals.id, animalId),
            // Text then jsonb: postgres.js would otherwise encode it twice.
            sql`${animals.listing} = ${JSON.stringify(expected)}::text::jsonb`,
          ),
        )
        .returning({ id: animals.id });
      return updated.length === 1 ? { kind: "ok" } : { kind: "conflict" };
    },

    /**
     * Deletes a draft that has **never** been public (`first_published_at`
     * null, HS-Q9) and that nobody has written since the request read it. A
     * once-public listing is withdrawn, never deleted. `not_deleted` says only
     * that one of those conditions failed; the caller re-reads to say which.
     */
    async deleteDraftIf(id: AnimalId, expectedVersion: number): Promise<DraftDelete> {
      try {
        const deleted = await db
          .delete(animals)
          .where(
            and(
              eq(animals.id, id),
              eq(animals.listingKind, "draft"),
              isNull(animals.firstPublishedAt),
              eq(animals.version, expectedVersion),
            ),
          )
          .returning({ id: animals.id });
        return deleted.length === 1 ? { kind: "ok" } : { kind: "not_deleted" };
      } catch (error) {
        if (isForeignKeyViolation(error)) return { kind: "referenced" };
        throw error;
      }
    },

    /**
     * One page of a shelter's animals, most recently edited first (keyset on
     * `(last_updated_at DESC, id DESC)`, never OFFSET). Fetches one extra row
     * to know whether another page exists.
     */
    async listPage(input: {
      shelterId: ShelterId;
      listing: ListingKind | null;
      after: KabinetAnimalPosition | null;
      limit: number;
    }): Promise<{ items: Animal[]; next: KabinetAnimalPosition | null }> {
      const conditions = [eq(animals.shelterId, input.shelterId)];
      if (input.listing !== null) conditions.push(eq(animals.listingKind, input.listing));
      if (input.after !== null) {
        const keyset = or(
          lt(animals.lastUpdatedAt, input.after.at),
          and(
            eq(animals.lastUpdatedAt, input.after.at),
            lt(animals.id, input.after.id as AnimalId),
          ),
        );
        if (keyset) conditions.push(keyset);
      }
      const rows = await db
        .select()
        .from(animals)
        .where(and(...conditions))
        .orderBy(desc(animals.lastUpdatedAt), desc(animals.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit).map(rowToAnimal);
      const last = page.at(-1);
      return {
        items: page,
        next: rows.length > input.limit && last ? { at: last.lastUpdatedAt, id: last.id } : null,
      };
    },

    /** Inventory counts for the filter chips: every kind present, zero when absent. */
    async countsByKind(shelterId: ShelterId): Promise<Record<ListingKind, number>> {
      const rows = await db
        .select({ kind: animals.listingKind, count: sql<number>`count(*)::int` })
        .from(animals)
        .where(eq(animals.shelterId, shelterId))
        .groupBy(animals.listingKind);
      const counts = Object.fromEntries(LISTING_KINDS.map((kind) => [kind, 0])) as Record<
        ListingKind,
        number
      >;
      for (const row of rows) counts[row.kind as ListingKind] = Number(row.count);
      return counts;
    },

    /**
     * Visible listings last confirmed at or before `staleBefore` (N5's strip).
     * The caller derives `staleBefore` from the freshness policy, so the strip
     * and the pips can't disagree about what "stale" means.
     */
    async staleCount(shelterId: ShelterId, staleBefore: Date): Promise<number> {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(animals)
        .where(
          and(
            eq(animals.shelterId, shelterId),
            inArray(animals.listingKind, ["published", "reserved"]),
            lte(animals.lastConfirmedAt, staleBefore),
          ),
        );
      return Number(row?.count ?? 0);
    },
  };
}
