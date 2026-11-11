"use client";

import "../../../zod-client-config";
import type { KabinetShelterView } from "@opika/contracts";
import { uk } from "@opika/i18n";
import { useCallback, useRef, useState } from "react";
import {
  type KabinetProfileClient,
  kabinetProfileBrowserClient,
} from "../../../api/kabinet-browser-client";
import { Tabs } from "../../../ui/Tabs";
import { Text } from "../../../ui/Text";
import { LockedBlock } from "../ProfileParts";
import { publicShelterPath } from "../routes";
import { PageSave, PageSaveStatus } from "../shared/page-save";
import { runWrite } from "../shared/write-result";
import { AboutSection } from "./AboutSection";
import { ContactsSection } from "./ContactsSection";
import { DonationSection } from "./DonationSection";
import type { DonationOutcome } from "./donation-outcome";
import { useReportVerification } from "./LiveVerificationStatus";
import { LogoSection } from "./LogoSection";
import { PauseControl } from "./PauseControl";
import { type ProfileTab, profileTabOf } from "./profile-tabs";

/** Which tab holds each section that can refuse a save, so a refusal shows the tab it is on. */
const SECTION_TAB: Record<string, ProfileTab> = { contacts: "kontakty", about: "profil" };

/**
 * K4 with writes open for this shelter (the page decided, with the router's own `decideAccess`
 * and policy), as sub-tabs: Профіль (logo, the text about the shelter, pause), Контакти, Збір коштів, Перевірка
 * (read-only). The tab is addressable as `?tab=` and kept in the URL
 * without a navigation; every panel stays mounted, so an unsaved edit survives a tab switch.
 *
 * Holds the one shelter view all sections share: each write answers with the new view, whose
 * `version` the next compare-and-set write sends, so the page's single save bar, which saves the
 * dirty sections one after another, never trips over its own version bump (`versionRef` is read
 * at call time, not captured at render).
 */
export function ProfileEditor({
  initialView,
  cityName,
  operatorName,
  donationOutcome,
  initialTab = "profil",
  client = kabinetProfileBrowserClient,
}: {
  initialView: KabinetShelterView;
  cityName: string | null;
  operatorName: string;
  donationOutcome: DonationOutcome;
  initialTab?: ProfileTab;
  client?: KabinetProfileClient;
}) {
  const [view, setView] = useState(initialView);
  useReportVerification(view.verification.status);
  const versionRef = useRef(initialView.version);
  const [tab, setTab] = useState<ProfileTab>(initialTab);
  const profile = client.shelter.profile;
  const t = uk.kabinet.profileTabs;

  const show = useCallback((next: ProfileTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "profil") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const adopt = useCallback((next: KabinetShelterView) => {
    versionRef.current = next.version;
    setView(next);
  }, []);

  const write = useCallback(
    async (call: () => Promise<KabinetShelterView>) => {
      const result = await runWrite(call);
      if (result.kind === "ok") adopt(result.view);
      return result;
    },
    [adopt],
  );

  const reload = useCallback(async (): Promise<KabinetShelterView | null> => {
    try {
      const next = await profile.get({});
      adopt(next);
      return next;
    } catch {
      return null;
    }
  }, [profile, adopt]);

  const panels = [
    {
      id: "profil",
      label: t.profile,
      panel: (
        <div className="flex flex-col gap-4 desktop:gap-6">
          <Text look="hint">{t.profileNote}</Text>
          <LogoSection
            logo={view.logo}
            displayName={view.displayName}
            onView={adopt}
            client={client}
          />
          <AboutSection
            description={view.description}
            save={(description) =>
              write(() =>
                profile.updateDescription({
                  description,
                  expectedVersion: versionRef.current,
                }),
              )
            }
            reload={reload}
          />
          <PauseControl
            verification={view.verification}
            pause={(reason) => write(() => profile.pause({ reason }))}
            resume={() => write(() => profile.resume({}))}
          />
        </div>
      ),
    },
    {
      id: "kontakty",
      label: uk.kabinet.profile.contactsTitle,
      panel: (
        <ContactsSection
          contact={view.contact}
          save={(contact) =>
            write(() => profile.updateContact({ contact, expectedVersion: versionRef.current }))
          }
          reload={reload}
        />
      ),
    },
    {
      id: "zbir",
      label: uk.kabinet.profile.donationTitle,
      panel: (
        <DonationSection
          donation={view.donation}
          pendingDonation={view.pendingDonation}
          outcome={donationOutcome}
          status={view.verification.status}
          propose={(url) => write(() => profile.proposeDonation({ url }))}
          cancel={() => write(() => profile.cancelDonationProposal({}))}
        />
      ),
    },
    {
      id: "perevirka",
      label: t.verification,
      panel: <LockedBlock view={view} cityName={cityName} operatorName={operatorName} />,
    },
  ];

  return (
    <PageSave
      onProblem={(id) => show(SECTION_TAB[id] ?? "profil")}
      viewHref={publicShelterPath(view.id)}
    >
      <Tabs
        look="underline"
        label={t.label}
        tabs={panels}
        selectedId={tab}
        onSelect={(id) => show(profileTabOf(id))}
      />
      {/* The quiet «Усі зміни збережено» is read out, not drawn: the save bar carries the saved state. */}
      <PageSaveStatus srOnly />
    </PageSave>
  );
}
