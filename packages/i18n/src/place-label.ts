import type { SettlementKind } from "@opika/domain";

/** Owner decision (Q4): the prefix follows the settlement kind; «м.», «с-ще», «с.» confirmed, and there is no «смт» kind. */
const PLACE_PREFIX: Record<SettlementKind, string> = {
  special_status_city: "м.",
  city: "м.",
  selyshche: "с-ще",
  village: "с.",
};

/** «м. Київ», «с-ще Іванівка», «с. Мирне»: the name with its kind's prefix. */
export function placeLabel(kind: SettlementKind, name: string): string {
  return `${PLACE_PREFIX[kind]} ${name}`;
}
