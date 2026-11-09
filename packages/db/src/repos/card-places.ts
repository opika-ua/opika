import {
  type City,
  CitySlugSchema,
  type PublicListingLabel,
  publicListingBasisOfColumns,
  type Shelter,
  type VerificationStatus,
} from "@opika/domain";
import { type SQL, sql } from "drizzle-orm";
import { animals } from "../schema/animals";
import { cities } from "../schema/cities";
import { shelters } from "../schema/shelters";

/**
 * The shelter and city a public card names, read in the same statement as the animal (a JOIN) so
 * a page does not pay a round trip per lookup. Only the columns the public views are built from:
 * never the exact address, contact, legal entity or verification evidence, which also keeps the
 * repeated per-row copy small.
 */
export type CardShelter = Pick<Shelter, "id" | "displayName" | "logo" | "publicLocation"> & {
  readonly verification: PublicListingLabel | "unverified";
  /** From the status already selected: `paused` for a pause only, `unreachable` for the rest. */
  readonly availability: "open" | "paused" | "unreachable";
};

/** The city fields of a public label (`cityLabelOf`), nothing else: no centroid, KATOTTG or search keys. */
export type CardCity = Pick<
  City,
  "id" | "slug" | "kind" | "nameScope" | "regionId" | "district"
> & { readonly name: { readonly uk: string } };

/** A card's place: the animal's own city when it has one, else its shelter's (`cardCityIdOf` in the handlers). */
export const cardCityIdSql: SQL<string | null> =
  sql`coalesce(${animals.publicLocation}->>'cityId', ${shelters.publicLocation}->>'cityId')`;

export const cardShelterColumns = {
  id: shelters.id,
  displayName: shelters.displayName,
  logo: shelters.logo,
  publicLocation: shelters.publicLocation,
  status: shelters.verificationStatus,
  earlyListingSince: shelters.earlyListingSince,
};

export const cardCityColumns = {
  id: cities.id,
  slug: cities.slug,
  kind: cities.kind,
  nameScope: cities.nameScope,
  regionId: cities.regionId,
  nameUk: cities.nameUk,
  districtNameUk: cities.districtNameUk,
};

type CardShelterRow = {
  id: Shelter["id"];
  displayName: string;
  logo: Shelter["logo"] | null;
  publicLocation: Shelter["publicLocation"];
  status: string;
  earlyListingSince: Date | null;
};

/**
 * `now` is a parameter because an early listing lapses at read time: the same row is "open" at
 * one instant and "unreachable" at the next, by `publicListingBasisOfColumns` (the domain rule the
 * SQL predicate is tested against).
 */
export function toCardShelter(row: CardShelterRow, now: Date): CardShelter {
  const listing = publicListingBasisOfColumns(
    row.status as VerificationStatus,
    row.earlyListingSince,
    now,
  );
  return {
    id: row.id,
    displayName: row.displayName,
    logo: row.logo ?? null,
    publicLocation: row.publicLocation,
    verification: listing === "not_listed" ? "unverified" : listing,
    availability:
      listing !== "not_listed" ? "open" : row.status === "paused" ? "paused" : "unreachable",
  };
}

type CardCityRow = {
  id: City["id"];
  slug: string;
  kind: City["kind"];
  nameScope: City["nameScope"];
  regionId: City["regionId"];
  nameUk: string;
  districtNameUk: string | null;
};

export function toCardCity(row: CardCityRow): CardCity {
  return {
    id: row.id,
    slug: CitySlugSchema.parse(row.slug),
    kind: row.kind,
    nameScope: row.nameScope,
    regionId: row.regionId,
    name: { uk: row.nameUk },
    district: row.districtNameUk === null ? null : { uk: row.districtNameUk },
  };
}
