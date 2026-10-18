import type { KabinetShelterView } from "@opika/contracts";
import { uk } from "@opika/i18n";
import {
  inSentenceOperatorName,
  type OperatorName,
  standaloneOperatorName,
} from "../../kabinet/operator";
import type { ProfileEditing } from "./home";
import { KabinetBrand, KabinetMark } from "./KabinetBrand";
import { KabinetNav } from "./KabinetNav";
import { CAPTION, CARD, CARD_TITLE, channelValue, LockedBlock, Row } from "./ProfileParts";
import { PausedStatus } from "./profile-edit/PausedStatus";
import { ProfileEditor } from "./profile-edit/ProfileEditor";
import { animalListShownTo } from "./routes";
import { SignOutButton } from "./SignOutButton";
import { SupportBanner } from "./SupportBanner";
import { AllowlistedShelterArea } from "./test-shelter-only/AllowlistedShelterArea";
import { VerificationDecision } from "./VerificationDecision";

/**
 * The read-only "your shelter" page (KS-Q1, Oleksii: "A"; mock
 * `Opika Kabinet.dc.html`, «K4 Профіль притулку» 1440 and 360). K4's sections
 * in K4's order (contacts and fundraising, then the shelter's voice and the
 * block set during verification), with every value a label–value row: the
 * pattern K4 already uses for its locked block (N10), so nothing on the page
 * looks editable. No inputs, no Save bar, and no view or inquiry counts in any
 * form (commitment #2; KABINET K4: «Немає статистики переглядів чи запитів»).
 *
 * The dashed border stays on the verification block only: in the design it
 * means "not yours to edit" (K4's note), which is true of the verified
 * details but not of contacts, which the shelter will edit once editing
 * ships. In support mode (S5) the same page sits under the support banner.
 *
 * **K4 editing** (PR 2 of the K milestone): when `editing` is `open`, which
 * `kabinetHomeOf` decides with the router's own `decideAccess` and write
 * policy, the sections become K4's editor (`ProfileEditor`). Otherwise, for a
 * support view and for every shelter outside the K-Q17 allowlist until PR 6,
 * this stays the read-only page, unchanged, so it never offers a change the
 * API would refuse.
 */

export type ShelterProfileProps = {
  view: KabinetShelterView;
  cityName: string | null;
  viewer: "admin" | "support";
  /**
   * Who the operator is (RS-Q2), configured or not. Two places name them in
   * two forms: the verification block's note puts the name mid-sentence
   * (`inSentenceOperatorName`, so an unset name reads in lower case there),
   * and the decision's signature stands alone (`standaloneOperatorName`, as
   * both emails sign).
   */
  operator: OperatorName;
  /** K4: `read_only` unless the page's access decision opened writes. */
  editing?: ProfileEditing;
};

