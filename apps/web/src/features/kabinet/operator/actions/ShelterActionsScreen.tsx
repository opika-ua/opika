import type { BlockedAddressesView, RegistryShelterView } from "@opika/contracts";
import type { ModeratorId } from "@opika/domain";
import type { HistoryPage } from "../pages";
import { ShelterScreen } from "../ShelterScreen";
import { AdminsManager } from "./AdminsManager";
import { DecisionPanel } from "./DecisionPanel";
import { DonationDecision } from "./DonationDecision";
import { OperatorActionsRoot } from "./OperatorActionsRoot";
import { SupportEntry } from "./SupportEntry";

/**
 * S4 as the page serves it: R-UI 1's screen with R-UI 3's controls in place,
 * all under one runner (`OperatorActionsRoot`), so one request goes at a time
 * across the page and a re-read is the page rendering itself again on the
 * server through its own guard. The read-only sections keep rendering from
 * the record the page read; the controls show a write's answer at once and
 * the rest catches up with the re-read.
 *
 * rebase: R-UI 2's evidence editor goes to `DecisionPanel`'s
 * `renderEvidenceEditor`, for resubmit.
 */
export function ShelterActionsScreen({
  view,
  cityName,
  history,
  blocked,
  me,
  now,
}: {
  view: RegistryShelterView;
  cityName: string | null;
  history: HistoryPage;
  blocked: BlockedAddressesView;
  me: ModeratorId;
  now: Date;
}) {
  return (
    <OperatorActionsRoot view={view}>
      <ShelterScreen
        view={view}
        cityName={cityName}
        history={history}
        blocked={blocked}
        me={me}
        now={now}
        actions={{
          supportEntry: <SupportEntry />,
          decision: <DecisionPanel />,
          donationDecision: <DonationDecision />,
          admins: <AdminsManager now={now} />,
        }}
      />
    </OperatorActionsRoot>
  );
}
