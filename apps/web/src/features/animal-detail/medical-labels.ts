import type { SpayNeuterStatus, VaccinationStatus } from "@opika/domain";
import { uk } from "@opika/i18n";

/** The three words a status row can show; there is no fourth. */
export type MedicalValue = "done" | "not_done" | "unknown";

export type MedicalRow = {
  label: string;
  value: MedicalValue;
  source: "shelter" | "registry";
};

/**
 * `in_progress` reads «Не зроблено»: the card says only whether it is done. A registry-confirmed
 * vaccination in Ukraine's pet registry means rabies specifically (`attestation.ts`), so that
 * row's label switches to «Щеплення від сказу».
 */
function medicalValueOf(state: "unknown" | "in_progress" | "confirmed"): MedicalValue {
  if (state === "confirmed") return "done";
  return state === "in_progress" ? "not_done" : "unknown";
}

export function vaccinationRow(vaccination: VaccinationStatus): MedicalRow {
  if (vaccination.source === "registry") {
    return { label: uk.medical.rabies, value: "done", source: "registry" };
  }
  return {
    label: uk.medical.vaccination,
    value: medicalValueOf(vaccination.state),
    source: "shelter",
  };
}

/** `SpayNeuterStatus` is shelter-declared only - see that schema's own comment for why. */
export function spayNeuterRow(spayNeuter: SpayNeuterStatus): MedicalRow {
  return {
    label: uk.medical.spayNeuter,
    value: medicalValueOf(spayNeuter.state),
    source: "shelter",
  };
}

export const MEDICAL_VALUE_TEXT: Record<MedicalValue, string> = {
  done: uk.medical.statusDone,
  not_done: uk.medical.statusNotDone,
  unknown: uk.medical.statusUnknown,
};

/** Every row shelter-declared: one line under the rows. Any registry row: each row says its own. */
export function sharedSource(rows: readonly MedicalRow[]): string | null {
  return rows.every((row) => row.source === "shelter") ? uk.medical.sourceShelter : null;
}

export function rowSource(row: MedicalRow): string {
  return row.source === "registry" ? uk.medical.registry : uk.medical.sourceShelter;
}
