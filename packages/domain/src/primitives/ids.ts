import { z } from "zod";

/**
 * Branded identifiers exist so `revealContact(adopterId, animalId)` cannot be
 * called with its arguments swapped. In a codebase where every identifier is a
 * string, that bug class is invisible to the compiler and expensive at runtime.
 *
 * The factory takes no runtime argument: Zod's brand is type-only, so a
 * `brand: B` parameter would exist solely to be ignored.
 */
const brandedId = <B extends string>() => z.uuid().brand<B>();

export const AnimalIdSchema = brandedId<"AnimalId">();
export type AnimalId = z.infer<typeof AnimalIdSchema>;

export const ShelterIdSchema = brandedId<"ShelterId">();
export type ShelterId = z.infer<typeof ShelterIdSchema>;

export const AdopterIdSchema = brandedId<"AdopterId">();
export type AdopterId = z.infer<typeof AdopterIdSchema>;

export const RevealIdSchema = brandedId<"RevealId">();
export type RevealId = z.infer<typeof RevealIdSchema>;

export const CityIdSchema = brandedId<"CityId">();
export type CityId = z.infer<typeof CityIdSchema>;

/**
 * Named for the role rather than for the auth table: the verification state
 * machine cares that a human moderator acted, not which identity provider
 * issued the session.
 */
export const ModeratorIdSchema = brandedId<"ModeratorId">();
export type ModeratorId = z.infer<typeof ModeratorIdSchema>;

/**
 * Only reachable once adopter accounts exist. Modelled now because the whole
 * reason deferring accounts is safe is that adding them stays additive.
 */
export const AccountIdSchema = brandedId<"AccountId">();
export type AccountId = z.infer<typeof AccountIdSchema>;

/** Ukrainian legal-entity registration code (ЄДРПОУ): exactly 8 digits. */
export const EdrpouSchema = z
  .string()
  .regex(/^\d{8}$/)
  .brand<"Edrpou">();
export type Edrpou = z.infer<typeof EdrpouSchema>;

/** ISO 3166-1 alpha-2, upper case. */
export const CountryCodeSchema = z
  .string()
  .regex(/^[A-Z]{2}$/)
  .brand<"CountryCode">();
export type CountryCode = z.infer<typeof CountryCodeSchema>;
