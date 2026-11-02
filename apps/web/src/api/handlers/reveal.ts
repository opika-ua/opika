import type {
  AnimalsRevealInputSchema,
  apiErrors,
  ContactRevealView,
  RevealShelterContactView,
} from "@opika/contracts";
import { animalRepo, revealRepo, shelterRepo } from "@opika/db/repos";
import {
  type AdopterId,
  type Animal,
  type ContactReveal,
  isDiscoverable,
  isPubliclyVerified,
  primaryPhoto,
  type RevealId,
  RevealIdSchema,
  type Shelter,
} from "@opika/domain";
import type { ORPCErrorConstructorMap } from "@orpc/server";
import type { z } from "zod";
import type { AppContext } from "../context";
import { perIpBudgetSpent, spendPerIpBudget } from "../per-ip-budgets";
import { checkRevealRateLimit, writeRevealWithinRateLimit } from "../reveal-rate-limit";
import { cityOnlyLocationOf } from "./public-location";

type RevealInput = z.infer<typeof AnimalsRevealInputSchema>;

/** The exact subset `animalsRevealContract` declares - see animals.ts's own comment (O-20). */
export type AnimalsRevealErrors = ORPCErrorConstructorMap<{
  NOT_FOUND: typeof apiErrors.NOT_FOUND;
  ANIMAL_NOT_AVAILABLE: typeof apiErrors.ANIMAL_NOT_AVAILABLE;
  SHELTER_NOT_VISIBLE: typeof apiErrors.SHELTER_NOT_VISIBLE;
  UNAUTHENTICATED: typeof apiErrors.UNAUTHENTICATED;
  RATE_LIMITED: typeof apiErrors.RATE_LIMITED;
}>;

/**
 * Reveal an animal's shelter contact details.
 *
 * This is the only endpoint that discloses contact details. It never
 * discloses the exact address (EM-D1): that stays in the stored snapshot. It:
 * - Requires an authenticated session
 * - Checks the animal is discoverable and its shelter is verified
 * - Is idempotent: a second reveal for the same animal returns the existing one
 * - Writes an immutable audit record with a denormalised shelter snapshot
 *   (exact address included, for the operator; `toView` leaves it out)
 * - A validated shelter session is neither recorded nor counted per adopter (per IP still)
 * - Rate-limits per adopter via a Postgres counter (survives across instances),
 *   held by a guarded write under a lock on the adopter's row (audit F8), and
 *   per IP on top of it (audit F1)
 */
export async function animalsReveal(
  input: RevealInput,
  context: AppContext,
  errors: AnimalsRevealErrors,
): Promise<ContactRevealView> {
  if (!context.adopterId) {
    throw errors.UNAUTHENTICATED();
  }

  const animals = animalRepo(context.db);
  const animal = await animals.findById(input.animalId);

  if (!animal) {
    throw errors.NOT_FOUND();
  }

  if (!isDiscoverable(animal.listing)) {
    throw errors.ANIMAL_NOT_AVAILABLE();
  }

  const shelters = shelterRepo(context.db);
  const shelter = await shelters.findById(animal.shelterId);

  if (shelter?.verification.status !== "verified") {
    throw errors.SHELTER_NOT_VISIBLE();
  }

  // The shelter is visible (checked above), so both answers below carry its
  // current name and contacts (K4-B4, RUI4-F1), never the first-reveal record's.
  const current = currentShelterContactOf(shelter);

  // A validated shelter (kabinet) session looking at a card is not an adopter: nothing is
  // recorded and the per-adopter budget is not used. The per-IP budget still is (anti-abuse).
  if (await isKabinetViewer(context)) {
    if (!(await spendPerIpBudget(context.caller, "newShelterReveals", context.now))) {
      throw perIpBudgetSpent();
    }
    return toView(revealOf(context.adopterId, animal, shelter, context.now), current);
  }

  // Idempotent: return existing reveal if one exists
  const reveals = revealRepo(context.db);
  const existing = await reveals.findByAdopterAndAnimal(context.adopterId, animal.id);
  if (existing) {
    return toView(existing, current);
  }

  // Rate limit check - persisted in Postgres, survives across instances.
  // Distinct-shelter budget: free if this shelter is already revealed
  // within the window (see checkRevealRateLimit's own doc comment).
  const use = await checkRevealRateLimit(
    context.db,
    context.adopterId,
    shelter.id,
    context.now,
    errors,
  );
  // Audit F1: the same unit, counted per IP across every adopter behind it.
  if (
    use === "new_shelter" &&
    !(await spendPerIpBudget(context.caller, "newShelterReveals", context.now))
  ) {
    throw perIpBudgetSpent();
  }

  const reveal = revealOf(context.adopterId, animal, shelter, context.now);

  // The check above can be passed by two reveals at once; this write holds the budget (audit F8).
  return toView(await writeRevealWithinRateLimit(context.db, reveal, errors), current);
}

