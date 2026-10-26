import {
  type Animal,
  type AnimalId,
  type AnimalListingState,
  type AnimalPhoto,
  type CityId,
  confirmationAnchorOf,
  DISCOVERABLE_LISTING_KINDS,
  type DraftAnimal,
  FEED_VISIBLE_VERIFICATION_STATUSES,
  isDiscoverable,
  LISTING_KINDS,
  type ListingKind,
  type ShelterHistoryEntry,
  type ShelterId,
  waitAnchorOf,
} from "@opika/domain";
import { and, desc, eq, inArray, isNull, lt, lte, or, type SQL, sql } from "drizzle-orm";
import type { Database } from "../client";
import { animals } from "../schema/animals";
import { shelterHistory } from "../schema/shelter-history";
import { shelters } from "../schema/shelters";
import { historyRowSelect } from "./history-sql";
import { animalToRowWithCity, rowToAnimal } from "./mappers";

/** A history line of one kind, with the id it is stored under. */
export type AnimalHistoryRow<K extends ShelterHistoryEntry["kind"]> = {
  id: string;
  entry: Extract<ShelterHistoryEntry, { kind: K }>;
};

/**
 * What a listing move records. Every move a shelter makes is a history line
 * (K-Q7), except «Ще шукає» and its undo (S1, Oleksii: "no history for «Ще
 * шукає» / undo"): the confirmation date is itself that record. A variant
 * rather than an optional row, so a caller can't drop a move's line by
 * forgetting an argument.
 */
export type ListingMoveHistory =
  | { kind: "recorded"; row: AnimalHistoryRow<"animal_listing_changed"> }
  | { kind: "not_recorded"; because: "confirmation" };

type WriteCte = Parameters<Database["with"]>[number];

export type KabinetAnimalPosition = { at: Date; id: string };

/**
 * Which of a shelter's animals a K2 page holds. `stale` carries its cut-off
 * instant, derived by the caller from the freshness policy, so this
 * repository knows nothing about what "stale" means beyond the one predicate
 * it shares with `staleCount`.
 */
export type KabinetAnimalFilter =
  | { kind: "all" }
  | { kind: "listing"; listing: ListingKind }
  | { kind: "stale"; staleBefore: Date };

/**
 * Visible listings last confirmed at or before `staleBefore`: the one
 * predicate behind both N5's count and its «Показати ці N» filter, so the
 * strip's number and the list it opens can't disagree. The kinds come from
 * the domain's own list, not a hand-written `IN`.
 */
const staleWhere = (staleBefore: Date) =>
  and(
    inArray(animals.listingKind, [...DISCOVERABLE_LISTING_KINDS]),
    lte(animals.lastConfirmedAt, staleBefore),
  );

const filterWhere = (filter: KabinetAnimalFilter) => {
  switch (filter.kind) {
    case "all":
      return undefined;
    case "listing":
      return eq(animals.listingKind, filter.listing);
    case "stale":
      return staleWhere(filter.staleBefore);
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = filter;
      return unreachable;
    }
  }
};

export type ConditionalWrite = { kind: "ok" } | { kind: "conflict" };

/**
 * Why a draft delete wrote nothing. `referenced` is the database refusing
 * because a swipe or reveal still points at the row (the FK has no cascade):
 * caught here and returned as a value, on either driver, so it reaches the
 * caller as a typed answer and never as an untyped 500 (HS-Q9, Oleksii).
 */
export type DraftDelete = { kind: "ok" } | { kind: "not_deleted" } | { kind: "referenced" };

const FOREIGN_KEY_VIOLATION = "23503";
const CHECK_VIOLATION = "23514";

/**
 * postgres-js throws a `PostgresError` and neon-http a `NeonDbError`; Drizzle
 * wraps either as `cause`. Both carry the SQLSTATE as `code`.
 */
function hasSqlState(error: unknown, sqlState: string): boolean {
  for (
    let e: unknown = error;
    e !== null && typeof e === "object";
    e = (e as { cause?: unknown }).cause
  ) {
    if ((e as { code?: unknown }).code === sqlState) return true;
  }
  return false;
}

const isForeignKeyViolation = (error: unknown): boolean =>
  hasSqlState(error, FOREIGN_KEY_VIOLATION);

