import type { SpayNeuterStatus, VaccinationStatus } from "@opika/domain";
import { uk } from "@opika/i18n";

export type MedicalRow = {
  label: string;
  statusText: string;
  /** Tailwind class for the 4×16 source stripe — `docs/design/README.md`'s own legend: registry / shelter's words / not recorded. */
  barClassName: "bg-rg-registry" | "bg-rg-ink-3" | "bg-rg-fill-strong";
};

/**
 * `AnimalSchema.vaccination` is a single field, but the mock's D1 frame
 * shows two visually distinct rows — "Сказ" (rabies) with a registry badge,
 * "Комплексне щеплення" (combo) with a shelter's-words badge. There is no
 * second domain field to source a real second row from (`vaccination` is
 * one union, not two), so this renders exactly one row, whose LABEL
 * switches on `source`: a registry-confirmed vaccination in Ukraine's real
 * pet registry specifically means rabies (`attestation.ts`'s own comment:
 * "Ukraine's pet registry holds animal identification and rabies
 * vaccination data"), so `source: "registry"` reads as "Сказ"; a shelter's
 * own claim is read as the general "Комплексне щеплення" instead. Recorded
 * as a deviation from the mock's three-row example
 * (`docs/design/README.md`'s "Whole-list error" section neighbours this
 * kind of note; see this phase's PR body for the full account) — not a
 * silent drop, since seed data today never produces the registry variant
 * at all (verified: no `source: "registry"` anywhere in
 * `packages/db/src/seed.ts`), so this only ever shows the shelter-declared
 * label in practice until real registry data exists.
 */
export function vaccinationRow(vaccination: VaccinationStatus): MedicalRow {
  if (vaccination.state === "unknown") {
    return {
      label: uk.medical.vaccination,
      statusText: uk.medical.unknown,
      barClassName: "bg-rg-fill-strong",
    };
  }
  if (vaccination.state === "in_progress") {
    return {
      label: uk.medical.vaccination,
      statusText: uk.medical.inProgress,
      barClassName: "bg-rg-ink-3",
    };
  }
  // confirmed
  if (vaccination.source === "registry") {
    return {
      label: uk.medical.rabies,
      statusText: uk.medical.registry,
      barClassName: "bg-rg-registry",
    };
  }
  return {
    label: uk.medical.vaccination,
    statusText: uk.medical.shelterDeclared,
    barClassName: "bg-rg-ink-3",
  };
}

/** `SpayNeuterStatus` is shelter-declared only — see that schema's own comment for why. */
export function spayNeuterRow(spayNeuter: SpayNeuterStatus): MedicalRow {
  if (spayNeuter.state === "unknown") {
    return {
      label: uk.medical.spayNeuter,
      statusText: uk.medical.unknown,
      barClassName: "bg-rg-fill-strong",
    };
  }
  if (spayNeuter.state === "in_progress") {
    return {
      label: uk.medical.spayNeuter,
      statusText: uk.medical.inProgress,
      barClassName: "bg-rg-ink-3",
    };
  }
  return {
    label: uk.medical.spayNeuter,
    statusText: uk.medical.shelterDeclared,
    barClassName: "bg-rg-ink-3",
  };
}
