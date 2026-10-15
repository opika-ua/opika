import type {
  apiErrors,
  HistoryEntryViewSchema,
  RegistryShelterRowView,
  RegistryShelterView,
  ShelterAdminView,
} from "@opika/contracts";
import {
  kabinetRegistryRepo,
  kabinetShelterRepo,
  type RegistryAdminRow,
  type RegistryListPosition,
  shelterRepo,
} from "@opika/db/repos";
import type { CityId, Shelter, ShelterAdminId, ShelterId, VerificationStatus } from "@opika/domain";
import type { ORPCErrorConstructorMap } from "@orpc/server";
import type { z } from "zod";
import type { KabinetContext } from "../context";

export type RegistryDeps = Pick<
  KabinetContext,
  "db" | "now" | "newId" | "operatorDisplayName" | "invites" | "linkBaseURL"
>;

type NotFound = ORPCErrorConstructorMap<{ NOT_FOUND: typeof apiErrors.NOT_FOUND }>;

const adminViewOf = (row: RegistryAdminRow): ShelterAdminView => ({
  id: row.userId as ShelterAdminId,
  name: row.name,
  email: row.email,
  invite: row.invite,
});

/**
 * S3/S4's full record. Built field by field, the way the view is `pick`ed:
 * the operator sees evidence and moderator ids, but still nothing that only
 * happens to be on the row.
 */
export function registryShelterViewOf(
  shelter: Shelter,
  admins: readonly RegistryAdminRow[],
): RegistryShelterView {
  return {
    id: shelter.id,
    displayName: shelter.displayName,
    description: shelter.description,
    legalEntity: shelter.legalEntity,
    publicLocation: shelter.publicLocation,
    exactAddress: shelter.exactAddress,
    contact: shelter.contact,
    donation: shelter.donation,
    pendingDonation: shelter.pendingDonation,
    freshnessSentence: shelter.freshnessSentence,
    verification: shelter.verification,
    createdAt: shelter.createdAt,
    lastUpdatedAt: shelter.lastUpdatedAt,
    version: shelter.version,
    admins: admins.map(adminViewOf),
  };
}

/** A registry procedure names its shelter in input; an unknown id is NOT_FOUND, not a crash. */
export async function loadShelterOr404(
  deps: Pick<RegistryDeps, "db">,
  shelterId: ShelterId,
  errors: NotFound,
): Promise<Shelter> {
  const shelter = await shelterRepo(deps.db).findById(shelterId);
  if (shelter === null) throw errors.NOT_FOUND();
  return shelter;
}

export async function registryShelterView(
  deps: Pick<RegistryDeps, "db">,
  shelter: Shelter,
): Promise<RegistryShelterView> {
  return registryShelterViewOf(shelter, await kabinetRegistryRepo(deps.db).adminsOf(shelter.id));
}

export async function registrySheltersList(
  deps: Pick<RegistryDeps, "db">,
  input: {
    search: string | null;
    status: VerificationStatus | null;
    after: RegistryListPosition | null;
    limit: number;
  },
  encode: (position: RegistryListPosition) => string,
): Promise<{
  items: RegistryShelterRowView[];
  nextCursor: string | null;
  counts: Record<VerificationStatus, number>;
}> {
  const repo = kabinetRegistryRepo(deps.db);
  const [page, counts] = await Promise.all([repo.listPage(input), repo.statusCounts(input.search)]);
  return {
    items: page.items.map((row) => ({
      id: row.id,
      displayName: row.displayName,
      createdAt: row.createdAt,
      status: row.status,
      cityId: row.cityId as CityId,
      animalCount: row.animalCount,
    })),
    nextCursor: page.next === null ? null : encode(page.next),
    counts,
  };
}

export async function registrySheltersById(
  deps: Pick<RegistryDeps, "db">,
  input: { shelterId: ShelterId },
  errors: NotFound,
): Promise<RegistryShelterView> {
  return registryShelterView(deps, await loadShelterOr404(deps, input.shelterId, errors));
}

/** The operator's history of a shelter: every entry, whole (evidence and moderator ids included). */
export async function registryHistoryList(
  deps: Pick<RegistryDeps, "db">,
  input: { shelterId: ShelterId; after: { at: Date; id: string } | null; limit: number },
  encode: (position: { at: Date; id: string }) => string,
  errors: NotFound,
): Promise<{ items: z.infer<typeof HistoryEntryViewSchema>[]; nextCursor: string | null }> {
  await loadShelterOr404(deps, input.shelterId, errors);
  const page = await kabinetShelterRepo(deps.db).historyPage({
    shelterId: input.shelterId,
    after: input.after,
    limit: input.limit,
  });
  return { items: page.items, nextCursor: page.next === null ? null : encode(page.next) };
}
