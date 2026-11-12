import {
  type AnimalId,
  frameOfUnits,
  frameUnitsOf,
  type PhotoFrameUnits,
  type PhotoFraming,
  type PhotoSourceOrigin,
  type ShelterId,
} from "@opika/domain";
import { and, eq, type SQL, sql } from "drizzle-orm";
import type { Database } from "../client";
import { animalPhotoSources } from "../schema/animal-photo-sources";
import { animals } from "../schema/animals";

/**
 * A photo's kept source and its frame, keyed by the photo's variants key. Read only for the
 * shelter that owns the photo, and never part of a public view (`photo-storage-key-scan.test.ts`).
 */
export type PhotoSource = {
  storageKey: string;
  sourceObjectKey: string;
  origin: PhotoSourceOrigin;
  width: number;
  height: number;
  framing: PhotoFraming;
};

const NO_FRAME = { x: null, y: null, w: null, h: null } as const;

function frameColumnsOf(framing: PhotoFraming): PhotoFrameUnits | typeof NO_FRAME {
  switch (framing.kind) {
    case "attention":
      return NO_FRAME;
    case "frame":
      return frameUnitsOf(framing.frame);
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = framing;
      return unreachable;
    }
  }
}

type SourceRow = typeof animalPhotoSources.$inferSelect;

const framingOfRow = (row: SourceRow): PhotoFraming =>
  row.frameX === null || row.frameY === null || row.frameW === null || row.frameH === null
    ? { kind: "attention" }
    : {
        kind: "frame",
        frame: frameOfUnits({ x: row.frameX, y: row.frameY, w: row.frameW, h: row.frameH }),
      };

const rowToPhotoSource = (row: SourceRow): PhotoSource => ({
  storageKey: row.storageKey,
  sourceObjectKey: row.sourceObjectKey,
  origin: row.sourceOrigin,
  width: row.sourceWidth,
  height: row.sourceHeight,
  framing: framingOfRow(row),
});

/**
 * One `animal_photo_sources` row as a SELECT list in the table's column order, for the
 * `INSERT … SELECT` that writes it only when its photo write happened (`historyRowSelect`'s
 * pattern). Every value is cast: neon-http binds parameters untyped.
 */
export function sourceRowSelect(source: PhotoSource, animalId: SQL, createdAt: Date): SQL {
  const frame = frameColumnsOf(source.framing);
  return sql`${source.storageKey}::text, ${animalId}, ${source.sourceObjectKey}::text, ${source.origin}::text, ${source.width}::integer, ${source.height}::integer, ${frame.x}::integer, ${frame.y}::integer, ${frame.w}::integer, ${frame.h}::integer, ${createdAt.toISOString()}::timestamptz`;
}

/** A source row only when its key is one of the animal's current photos. */
const isPhotoOf = (animalsAlias: SQL, storageKey: SQL): SQL =>
  sql`EXISTS (SELECT 1 FROM jsonb_array_elements(${animalsAlias}."photos") AS photo WHERE photo->>'storageKey' = ${storageKey})`;

/**
 * Reads and the onboarding insert. The kabinet's photo write records and removes rows in its
 * own compare-and-set statement (`kabinetAnimalRepo.writePhotosIf`); nothing here deletes, since
 * a row goes with its photo there, or with its animal (ON DELETE CASCADE).
 */
export function photoSourcesRepo(db: Database) {
  return {
    /**
     * The kept sources of one animal's current photos, if the animal is this shelter's: another
     * shelter's id reads nothing, exactly like a missing one. One indexed query.
     */
    async listForAnimal(animalId: AnimalId, shelterId: ShelterId): Promise<PhotoSource[]> {
      const rows = await db
        .select()
        .from(animalPhotoSources)
        .where(
          and(
            eq(animalPhotoSources.animalId, animalId),
            sql`EXISTS (SELECT 1 FROM ${animals} WHERE ${animals.id} = ${animalPhotoSources.animalId} AND ${animals.shelterId} = ${shelterId} AND ${isPhotoOf(sql`${animals}`, sql`${animalPhotoSources.storageKey}`)})`,
          ),
        )
        .orderBy(animalPhotoSources.storageKey);
      return rows.map(rowToPhotoSource);
    },

    /**
     * Sources for photos an animal already has (onboarding inserts the animal first), in one
     * statement. A source whose key is not one of the animal's photos is not written; the count
     * returned says how many were.
     */
    async insertForAnimal(
      animalId: AnimalId,
      sources: readonly PhotoSource[],
      createdAt: Date,
    ): Promise<number> {
      if (sources.length === 0) return 0;
      const selects = sources.map(
        (source) =>
          sql`SELECT ${sourceRowSelect(source, sql`"a"."id"`, createdAt)} FROM ${animals} AS "a" WHERE "a"."id" = ${animalId} AND ${isPhotoOf(sql`"a"`, sql`${source.storageKey}::text`)}`,
      );
      const inserted = await db
        .insert(animalPhotoSources)
        .select(sql.join(selects, sql` UNION ALL `))
        .returning({ storageKey: animalPhotoSources.storageKey });
      return inserted.length;
    },
  };
}
