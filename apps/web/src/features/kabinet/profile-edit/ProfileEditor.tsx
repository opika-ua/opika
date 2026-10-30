"use client";

import type { KabinetShelterView } from "@opika/contracts";
import { uk } from "@opika/i18n";
import { type ReactNode, useCallback, useRef, useState } from "react";
import {
  type KabinetProfileClient,
  kabinetProfileBrowserClient,
} from "../../../api/kabinet-browser-client";
import { Heading } from "../../../ui/Heading";
import { Tabs } from "../../../ui/Tabs";
import { Text } from "../../../ui/Text";
import { LockedBlock } from "../ProfileParts";
import { publicShelterPath } from "../routes";
import { ContactsSection } from "./ContactsSection";
import { DonationSection } from "./DonationSection";
import { LogoSection } from "./LogoSection";
import { PauseControl } from "./PauseControl";
import { PageSave } from "./page-save";
import { VoiceSection } from "./VoiceSection";
import { runWrite } from "./write-result";

/** The sub-tabs and their `?tab=` values (Latin slugs, like the routes). The first is the default. */
export const PROFILE_TABS = ["profil", "kontakty", "zbir", "perevirka", "akaunt"] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];
export const profileTabOf = (raw: string | undefined): ProfileTab =>
  PROFILE_TABS.find((tab) => tab === raw) ?? "profil";

/** Which tab holds each section that can refuse a save, so a refusal shows the tab it is on. */
const SECTION_TAB: Record<string, ProfileTab> = { contacts: "kontakty", voice: "profil" };

/**
 * K4 with writes open for this shelter (the page decided, with the router's own `decideAccess`
 * and policy), as sub-tabs: Профіль (logo, the sentence), Контакти, Збір коштів, Перевірка
 * (read-only), Акаунт (pause, password). The tab is addressable as `?tab=` and kept in the URL
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
  donationDeclined,
  initialTab = "profil",
  account = null,
  client = kabinetProfileBrowserClient,
}: {
  initialView: KabinetShelterView;
  cityName: string | null;
  operatorName: string;
  donationDeclined: boolean;
  initialTab?: ProfileTab;
  /** The password card, rendered in the Акаунт tab (the page decides whether there is one). */
  account?: ReactNode;
  client?: KabinetProfileClient;
}) {
  const [view, setView] = useState(initialView);
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
          <div className="flex flex-col gap-1">
            <Heading level={2} look="title">
              {t.profile}
            </Heading>
            <Text look="hint">{t.profileNote}</Text>
          </div>
          <LogoSection
            logo={view.logo}
            displayName={view.displayName}
            onView={adopt}
            client={client}
          />
          <VoiceSection
            sentence={view.freshnessSentence}
            save={(freshnessSentence) =>
              write(() =>
                profile.updateFreshnessSentence({
                  freshnessSentence,
                  expectedVersion: versionRef.current,
                }),
              )
            }
            reload={reload}
            viewHref={publicShelterPath(view.id)}
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
          viewHref={publicShelterPath(view.id)}
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
          declined={donationDeclined}
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
    {
      id: "akaunt",
      label: t.account,
      panel: (
        <div className="flex flex-col gap-4 desktop:gap-6">
          <PauseControl
            verification={view.verification}
            pause={(reason) => write(() => profile.pause({ reason }))}
            resume={() => write(() => profile.resume({}))}
          />
          {account}
        </div>
      ),
    },
  ];

  return (
    <PageSave onProblem={(id) => show(SECTION_TAB[id] ?? "profil")}>
      <Tabs
        look="pills"
        label={t.label}
        tabs={panels}
        selectedId={tab}
        onSelect={(id) => show(profileTabOf(id))}
      />
    </PageSave>
  );
}
