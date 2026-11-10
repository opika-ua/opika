import { fillTemplate, uk } from "@opika/i18n";
import type { SignedInPerson } from "../../../kabinet/signed-in-person";
import { Heading } from "../../../ui/Heading";
import { Panel } from "../../../ui/Panel";
import { Text } from "../../../ui/Text";
import { KabinetNav } from "../KabinetNav";
import { ShelterShell } from "../ShelterShell";
import { VerificationDecision } from "../VerificationDecision";
import { AnimalList } from "./AnimalList";
import type { KabinetAnimalListPage } from "./animal-list-page";
import { dayAndMonth } from "./list-model";

/**
 * K2's page around the list, and the shelter's landing page (kabinet UX round 2: there is no
 * Головна). The header is the kabinet's, the two-tab nav has «Тварини» current, and what Головна
 * used to say sits at the top of the list: a rejected or suspended decision with the operator's
 * note, and the pending-review note (the stale-cards strip and the pause notice are the list's own).
 */
export function AnimalListScreen({
  page,
  operatorName,
  person,
}: {
  page: Extract<KabinetAnimalListPage, { kind: "list" }>;
  /** Who signs a rejection or suspension note (`standaloneOperatorName`). */
  operatorName: string;
  person: SignedInPerson | null;
}) {
  const support = page.viewer === "support";
  const status = page.shelter.verification.status;
  const pending = status === "pending" || status === "under_review";
  const early = page.shelter.earlyListing;
  const listedUntil = pending && early.kind === "running" ? early.expiresAt : null;
  const listed = listedUntil !== null;
  // Without this line an ended period would read the same as one never allowed (gap 6).
  const endedAt = pending && early.kind === "ended" ? early.endedAt : null;
  return (
    <ShelterShell
      shelterName={page.shelter.displayName}
      viewer={page.viewer}
      person={person}
      // Only a viewer this page is shown to reaches here, so «Тварини» is always in its nav.
      nav={<KabinetNav current="animals" animalList />}
    >
      <AnimalList
        shelter={page.shelter}
        first={page.first}
        viewer={page.viewer}
        editing={page.editing}
        attention={
          <>
            <VerificationDecision
              verification={page.shelter.verification}
              operatorName={operatorName}
            />
            {/* Not for the support view, where «я» would be the operator speaking to themselves. */}
            {!support && pending ? (
              <Panel
                as="section"
                padding="lg"
                aria-labelledby="list-pending"
                className="flex flex-col gap-2"
              >
                <Heading level={2} look="title" id="list-pending">
                  {uk.kabinet.profileStatus[status as "pending" | "under_review"]}
                </Heading>
                <Text>
                  {listed ? uk.kabinet.profile.pendingNoteLead : uk.kabinet.profile.pendingNote}
                </Text>
              </Panel>
            ) : null}
            {/* The shelter may see when the period ends; the public never does (N13). */}
            {listedUntil !== null ? (
              <Panel tone="outline" padding="md">
                <Text look="label">
                  {fillTemplate(uk.kabinet.profile.earlyListingBanner, {
                    date: dayAndMonth(listedUntil),
                  })}
                </Text>
              </Panel>
            ) : null}
            {endedAt !== null ? (
              <Panel tone="outline" padding="md">
                <Text look="label">
                  {fillTemplate(uk.kabinet.profile.earlyListingEnded, {
                    date: dayAndMonth(endedAt),
                  })}
                </Text>
              </Panel>
            ) : null}
          </>
        }
      />
    </ShelterShell>
  );
}
