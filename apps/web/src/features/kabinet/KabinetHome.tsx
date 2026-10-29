import type { KabinetShelterView } from "@opika/contracts";
import { fillTemplate, uk } from "@opika/i18n";
import { type OperatorName, standaloneOperatorName } from "../../kabinet/operator";
import { LinkButton } from "../../ui/Button";
import { Heading } from "../../ui/Heading";
import { MAIN_LANDMARK } from "../../ui/landmark";
import { Panel } from "../../ui/Panel";
import { Text } from "../../ui/Text";
import { staleLineOf } from "./animal-list/list-model";
import { KabinetBrand, KabinetMark } from "./KabinetBrand";
import { KabinetNav } from "./KabinetNav";
import { PausedStatus } from "./profile-edit/PausedStatus";
import { ANIMAL_LIST_PATH, NEW_ANIMAL_PATH } from "./routes";
import { SignOutButton } from "./SignOutButton";
import { SupportBanner } from "./SupportBanner";
import { VerificationDecision } from "./VerificationDecision";

/**
 * Головна (kabinet redesign Phase 2 PR 1 - the research proposal's new
 * landing page, `Claude outputs\KABINET-IA-2026-10-28.md` §4): what needs
 * attention, ahead of anything else. It replaces K4's profile editor as
 * `SHELTER_HOME`'s content; the profile editor moved to its own path
 * (`ShelterProfile`, now served at `SHELTER_PROFILE_PATH`).
 *
 * Every number and notice here is read, not recomputed: `draftCount` and
 * `staleCount` are the exact fields `shelter.animals.list` already returns
 * for K2's own chip counts and stale strip, and `view.verification` is the
 * exact field K4's locked block and `VerificationDecision` already read. No
 * new data, no new procedure - a composition of what K2 and K4 already show,
 * surfaced on the page a volunteer lands on first.
 *
 * The rejected/suspended notice and the pending-review note moved here from
 * K4 (`ShelterProfile`): "what needs attention" belongs on the landing page,
 * not on the page that edits the shelter's own data. The paused banner is
 * shown here too, alongside (not instead of) K4's pause/resume control, which
 * still carries the same fact where the shelter acts on it.
 *
 * **Data and structure hierarchy (owner's direction, 2026-10-28), applied
 * here rather than carried over unexamined from the Phase 1 proposal's own
 * screen-content list:**
 *
 * - **Order, top to bottom:** the shelter-wide status (rejected / suspended /
 *   pending-review / paused - mutually exclusive, so at most one of these
 *   three blocks renders) comes first, because it governs whether anything
 *   else on the page even matters: a rejected or paused shelter has nothing
 *   visible to the public regardless of what else is true. Below it, **stale
 *   cards outrank drafts** - a stale card is already public and quietly
 *   losing the trust its freshness marker exists to protect; a draft isn't
 *   public at all yet, so it's an opportunity, not a live problem. (The
 *   Phase 1 doc listed drafts before stale, incidentally, not on this
 *   reasoning - revised here.) «Додати тварину» is last: it's the one
 *   always-available action, not a state that needs resolving, so it reads
 *   as a standing invitation rather than competing with the things that do.
 * - **Weight:** the shelter-wide status block takes the kit's `title` heading
 *   (`VerificationDecision`'s own, and the pending/paused headings below) -
 *   visibly larger than the routine `body-l` headings of the stale and draft
 *   cards, since it is categorically more serious. No colour carries this (the
 *   product's "never alarming" rule): size, order and position alone.
 */

export type KabinetHomeProps = {
  view: KabinetShelterView;
  viewer: "admin" | "support";
  operator: OperatorName;
  draftCount: number;
  staleCount: number;
  /** Whether K2 is reachable at all for this viewer (P1): gates the nav's «Тварини» and these two cards' links. */
  animalListShown: boolean;
  /** The same `editable` K2 and K3 compute: gates the «Додати тварину» shortcut. */
  canWrite: boolean;
};

