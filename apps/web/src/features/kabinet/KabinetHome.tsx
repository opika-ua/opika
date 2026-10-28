import type { KabinetShelterView } from "@opika/contracts";
import { fillTemplate, uk } from "@opika/i18n";
import { type OperatorName, standaloneOperatorName } from "../../kabinet/operator";
import { buttonClass } from "../controls/controls";
import { staleLineOf } from "./animal-list/list-model";
import { KabinetBrand, KabinetMark } from "./KabinetBrand";
import { KabinetNav } from "./KabinetNav";
import { PausedStatus } from "./profile-edit/PausedStatus";
import { BODY, CARD, CARD_TITLE, PAGE_TITLE, STRONG } from "./profile-edit/styles";
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
 * - **Weight:** the shelter-wide status block takes `PAGE_TITLE`'s size
 *   (`VerificationDecision`'s own heading, and this component's own
 *   pending/paused headings below) - visibly larger than the routine
 *   `CARD_TITLE` cards for drafts and stale, since it is categorically more
 *   serious (it is never merely informational the way a draft count is).
 *   No colour carries this (the product's "never alarming" rule), so the
 *   distinction is made by size, order and position alone.
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
        support ? "min-h-dvh outline-4 -outline-offset-4 outline-rg-ink outline-solid" : "min-h-dvh"
      }
    >
      {support ? <SupportBanner shelterName={view.displayName} /> : null}

      <header className="flex min-h-16 items-center gap-3 bg-rg-surface px-4 desktop:min-h-[72px] desktop:gap-5 desktop:px-8">
        {/* Phone: the mark and the page's short name; desktop: the brand row (same pattern as K4/K2). */}
        <span className="flex items-center gap-2 desktop:hidden">
          <KabinetMark />
          <span className="text-[19px] leading-6 font-bold tracking-[-0.02em] text-rg-ink">
            {uk.kabinet.nav.home}
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
          {support ? uk.kabinet.support.viewingAs : profile.role}
        </span>
        {support ? (
          <span className="text-[15px] leading-[22px] text-rg-ink-3">
            {uk.kabinet.support.signOutDisabled}
          </span>
        ) : (
          <SignOutButton />
        )}
      </header>

      <div className="flex flex-col gap-3 px-4 pt-5 pb-24 desktop:flex-row desktop:items-start desktop:gap-8 desktop:px-8 desktop:pt-8 desktop:pb-14">
        {/* Bottom padding above clears the nav's fixed mobile tab bar; unused at desktop width. */}
        <KabinetNav current="home" animalList={animalListShown} />

        <main className="flex min-w-0 max-w-[1080px] flex-1 flex-col gap-3 desktop:gap-6">
          <h1 className="sr-only desktop:not-sr-only desktop:text-[44px] desktop:leading-[46px] desktop:font-bold desktop:tracking-[-0.035em] desktop:text-rg-ink">
            {uk.kabinet.nav.home}
          </h1>

          {/*
            Tier 1, at most one of these three: the shelter-wide status.
            K5 (RU-Q7), moved from K4: a rejected or suspended shelter reads
            why, with `VerificationDecision`'s own `PAGE_TITLE`-weight heading.
          */}
          <VerificationDecision
            verification={view.verification}
            operatorName={standaloneOperatorName(operator)}
          />

          {/* G3 (audit 2026-10-22), moved from K4: not for the support view, where «я» would be the operator speaking to themselves. */}
          {!support && pending ? (
            <section aria-labelledby="home-pending" className={CARD}>
              <h2 id="home-pending" className={PAGE_TITLE}>
                {uk.kabinet.profileStatus[view.verification.status as "pending" | "under_review"]}
              </h2>
              <p className={BODY}>{profile.pendingNote}</p>
            </section>
          ) : null}

          {view.verification.status === "paused" ? (
            <section aria-labelledby="home-paused" className={CARD}>
              <h2 id="home-paused" className={PAGE_TITLE}>
                {uk.kabinet.profileStatus.paused}
              </h2>
              <PausedStatus since={view.verification.since} reason={view.verification.reason} />
            </section>
          ) : null}

          {/* Tier 2, routine: stale before drafts (already-public cards losing trust outrank unfinished ones). */}
          {animalListShown && staleCount > 0 ? (
            <section aria-labelledby="home-stale" className={CARD}>
              <p id="home-stale" className={STRONG}>
                {staleLineOf(staleCount)}
              </p>
              <a href={ANIMAL_LIST_PATH} className={`self-start ${buttonClass("secondary")}`}>
                {list.title}
              </a>
            </section>
          ) : null}

          {animalListShown && draftCount > 0 ? (
            <section aria-labelledby="home-drafts" className={CARD}>
              <p id="home-drafts" className={CARD_TITLE}>
                {fillTemplate(list.filter.withCount, {
                  label: list.filter.draft,
                  count: String(draftCount),
                })}
              </p>
              <a href={ANIMAL_LIST_PATH} className={`self-start ${buttonClass("secondary")}`}>
                {list.title}
              </a>
            </section>
          ) : null}

          {/* The one standing, always-available action, last: not a state to resolve. */}
          {canWrite ? (
            <a href={NEW_ANIMAL_PATH} className={`self-start ${buttonClass("primary")}`}>
              {list.add}
            </a>
          ) : null}
        </main>
      </div>
    </div>
  );
}