/** A lookup that throws or is unavailable means a visitor: the normal, recorded path. */
async function isKabinetViewer(context: AppContext): Promise<boolean> {
  try {
    return (await context.isKabinetSession?.()) === true;
  } catch {
    return false;
  }
}

function revealOf(
  adopterId: AdopterId,
  animal: Animal,
  shelter: Shelter,
  now: Date,
): ContactReveal {
  return {
    id: RevealIdSchema.parse(crypto.randomUUID()) as RevealId,
    adopterId,
    animalId: animal.id,
    shelterId: shelter.id,
    revealedAt: now,
    shelterSnapshot: {
      shelterId: shelter.id,
      displayName: shelter.displayName,
      contact: shelter.contact,
      exactAddress: shelter.exactAddress,
      publicLocation: shelter.publicLocation,
      verificationStatusAtReveal: shelter.verification.status,
      donation: shelter.donation,
    },
    animalSnapshot: {
      name: animal.name,
      primaryPhoto: primaryPhoto(animal),
    },
  };
}

/**
 * The shelter's name and channels as they are now, read together from one
 * row, so the name above a number is that number's (RUI4-F1). For a shelter
 * the caller has already found visible.
 */
const currentShelterContactOf = (shelter: Shelter): RevealShelterContactView => ({
  source: "current",
  displayName: shelter.displayName,
  contact: shelter.contact,
});

/**
 * The shelter a «Мої запити» item names (K4-B4, Oleksii, verbatim: "Reveal
 * views and «Мої запити» show the shelter's CURRENT contacts; the snapshot
 * stays stored as the record."), labelled with where it came from (K4-B5):
 *
 * - `current`, the shelter's name and channels now, while it is visible
 *   (`isPubliclyVerified`, the feed's own rule), so a shelter that changes its
 *   number in K4 is reached on the new one, by people who asked before the
 *   change too, and a shelter the operator renamed (R-UI 4) is named as it is
 *   now;
 * - `first_reveal`, the stored record's name and channels, when it is not
 *   visible (paused, suspended, rejected, pending, or no row at all), which is
 *   what «Мої запити» showed for such a shelter before (his words: "keep
 *   today's behaviour for those views").
 *
 * The name follows the contacts' rule in the same branch (RUI4-F1): a name
 * and the channels under it never come from two different moments. The
 * stored record is never rewritten either way.
 */
export const shelterContactOf = (
  reveal: ContactReveal,
  shelter: Shelter | null | undefined,
): RevealShelterContactView =>
  shelter !== null && shelter !== undefined && isPubliclyVerified(shelter.verification)
    ? currentShelterContactOf(shelter)
    : {
        source: "first_reveal",
        displayName: reveal.shelterSnapshot.displayName,
        contact: reveal.shelterSnapshot.contact,
      };

/**
 * The stored reveal, cut down to what the adopter receives (EM-D1, Oleksii,
 * 2026-10-15: "the exact address never leaves the server for adopters"): the
 * name and contacts the caller chose (`shelterContact`: current, or the
 * first-reveal record's, K4-B5, RUI4-F1), and from the first-reveal record the
 * shelter's donation link, status and city. The exact address, district and
 * point stay in the stored record, the operator's. Shared by `animals.reveal`
 * and `reveals.listMine`.
 *
 * Projected field by field here, not left to oRPC's output stripping alone:
 * handing the whole snapshot to the narrower view typechecks either way, so
 * this is what says, at the call site, that the address stays behind.
 */
export function toView(
  reveal: ContactReveal,
  shelterContact: RevealShelterContactView,
): ContactRevealView {
  const record = reveal.shelterSnapshot;
  return {
    id: reveal.id,
    animalId: reveal.animalId,
    revealedAt: reveal.revealedAt,
    shelterContact,
    shelterAtFirstReveal: {
      shelterId: record.shelterId,
      verificationStatusAtReveal: record.verificationStatusAtReveal,
      donation: record.donation,
      publicLocation: cityOnlyLocationOf(record.publicLocation),
    },
    animalSnapshot: reveal.animalSnapshot,
  };
}
