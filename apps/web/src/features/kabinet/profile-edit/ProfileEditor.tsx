"use client";

import type { KabinetShelterView } from "@opika/contracts";
import { useCallback, useState } from "react";
import {
  type KabinetProfileClient,
  kabinetProfileBrowserClient,
} from "../../../api/kabinet-browser-client";
import { LockedBlock } from "../ProfileParts";
import { ContactsSection } from "./ContactsSection";
import { DonationSection } from "./DonationSection";
import { LogoSection } from "./LogoSection";
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
 * One column, in the order a shelter's admin works through it: how people reach
 * the shelter (contacts), its own words, the fundraising link, the logo, then
 * the read-only verified block and, last and quietest, pause/resume (N21).
 */
export function ProfileEditor({
  initialView,
  cityName,
  operatorName,
  donationDeclined,
  client = kabinetProfileBrowserClient,
}: {
  initialView: KabinetShelterView;
  cityName: string | null;
  operatorName: string;
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
    <div className="flex min-w-0 flex-col gap-4 desktop:gap-6">
      <ContactsSection
        contact={view.contact}
        save={(contact) =>
          write(() => profile.updateContact({ contact, expectedVersion: view.version }))
        }
        reload={reload}
      />
      <VoiceSection
        sentence={view.freshnessSentence}
        save={(freshnessSentence) =>
          write(() =>
            profile.updateFreshnessSentence({ freshnessSentence, expectedVersion: view.version }),
          )
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
      <LogoSection
        logo={view.logo}
        displayName={view.displayName}
        onView={setView}
        client={client}
      />
      <LockedBlock view={view} cityName={cityName} operatorName={operatorName} />
      <PauseControl
        verification={view.verification}
        pause={(reason) => write(() => profile.pause({ reason }))}
        resume={() => write(() => profile.resume({}))}
      />
    </div>
  );
}