/**
 * A CHECK constraint refused the row: on `animals`, a listed row missing a
 * listing fact, an age without its anchor, or English without Ukrainian
 * (F-B1). Every write path plans so this never fires (readiness before
 * publish, the draft-only null guard on edits), so it stays a thrown error,
 * a 500, rather than a typed answer: it means a planning bug, and the
 * database is the backstop that kept an incomplete card off the site.
 * Exported so the tests and the Neon smoke can tell it apart on both drivers.
 */
export const isCheckViolation = (error: unknown): boolean => hasSqlState(error, CHECK_VIOLATION);

/**
 * What a listing move compare-and-sets on beyond the listing itself. A
 * publish (`draft` to `published`) also requires the `version` its readiness
 * was planned on and a non-empty photo list (K3-T7, shapes doc §7.5):
 * otherwise a description-clearing save or a last-photo removal landing
 * between the read and the write would publish a card that fails the very
 * check the handler made. Every other move compares the listing only, so an
 * open form never conflicts with it (HS-T8).
 */
export type ListingWriteGuard =
  | { kind: "listing_only" }
  | { kind: "publish"; expectedVersion: number };

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
 *   `last_updated_at`; a publish also on `version` and a non-empty photo list
 *   (K3-T7).
 * - **Photo changes** (`writePhotosIf`) compare-and-set on the photo list and
 *   the listing (P-Q3, K3-T7), move `last_updated_at` and, on a visible card,
 *   the confirmation date (RH-B7); never `version`.
 */
