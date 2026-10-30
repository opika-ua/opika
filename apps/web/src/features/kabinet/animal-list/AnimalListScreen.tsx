import { uk } from "@opika/i18n";
import { Heading } from "../../../ui/Heading";
import { MAIN_LANDMARK } from "../../../ui/landmark";
import { Panel } from "../../../ui/Panel";
import { Text } from "../../../ui/Text";
import { KabinetHeader } from "../KabinetHeader";
import { KabinetNav } from "../KabinetNav";
import { SupportBanner } from "../SupportBanner";
import { VerificationDecision } from "../VerificationDecision";
import { AnimalList } from "./AnimalList";
import type { KabinetAnimalListPage } from "./animal-list-page";

/**
 * K2's page around the list, and the shelter's landing page (kabinet UX round 2: there is no
 * Головна). The header is the kabinet's, the two-tab nav has «Тварини» current, and what Головна
 * used to say sits at the top of the list: a rejected or suspended decision with the operator's
 * note, and the pending-review note (the stale-cards strip and the pause notice are the list's own).
 */
export function AnimalListScreen({
  page,
  operatorName,
}: {
  page: Extract<KabinetAnimalListPage, { kind: "list" }>;
  /** Who signs a rejection or suspension note (`standaloneOperatorName`). */
  operatorName: string;
}) {
  const support = page.viewer === "support";
  const status = page.shelter.verification.status;
  const pending = status === "pending" || status === "under_review";
  return (
    <div
      className={
        support ? "min-h-dvh outline-4 -outline-offset-4 outline-ink outline-solid" : "min-h-dvh"
      }
    >
      {support ? <SupportBanner shelterName={page.shelter.displayName} /> : null}
      <KabinetHeader shelterName={page.shelter.displayName} viewer={page.viewer} />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-5 pb-24 tablet:px-6 desktop:flex-row desktop:items-start desktop:gap-8 desktop:px-8 desktop:pt-8 desktop:pb-14">
        {/* Only a viewer this page is shown to reaches here, so «Тварини» is always in its nav. */}
        <KabinetNav current="animals" animalList />
        <main {...MAIN_LANDMARK} className="flex min-w-0 flex-1 flex-col gap-4">
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
                    <Text>{uk.kabinet.profile.pendingNote}</Text>
                  </Panel>
                ) : null}
              </>
            }
          />
        </main>
      </div>
    </div>
  );
}
