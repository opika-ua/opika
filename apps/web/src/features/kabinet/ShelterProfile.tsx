import type { KabinetShelterView } from "@opika/contracts";
import { uk } from "@opika/i18n";
import { inSentenceOperatorName, type OperatorName } from "../../kabinet/operator";
import { buttonClass } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { FormSection } from "../../ui/FormSection";
import { Heading } from "../../ui/Heading";
import { MAIN_LANDMARK } from "../../ui/landmark";
import { Text } from "../../ui/Text";
import type { ProfileEditing } from "./home";
import { KabinetBrand } from "./KabinetBrand";
import { KabinetNav } from "./KabinetNav";
import { channelValue, Facts, LockedBlock, Row } from "./ProfileParts";
import { ChangePasswordSection, type PasswordState } from "./password/ChangePasswordSection";
import { PausedStatus } from "./profile-edit/PausedStatus";
import { ProfileEditor } from "./profile-edit/ProfileEditor";
import { animalListShownTo, SHELTER_HOME } from "./routes";
import { SignOutButton } from "./SignOutButton";
import { SupportBanner } from "./SupportBanner";

/**
 * The read-only "your shelter" page (KS-Q1, Oleksii: "A"; mock
 * `Opika Kabinet.dc.html`, «K4 Профіль притулку» 1440 and 360). K4's sections
 * in K4's order (contacts and fundraising, then the shelter's voice and the
 * block set during verification), with every value a label-value row: the
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
 * policy, the sections become K4's editor (`ProfileEditor`): for every
 * shelter's own admins since PR 6. For a support view this stays the
 * read-only page, so it never offers a change the API would refuse.
 *
 * **Kabinet redesign Phase 2, PR 4:** the shell is the animal form's (kit tokens, the brand header,
 * the side nav from desktop) and the sections are the kit's `FormSection`s. While the editor is
 * open, the tab bar is hidden below desktop: the bottom edge belongs to a section's sticky save
 * bar, and the back link to Головна above the title is the way out (the animal form's rule, PR 3).
 *
 * **Kabinet redesign Phase 2, PR 1:** this screen moved off `SHELTER_HOME`
 * to its own path (`SHELTER_PROFILE_PATH`, «Притулок» in the nav - renamed
 * from «Профіль притулку»). The rejected/suspended notice (`VerificationDecision`)
 * and the pending-review note moved to the new Головна landing page, which
 * now owns `SHELTER_HOME`: "what needs attention" belongs on the page a
 * volunteer lands on, not on the page that edits the shelter's own data.
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
  /**
   * PW-1: «Змінити пароль», for the shelter's own admin only (null in a support
   * view, whose session is the operator's: the operator never has a password).
   */
  password?: PasswordState | null;
};

export function ShelterProfile({
  view,
  cityName,
  viewer,
  operator,
  editing = { kind: "read_only" },
  password = null,
}: ShelterProfileProps) {
  const t = uk.kabinet.profile;
  const operatorName = inSentenceOperatorName(operator);
  const notRecorded = uk.kabinet.profileNotRecorded;
  const support = viewer === "support";
  const editorOpen = editing.kind === "open" && !support;
  const nav = <KabinetNav current="profile" animalList={animalListShownTo(viewer, editing)} />;

  return (
    <div
      className={
        support ? "min-h-dvh outline-4 -outline-offset-4 outline-ink outline-solid" : "min-h-dvh"
      }
    >
      {support ? <SupportBanner shelterName={view.displayName} /> : null}

      <header className="flex min-h-16 items-center gap-3 bg-surface px-4 desktop:gap-5 desktop:px-8">
        <KabinetBrand />
        <span className="hidden text-label text-ink desktop:block">{view.displayName}</span>
        <div className="flex-1" />
        <span className="hidden text-body text-ink-2 desktop:block">
          {support ? uk.kabinet.support.viewingAs : t.role}
        </span>
        {support ? (
          <span className="text-body text-ink-2">{uk.kabinet.support.signOutDisabled}</span>
        ) : (
          <SignOutButton />
        )}
      </header>

      <div
        className={`mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-5 tablet:px-6 desktop:flex-row desktop:items-start desktop:gap-8 desktop:px-8 desktop:pt-8 desktop:pb-14 ${
          editorOpen ? "pb-4" : "pb-24"
        }`}
      >
        {/*
          The shell nav: «Головна» · «Тварини» (K2, PR 5) where the list is shown to this viewer
          (P1: writes open, or the support view) · «Притулок» (this page). Bottom padding above is
          clearance for the nav's fixed mobile tab bar, unused at desktop width where the nav sits
          in the side column, and unused while the editor hides the bar.
        */}
        {editorOpen ? <div className="hidden desktop:contents">{nav}</div> : nav}

        <main
          {...MAIN_LANDMARK}
          className="flex min-w-0 max-w-176 flex-1 flex-col gap-4 desktop:gap-6"
        >
          <header className="flex flex-col gap-3">
            {editorOpen ? (
              <a
                href={SHELTER_HOME}
                className={`self-start desktop:hidden ${buttonClass("ghost")}`}
              >
                {`← ${uk.kabinet.nav.home}`}
              </a>
            ) : null}
            <Heading level={1} look="display-l" className="break-words">
              {t.title}
            </Heading>
            <Text look="hint" className="hidden tablet:block">
              {t.intro}
            </Text>
          </header>

          {editorOpen ? (
            <ProfileEditor
              initialView={view}
              cityName={cityName}
              operatorName={operatorName}
              donationDeclined={editing.donationDeclined}
            />
          ) : (
            <div className="flex min-w-0 flex-col gap-4 desktop:gap-6">
              <FormSection id="contacts" title={t.contactsTitle} description={t.contactsNote}>
                <Facts>
                  {[view.contact.primary, ...view.contact.additional].map((channel, index) => (
                    <Row
                      key={`${channel.kind}-${index}`}
                      label={uk.kabinet.profileChannel[channel.kind]}
                    >
                      {channelValue(channel)}
                    </Row>
                  ))}
                </Facts>
              </FormSection>

              <FormSection id="voice" title={t.voiceTitle} description={t.voiceNote}>
                <Facts>
                  <Row label={t.voiceLabel}>{view.freshnessSentence?.uk ?? notRecorded}</Row>
                </Facts>
              </FormSection>

              <FormSection id="donation" title={t.donationTitle}>
                <Facts>
                  <Row label={t.donationLink}>{view.donation?.url ?? notRecorded}</Row>
                  {view.pendingDonation !== null ? (
                    <Row label={t.donationPending}>{view.pendingDonation.link.url}</Row>
                  ) : null}
                </Facts>
                <Text look="hint">{t.donationNote}</Text>
              </FormSection>

              <LockedBlock view={view} cityName={cityName} operatorName={operatorName} />
              {/* K4-B4, answer 2: the pause note, for this shelter's admins and the support view. */}
              {view.verification.status === "paused" ? (
                <Card as="section" tone="outline" aria-labelledby="kabinet-paused">
                  <div className="flex flex-col gap-3 p-4 tablet:p-6">
                    <h2 id="kabinet-paused" className="sr-only">
                      {uk.kabinet.profileStatus.paused}
                    </h2>
                    <PausedStatus
                      since={view.verification.since}
                      reason={view.verification.reason}
                    />
                  </div>
                </Card>
              ) : null}
            </div>
          )}

          {password !== null && !support ? (
            <Card>
              <div className="p-4 tablet:p-6">
                <ChangePasswordSection password={password} />
              </div>
            </Card>
          ) : null}
        </main>
      </div>
    </div>
  );
}
