import type { SettlementKind } from "@opika/domain";

/** Owner decision (Phase 0, Q4): the prefix follows the settlement kind. Abbreviations pending a ДСТУ 3582:2013 check. */
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
