import type { ShelterVerification } from "@opika/domain";
import { uk } from "@opika/i18n";

type Status = ShelterVerification["status"];

/**
 * Operator screens tell «Очікує перевірки» from «На розгляді»; shelter and public surfaces say
 * «На перевірці» for both (owner, 2026-11-06), so only the operator asks for this label.
 */
export function operatorStatusLabel(status: Status): string {
  return status === "pending" || status === "under_review"
    ? uk.kabinet.operatorStatus[status]
    : uk.kabinet.profileStatus[status];
}
