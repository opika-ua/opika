import type { apiErrors, BlockedAddressesView } from "@opika/contracts";
import { kabinetRegistryRepo } from "@opika/db/repos";
import type { ShelterId } from "@opika/domain";
import type { ORPCErrorConstructorMap } from "@orpc/server";
import { loadShelterOr404, type RegistryDeps } from "./registry-reads";

type NotFound = ORPCErrorConstructorMap<Pick<typeof apiErrors, "NOT_FOUND">>;

/**
 * `registry.admins.blockedAddresses` (Oleksii, 2026-10-14, answer 4,
 * verbatim: "A lighter version of B, with no migration: The registry screen
 * shows Brevo-blocked addresses by querying Brevo's blocked-contacts API when
 * the screen loads. Non-block failures stay log-only (address masked).").
 *
 * The shelter's addresses are its admins and pending invitations, the same
 * list S4 shows. The provider's list is read through the invitation channel's
 * cached reader (`cachedBlockList`), so it is paged at most once per cache
 * window however many shelters the operator opens. What can't be read is
 * `unknown` and what was cut off by the page cap is `incomplete`: neither is
 * ever answered as an empty `checked` list. A shelter with no addresses has
 * nothing to look up, so its answer is an honest empty `checked`, without a
 * call to the provider.
 */
export async function registryAdminsBlockedAddresses(
  deps: RegistryDeps,
  input: { shelterId: ShelterId },
  errors: NotFound,
): Promise<BlockedAddressesView> {
  await loadShelterOr404(deps, input.shelterId, errors);
  const addresses = [
    ...new Set(
      (await kabinetRegistryRepo(deps.db).adminsOf(input.shelterId)).map((admin) => admin.email),
    ),
  ];
  if (addresses.length === 0) return { kind: "checked", asOf: deps.now, blocked: [] };
  const list = await deps.invites.blockList.read(deps.now);
  if (list.kind === "unknown") return { kind: "unknown", why: list.why };
  const matches = addresses.flatMap((email) => {
    const reason = list.entries.get(email.trim().toLowerCase());
    return reason === undefined ? [] : [{ email, reason }];
  });
  return list.kind === "complete"
    ? { kind: "checked", asOf: list.readAt, blocked: matches }
    : { kind: "incomplete", asOf: list.readAt, blockedSoFar: matches };
}