export function KabinetHome({
  view,
  viewer,
  operator,
  draftCount,
  staleCount,
  animalListShown,
  canWrite,
}: KabinetHomeProps) {
  const profile = uk.kabinet.profile;
  const list = uk.kabinet.animalList;
  const support = viewer === "support";
  const pending =
    view.verification.status === "pending" || view.verification.status === "under_review";

  return (
    <div
      className={
        support ? "min-h-dvh outline-4 -outline-offset-4 outline-ink outline-solid" : "min-h-dvh"
      }
    >
      {support ? <SupportBanner shelterName={view.displayName} /> : null}

      <header className="flex min-h-16 items-center gap-3 bg-surface px-4 desktop:gap-5 desktop:px-8">
        {/* Phone: the mark and the page's short name; desktop: the brand row (same pattern as K4/K2). */}
        <span className="flex items-center gap-2 desktop:hidden">
          <KabinetMark />
          <span className="text-body-l font-bold text-ink">{uk.kabinet.nav.home}</span>
        </span>
        <span className="hidden desktop:block">
          <KabinetBrand />
        </span>
        <span aria-hidden="true" className="hidden h-7 w-px bg-line desktop:block" />
        <span className="hidden text-label text-ink desktop:block">{view.displayName}</span>
        <div className="flex-1" />
        <span className="hidden text-body text-ink-2 desktop:block">
          {support ? uk.kabinet.support.viewingAs : profile.role}
        </span>
        {support ? (
          <span className="text-body text-ink-2">{uk.kabinet.support.signOutDisabled}</span>
        ) : (
          <SignOutButton />
        )}
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-5 pb-24 tablet:px-6 desktop:flex-row desktop:items-start desktop:gap-8 desktop:px-8 desktop:pt-8 desktop:pb-14">
        {/* Bottom padding above clears the nav's fixed mobile tab bar; unused at desktop width. */}
        <KabinetNav current="home" animalList={animalListShown} />

        <main {...MAIN_LANDMARK} className="flex min-w-0 flex-1 flex-col gap-4 desktop:gap-6">
          <Heading level={1} look="display-l" className="sr-only desktop:not-sr-only">
            {uk.kabinet.nav.home}
          </Heading>

          {/*
            Tier 1, at most one of these three: the shelter-wide status.
            K5 (RU-Q7), moved from K4: a rejected or suspended shelter reads
            why, with `VerificationDecision`'s own title-weight heading.
          */}
          <VerificationDecision
            verification={view.verification}
            operatorName={standaloneOperatorName(operator)}
          />

          {/* G3 (audit 2026-10-22), moved from K4: not for the support view, where «я» would be the operator speaking to themselves. */}
          {!support && pending ? (
            <Panel
              as="section"
              tone="outline"
              padding="lg"
              aria-labelledby="home-pending"
              className="flex flex-col gap-4"
            >
              <Heading level={2} look="title" id="home-pending">
                {uk.kabinet.profileStatus[view.verification.status as "pending" | "under_review"]}
              </Heading>
              <Text>{profile.pendingNote}</Text>
            </Panel>
          ) : null}

          {view.verification.status === "paused" ? (
            <Panel
              as="section"
              tone="outline"
              padding="lg"
              aria-labelledby="home-paused"
              className="flex flex-col gap-4"
            >
              <Heading level={2} look="title" id="home-paused">
                {uk.kabinet.profileStatus.paused}
              </Heading>
              <PausedStatus since={view.verification.since} reason={view.verification.reason} />
            </Panel>
          ) : null}

          {/* Tier 2, routine: stale before drafts (already-public cards losing trust outrank unfinished ones). */}
          {animalListShown && staleCount > 0 ? (
            <Panel
              as="section"
              tone="outline"
              padding="lg"
              aria-labelledby="home-stale"
              className="flex flex-col items-start gap-4"
            >
              <Heading level={2} look="body-l" id="home-stale">
                {staleLineOf(staleCount)}
              </Heading>
              <LinkButton href={ANIMAL_LIST_PATH} variant="secondary">
                {list.title}
              </LinkButton>
            </Panel>
          ) : null}

          {animalListShown && draftCount > 0 ? (
            <Panel
              as="section"
              tone="outline"
              padding="lg"
              aria-labelledby="home-drafts"
              className="flex flex-col items-start gap-4"
            >
              <Heading level={2} look="body-l" id="home-drafts">
                {fillTemplate(list.filter.withCount, {
                  label: list.filter.draft,
                  count: String(draftCount),
                })}
              </Heading>
              <LinkButton href={ANIMAL_LIST_PATH} variant="secondary">
                {list.title}
              </LinkButton>
            </Panel>
          ) : null}

          {/* The one standing, always-available action, last: not a state to resolve. */}
          {canWrite ? (
            <LinkButton href={NEW_ANIMAL_PATH} className="self-start">
              {list.add}
            </LinkButton>
          ) : null}
        </main>
      </div>
    </div>
  );
}
