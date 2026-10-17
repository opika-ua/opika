"use client";

import type { KabinetShelterView } from "@opika/contracts";
import { useCallback, useState } from "react";
import {
  type KabinetProfileClient,
  kabinetProfileBrowserClient,
} from "../../../api/kabinet-browser-client";
import type { PreviewAnimal } from "../home";
import { LockedBlock } from "../ProfileParts";
import { ContactsSection } from "./ContactsSection";
import { DonationSection } from "./DonationSection";
import { PauseControl } from "./PauseControl";
import { VoiceSection } from "./VoiceSection";
import { runWrite } from "./write-result";

/**
 * K4 with writes open for this shelter (the page decided, with the router's
 * own `decideAccess` and policy). Holds the one shelter view all sections
 * share: each write answers with the new view, whose `version` the next
 * compare-and-set write sends, so saving contacts and then the sentence never
 * trips over its own version bump (answer 1). Each section keeps its own
 * draft; a write elsewhere changes only the version under it.
 *
 * Same layout as the read-only page (contacts and fundraising, then the voice
 * and the locked block), with pause/resume (N21) after the locked block.
 */
export function ProfileEditor({
  initialView,
  cityName,
  operatorName,
  previewAnimal,
  donationDeclined,
  client = kabinetProfileBrowserClient,
}: {
  initialView: KabinetShelterView;
  cityName: string | null;
  operatorName: string;
  previewAnimal: PreviewAnimal | null;
  donationDeclined: boolean;
  client?: KabinetProfileClient;
}) {
  const [view, setView] = useState(initialView);
  const profile = client.shelter.profile;

  const write = useCallback(async (call: () => Promise<KabinetShelterView>) => {
    const result = await runWrite(call);
    if (result.kind === "ok") setView(result.view);
    return result;
  }, []);

  const reload = useCallback(async (): Promise<KabinetShelterView | null> => {
    try {
      const next = await profile.get({});
      setView(next);
      return next;
    } catch {
      return null;
    }
  }, [profile]);

  return (
    <div className="grid grid-cols-1 items-start gap-3 desktop:grid-cols-2 desktop:gap-4">
      <div className="flex min-w-0 flex-col gap-3 desktop:gap-4">
        <ContactsSection
          contact={view.contact}
          save={(contact) =>
            write(() => profile.updateContact({ contact, expectedVersion: view.version }))
          }
          reload={reload}
        />
        <DonationSection
          donation={view.donation}
          pendingDonation={view.pendingDonation}
          declined={donationDeclined}
          propose={(url) => write(() => profile.proposeDonation({ url }))}
          cancel={() => write(() => profile.cancelDonationProposal({}))}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-3 desktop:gap-4">
        <VoiceSection
          sentence={view.freshnessSentence}
          previewAnimal={previewAnimal}
          save={(freshnessSentence) =>
            write(() =>
              profile.updateFreshnessSentence({ freshnessSentence, expectedVersion: view.version }),
            )
          }
          reload={reload}
        />
        <LockedBlock view={view} cityName={cityName} operatorName={operatorName} />
        <PauseControl
          verification={view.verification}
          pause={(reason) => write(() => profile.pause({ reason }))}
          resume={() => write(() => profile.resume({}))}
        />
      </div>
    </div>
  );
}
