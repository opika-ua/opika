import { funnelRepo, registrationFactsRepo, type ShelterRegistrationFacts } from "@opika/db/repos";
import {
  earlyListingOf,
  type FunnelEventKind,
  lifecycleOf,
  type Shelter,
  type ShelterId,
  type ShelterLifecycle,
} from "@opika/domain";
import type { KabinetContext } from "../context";
import { errorClassNameOf } from "../error-class-name";

type Deps = Pick<KabinetContext, "db" | "now">;

/** Where the shelter stands (`lifecycleOf`) and how it came to be, read together for the gates. */
export type ShelterStage = { lifecycle: ShelterLifecycle; registration: ShelterRegistrationFacts };

export async function shelterStageOf(deps: Deps, shelter: Shelter): Promise<ShelterStage> {
  const registration = await registrationFactsRepo(deps.db).of(shelter.id);
  if (registration === null) throw new Error(`Scope names missing shelter ${shelter.id}`);
  // An operator-created shelter has no registrant; its lifecycle never reads the email.
  const email = registration.source === "self_registration" ? registration.email : "confirmed";
  const lifecycle = lifecycleOf(
    shelter.verification,
    earlyListingOf(shelter.earlyListingSince),
    email,
    deps.now,
  );
  return { lifecycle, registration };
}

/**
 * A funnel step (§8) for a self-registered shelter only: an operator-created one never entered the
 * funnel, so its drafts would count without a `registered`. Never fails the shelter's own action.
 */
export async function recordFunnelStep(
  deps: Deps,
  registration: ShelterRegistrationFacts,
  kind: FunnelEventKind,
  shelterId: ShelterId,
): Promise<void> {
  if (registration.source !== "self_registration") return;
  try {
    await funnelRepo(deps.db).record(kind, shelterId, deps.now);
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: the reason-code line is the only trace of a lost step
    console.error({ event: "funnel_record_failed", kind, error: errorClassNameOf(error) });
  }
}