export function ShelterProfile({
  view,
  cityName,
  viewer,
  operator,
  editing = { kind: "read_only" },
}: ShelterProfileProps) {
  const t = uk.kabinet.profile;
  const operatorName = inSentenceOperatorName(operator);
  const notRecorded = uk.kabinet.profileNotRecorded;
  const support = viewer === "support";

  return (
    <div
      className={
        support ? "min-h-dvh outline-4 -outline-offset-4 outline-rg-ink outline-solid" : "min-h-dvh"
      }
    >
      {support ? <SupportBanner shelterName={view.displayName} /> : null}

      <header className="flex min-h-16 items-center gap-3 bg-rg-surface px-4 desktop:min-h-[72px] desktop:gap-5 desktop:px-8">
        {/* Phone (K4 360): the mark and the page's short name; desktop (K4 1440): the brand row. */}
        <span className="flex items-center gap-2 desktop:hidden">
          <KabinetMark />
          <span className="text-[19px] leading-6 font-bold tracking-[-0.02em] text-rg-ink">
            {t.phoneTitle}
          </span>
        </span>
        <span className="hidden desktop:block">
          <KabinetBrand />
        </span>
        <span aria-hidden="true" className="hidden h-7 w-px bg-rg-page desktop:block" />
        <span className="hidden text-[15px] leading-[22px] font-medium text-rg-ink desktop:block">
          {view.displayName}
        </span>
        <div className="flex-1" />
        <span className="hidden text-[15px] leading-[22px] text-rg-ink-3 desktop:block">
          {support ? uk.kabinet.support.viewingAs : t.role}
        </span>
        {support ? (
          <span className="text-[15px] leading-[22px] text-rg-ink-3">
            {uk.kabinet.support.signOutDisabled}
          </span>
        ) : (
          <SignOutButton />
        )}
      </header>

      <div className="flex flex-col gap-3 px-4 pt-5 pb-6 desktop:flex-row desktop:items-start desktop:gap-8 desktop:px-8 desktop:pt-8 desktop:pb-14">
        {/*
          K4's side nav: «Тварини» (K2, PR 5) where the list is shown to this
          viewer (P1: writes open, or the support view), and «Профіль
          притулку». The list is K3's entry point now («Додати тварину»), so
          the «Нова тварина» link that stood in for it here until PR 5 is gone
          (decision taken, reversible).
        */}
        <KabinetNav current="profile" animalList={animalListShownTo(viewer, editing)} />

        <main className="flex min-w-0 max-w-[1080px] flex-1 flex-col gap-3 desktop:gap-6">
          <div className="flex flex-col gap-1">
            {/* K4 360 shows neither: the header names the page there. The heading stays for screen readers. */}
            <h1 className="sr-only desktop:not-sr-only desktop:text-[44px] desktop:leading-[46px] desktop:font-bold desktop:tracking-[-0.035em] desktop:text-rg-ink">
              {t.title}
            </h1>
            <p className={`hidden desktop:block ${CAPTION}`}>{t.intro}</p>
          </div>

          {/* K5 (RU-Q7): a rejected or suspended shelter reads why, for its admins and the support view alike. */}
          <VerificationDecision
            verification={view.verification}
            operatorName={standaloneOperatorName(operator)}
          />

          {editing.kind === "open" && !support ? (
            <ProfileEditor
              initialView={view}
              cityName={cityName}
              operatorName={operatorName}
              previewAnimal={editing.previewAnimal}
              donationDeclined={editing.donationDeclined}
            />
          ) : (
            <div className="grid grid-cols-1 items-start gap-3 desktop:grid-cols-2 desktop:gap-4">
              <div className="flex flex-col gap-3 desktop:gap-4">
                <section aria-labelledby="kabinet-contacts" className={CARD}>
                  <h2 id="kabinet-contacts" className={CARD_TITLE}>
                    {t.contactsTitle}
                  </h2>
                  <dl className="flex flex-col gap-3 tablet:gap-0">
                    {[view.contact.primary, ...view.contact.additional].map((channel, index) => (
                      <Row
                        key={`${channel.kind}-${index}`}
                        label={uk.kabinet.profileChannel[channel.kind]}
                      >
                        {channelValue(channel)}
                      </Row>
                    ))}
                  </dl>
                  <p className={CAPTION}>{t.contactsNote}</p>
                </section>

                <section aria-labelledby="kabinet-donation" className={CARD}>
                  <h2 id="kabinet-donation" className={CARD_TITLE}>
                    {t.donationTitle}
                  </h2>
                  <dl className="flex flex-col gap-3 tablet:gap-0">
                    <Row label={t.donationLink}>{view.donation?.url ?? notRecorded}</Row>
                    {view.pendingDonation !== null ? (
                      <Row label={t.donationPending}>{view.pendingDonation.link.url}</Row>
                    ) : null}
                  </dl>
                  <p className={CAPTION}>{t.donationNote}</p>
                </section>
              </div>

              <div className="flex flex-col gap-3 desktop:gap-4">
                <section aria-labelledby="kabinet-voice" className={CARD}>
                  <h2 id="kabinet-voice" className={CARD_TITLE}>
                    {t.voiceTitle}
                  </h2>
                  <dl className="flex flex-col gap-3 tablet:gap-0">
                    <Row label={t.voiceLabel}>{view.freshnessSentence?.uk ?? notRecorded}</Row>
                  </dl>
                  <p className={CAPTION}>{t.voiceNote}</p>
                </section>

                <LockedBlock view={view} cityName={cityName} operatorName={operatorName} />
                {/* K4-B4, answer 2: the pause note, for this shelter's admins and the support view. */}
                {view.verification.status === "paused" ? (
                  <section aria-label={uk.kabinet.profileStatus.paused} className={CARD}>
                    <PausedStatus
                      since={view.verification.since}
                      reason={view.verification.reason}
                    />
                  </section>
                ) : null}
              </div>
            </div>
          )}
          {/* CG-Q1: copy that may still be pending, for the allowlisted shelter's own admin only. */}
          {editing.kind === "open" && editing.grantedBy === "allowlist" && !support ? (
            <AllowlistedShelterArea />
          ) : null}
        </main>
      </div>
    </div>
  );
}
