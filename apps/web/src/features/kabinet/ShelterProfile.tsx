import type { KabinetShelterView } from "@opika/contracts";
import { uk } from "@opika/i18n";
import { inSentenceOperatorName, type OperatorName } from "../../kabinet/operator";
import { Card } from "../../ui/Card";
import { FormSection } from "../../ui/FormSection";
import { Heading } from "../../ui/Heading";
import { Icon } from "../../ui/Icon";
import { Text } from "../../ui/Text";
import type { ProfileEditing } from "./home";
import { KabinetNav } from "./KabinetNav";
import { channelValue, Facts, LockedBlock, Row } from "./ProfileParts";
import { PausedStatus } from "./profile-edit/PausedStatus";
import { ProfileEditor } from "./profile-edit/ProfileEditor";
import { profileTabOf } from "./profile-edit/profile-tabs";
import { animalListShownTo, publicShelterPath } from "./routes";
import { ShelterShell } from "./ShelterShell";
import { VerificationStatusChip } from "./StatusChips";

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
  /** The `?tab=` of the page (the editor's sub-tab); anything unknown is the first tab. */
  tab?: string | undefined;
};

export function ShelterProfile({
  view,
  cityName,
  viewer,
  operator,
  editing = { kind: "read_only" },
  tab,
}: ShelterProfileProps) {
  const t = uk.kabinet.profile;
  const operatorName = inSentenceOperatorName(operator);
  const notRecorded = uk.kabinet.profileNotRecorded;
  const support = viewer === "support";
  const editorOpen = editing.kind === "open" && !support;
  const nav = <KabinetNav current="profile" animalList={animalListShownTo(viewer, editing)} />;

  return (
    <ShelterShell shelterName={view.displayName} viewer={viewer} nav={nav}>
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* The name alone, two lines at most, balanced; a longer one ends in an ellipsis. */}
          <Heading
            level={1}
            look="display-m"
            className="line-clamp-2 min-w-0 break-words text-balance"
          >
            {view.displayName}
          </Heading>
          <VerificationStatusChip status={view.verification.status} />
        </div>
        <a
          href={publicShelterPath(view.id)}
          target="_blank"
          rel="noopener"
          className="inline-flex min-h-target items-center gap-1 self-start rounded-field text-label text-ink underline underline-offset-4 focus-ring"
        >
          {t.viewOnSite}
          <Icon name="arrow-up-right" size="md" />
          <span className="sr-only"> {uk.kabinet.shell.newTab}</span>
        </a>
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
          initialTab={profileTabOf(tab)}
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
                <PausedStatus since={view.verification.since} reason={view.verification.reason} />
              </div>
            </Card>
          ) : null}
        </div>
      )}
    </ShelterShell>
  );
}