export function kabinetAnimalRepo(db: Database) {
  /**
   * Inserts `history` for the shelter of the row the CTE `name` wrote, in the
   * same statement as the write (the shelter repo's `applyAuditedMany`
   * pattern). The line exists exactly when the write happened: a
   * compare-and-set that matched nothing leaves no row to select from, so a
   * conflict records nothing, and the history insert's row count is the
   * write's outcome. Postgres runs a data-modifying CTE whether or not the
   * outer statement reads it.
   */
  const writeWithHistory = async (
    cte: WriteCte,
    name: "created" | "upd" | "del",
    history: { id: string; entry: ShelterHistoryEntry },
  ): Promise<ConditionalWrite> => {
    const inserted = await db
      .with(cte)
      .insert(shelterHistory)
      .select(
        sql`SELECT ${historyRowSelect(history, sql.raw(`"${name}"."shelter_id"`))} FROM ${sql.raw(`"${name}"`)}`,
      )
      .returning({ id: shelterHistory.id });
    return inserted.length === 1 ? { kind: "ok" } : { kind: "conflict" };
  };

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

    /**
     * A new draft and its `animal_created` line, as one statement (K-Q7).
     * `DraftAnimal`, not `Animal` (Tier 1 review finding 7, PR #196): the PR
     * that introduced S8-F5's exhaustive write-path scan claimed this was
     * already type-enforced, which the signature didn't actually back -
     * narrowed here to make that claim true rather than just restated.
     */
    async insert(
      animal: DraftAnimal,
      cityId: CityId,
      history: AnimalHistoryRow<"animal_created">,
    ): Promise<void> {
      const created = db
        .$with("created")
        .as(
          db
            .insert(animals)
            .values(animalToRowWithCity(animal, cityId))
            .returning({ shelterId: animals.shelterId }),
        );
      await writeWithHistory(created, "created", history);
    },

    /**
     * A K3 form save: the edited fields, `last_updated_at` and a bumped
     * `version`, nothing else, compare-and-set on the `version` the form read
     * (S3-T6, RG-Q7). It never writes the listing or `last_confirmed_at`
     * (commitment #7), so a «Ще шукає» landing while the form is open is
     * neither overwritten nor a conflict (HS-T8, Oleksii: edits and
     * confirmations are separate facts, written to disjoint fields), and never
     * `photos` (RH-B3, Oleksii: "the form's version compare-and-set save never
     * writes the photos column"), so a photo changed meanwhile survives a save
     * planned on the old list. Its `animal_edited` line is written by the same
     * statement, so a conflict records nothing.
     *
     * A save that writes a null (a draft's cleared description, F-B1) also
     * requires the row to still be a draft: a publish landing between the
     * read and the write then makes it a conflict the caller re-reads, never a
     * CHECK violation. A save writing no null keeps the `version`-only
     * condition, so it never conflicts with a listing move.
     */
    async writeEditIf(
      animal: Animal,
      cityId: CityId,
      expectedVersion: number,
      history: AnimalHistoryRow<"animal_edited">,
    ): Promise<ConditionalWrite> {
      const row = animalToRowWithCity(animal, cityId);
      const writesNull = row.size === null || row.age === null || row.descriptionUk === null;
      const update = db
        .update(animals)
        .set({
          name: row.name,
          species: row.species,
          sex: row.sex,
          coatLength: row.coatLength,
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
        .where(
          and(
            eq(animals.id, animal.id),
            eq(animals.version, expectedVersion),
            writesNull ? eq(animals.listingKind, "draft") : undefined,
          ),
        )
        .returning({ shelterId: animals.shelterId });
      return writeWithHistory(db.$with("upd").as(update), "upd", history);
    },

    /**
     * A listing move (publish, reserve, «Ще шукає», undo, …): the listing and
     * the columns derived from it, and **never `last_updated_at`** (HS-T8: a
     * confirmation is not an edit). The compare-and-set token is the listing
     * itself as read: jsonb equality on the stored value, so a move planned on
     * a listing someone else has since changed writes nothing. No separate
     * version column is needed, and the edited time never moves.
     *
     * A recorded move writes its history line in the same statement; a
     * confirmation writes none (`ListingMoveHistory`). A publish carries its
     * extra guard (`ListingWriteGuard`), and one without it is refused here
     * before anything is written.
     */
    /**
     * S8-F5, hook 1 of 3 (hook 2: `kabinetShelterRepo.applyAuditedMany`;
     * hook 3: `onboard-shelter.ts`/`seed.ts`'s insert-time case). Whether this
     * move serves the row is checked **inside this statement**, against the
     * shelter's committed row at write time (`EXISTS` on `shelters`, the same
     * `FEED_VISIBLE_VERIFICATION_STATUSES` test `buildDiscoverabilityPredicate`
     * uses) - not against a verification value the caller read earlier.
     *
     * Tier 1 review finding 4 (PR #196): this used to take the shelter's
     * verification as a parameter, read once by the caller before this
     * function's retry loop even starts. A concurrent pause/suspension
     * landing between that read and this statement's commit would stamp
     * `everServedAt` on a row that, by the time this write actually lands,
     * isn't served at all - an over-stamp, not merely a delayed one, and
     * exactly the leak S8-F5 exists to prevent. Checking inside the
     * statement makes the two atomic: there is no window left to race.
     */
    async writeListingIf(
      animalId: AnimalId,
      next: AnimalListingState,
      expected: AnimalListingState,
      now: Date,
      history: ListingMoveHistory,
      guard: ListingWriteGuard = { kind: "listing_only" },
    ): Promise<ConditionalWrite> {
      const publishes = expected.kind === "draft" && next.kind !== "draft";
      if (publishes && guard.kind !== "publish") {
        throw new Error(`Animal ${animalId}: a publish must compare-and-set on version and photos`);
      }
      // Only a move that lands the row on a discoverable kind can possibly
      // serve it - every other move (draft, adopted, withdrawn) is a no-op
      // for this column regardless of the shelter's status, so the subquery
      // is skipped entirely rather than run to produce NULL.
      const everServedAt: SQL | undefined = isDiscoverable(next)
        ? sql`COALESCE(
            ${animals.everServedAt},
            CASE WHEN EXISTS (
              SELECT 1 FROM ${shelters}
              WHERE ${shelters.id} = ${animals.shelterId}
                AND ${inArray(shelters.verificationStatus, [...FEED_VISIBLE_VERIFICATION_STATUSES])}
            ) THEN ${now.toISOString()}::timestamptz ELSE NULL END
          )`
        : undefined;
      const update = db
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
          ...(everServedAt === undefined ? {} : { everServedAt }),
        })
        .where(
          and(
            eq(animals.id, animalId),
            // Text then jsonb: postgres.js would otherwise encode it twice.
            sql`${animals.listing} = ${JSON.stringify(expected)}::text::jsonb`,
            ...(guard.kind === "publish"
              ? [
                  eq(animals.version, guard.expectedVersion),
                  sql`jsonb_array_length(${animals.photos}) > 0`,
                ]
              : []),
          ),
        )
        .returning({ shelterId: animals.shelterId });
      if (history.kind === "not_recorded") {
        const updated = await update;
        return updated.length === 1 ? { kind: "ok" } : { kind: "conflict" };
      }
      return writeWithHistory(db.$with("upd").as(update), "upd", history.row);
    },

    /**
     * A photo change (add, reorder, remove, P-Q3): `photos`,
     * `last_updated_at` and the listing as `listingAfterPhotoChange` left it,
     * compare-and-set on both the photo list and the listing as the request
     * read them (jsonb equality), with its `animal_edited` line
     * (`fields: ["photos"]`) in the same statement, so a lost race writes and
     * records nothing.
     *
     * The listing is written because of RH-B7 (Oleksii, D4 option (i)): on a
     * published or reserved card a photo change moves the confirmation date
     * «Оновлено» counts from, so `listing.confirmedAt` and
     * `last_confirmed_at` move together. Its kind never changes here, so
     * `listing_kind`, `wait_anchor_at` and `first_published_at` stay as they
     * are. Comparing on the listing also closes K3-T7's race (§7.5): a
     * last-photo removal planned on a draft can't land after a publish.
     *
     * Not `version`: that is the K3 form's token, and a photo added while the
     * form is open must neither make the form's save a conflict nor be undone
     * by it (the form never writes `photos`, RH-B3; Oleksii: "Animals.version
     * stays unchanged (P-Q3)").
     */
    async writePhotosIf(
      animalId: AnimalId,
      photos: { next: readonly AnimalPhoto[]; expected: readonly AnimalPhoto[] },
      listing: { next: AnimalListingState; expected: AnimalListingState },
      lastUpdatedAt: Date,
      history: AnimalHistoryRow<"animal_edited">,
    ): Promise<ConditionalWrite> {
      if (listing.next.kind !== listing.expected.kind) {
        throw new Error(`Animal ${animalId}: a photo change never moves the listing's kind`);
      }
      const update = db
        .update(animals)
        .set({
          photos: photos.next,
          lastUpdatedAt,
          listing: listing.next,
          lastConfirmedAt: confirmationAnchorOf(listing.next),
        })
        .where(
          and(
            eq(animals.id, animalId),
            // Text then jsonb: postgres.js would otherwise encode it twice.
            sql`${animals.photos} = ${JSON.stringify(photos.expected)}::text::jsonb`,
            sql`${animals.listing} = ${JSON.stringify(listing.expected)}::text::jsonb`,
          ),
        )
        .returning({ shelterId: animals.shelterId });
      return writeWithHistory(db.$with("upd").as(update), "upd", history);
    },

    /**
     * Deletes a draft that has **never** been public (`first_published_at`
     * null, HS-Q9) and that nobody has written since the request read it. A
     * once-public listing is withdrawn, never deleted. `not_deleted` says only
     * that one of those conditions failed; the caller re-reads to say which.
     *
     * The `animal_deleted` line is written by the same statement. A swipe or
     * reveal still referencing the row fails the whole statement (the foreign
     * key is checked at the statement's end, CTE or not), so a refused delete
     * records nothing either.
     */
    async deleteDraftIf(
      id: AnimalId,
      expectedVersion: number,
      history: AnimalHistoryRow<"animal_deleted">,
    ): Promise<DraftDelete> {
      const deleted = db.$with("del").as(
        db
          .delete(animals)
          .where(
            and(
              eq(animals.id, id),
              eq(animals.listingKind, "draft"),
              isNull(animals.firstPublishedAt),
              eq(animals.version, expectedVersion),
            ),
          )
          .returning({ shelterId: animals.shelterId }),
      );
      try {
        const written = await writeWithHistory(deleted, "del", history);
        return written.kind === "ok" ? { kind: "ok" } : { kind: "not_deleted" };
      } catch (error) {
        if (isForeignKeyViolation(error)) return { kind: "referenced" };
        throw error;
      }
    },

    /**
     * One page of a shelter's animals, most recently edited first (keyset on
     * `(last_updated_at DESC, id DESC)`, never OFFSET), in one statement:
     * each row carries everything its K2 view needs, so nothing is read per
     * row. Fetches one extra row to know whether another page exists. The
     * stale filter keeps the same order, so its cursor is the same shape.
     */
    async listPage(input: {
      shelterId: ShelterId;
      filter: KabinetAnimalFilter;
      after: KabinetAnimalPosition | null;
      limit: number;
    }): Promise<{ items: Animal[]; next: KabinetAnimalPosition | null }> {
      const conditions = [eq(animals.shelterId, input.shelterId)];
      const filtered = filterWhere(input.filter);
      if (filtered) conditions.push(filtered);
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
     * and the pips can't disagree about what "stale" means; `listPage`'s stale
     * filter uses the same predicate.
     */
    async staleCount(shelterId: ShelterId, staleBefore: Date): Promise<number> {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(animals)
        .where(and(eq(animals.shelterId, shelterId), staleWhere(staleBefore)));
      return Number(row?.count ?? 0);
    },
  };
}
