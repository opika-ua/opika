"use client";

import { uk } from "@opika/i18n";
import { useState } from "react";
import { Button } from "../../../controls/controls";
import { useOperatorActions } from "./operator-actions";
import { NOTICE } from "./styles";

const OWNER = "support";

/**
 * Where entering support lands: the shelter's own `/kabinet`, which renders
 * the S5 support view (banner, frame, read-only) for the support session the
 * call just opened. Leaving it returns to the list (`SupportBanner`).
 */
export const SUPPORT_VIEW_PATH = "/kabinet";

/**
 * «Переглянути як притулок · лише читання» on S4 (RU-Q5, answer 5): opens a
 * read-only support session for this shelter (`registry.support.enter`,
 * which sets its own cookie), then a full navigation to `/kabinet`, so the
 * server reads that cookie and shows the shelter's cabinet exactly as its
 * admin sees it. Every write inside is refused by the access matrix.
 *
 * S4 is never read again around this call: with the support cookie set,
 * this browser's operator is a support view, which S4's guard answers with
 * 404. For the same reason a lost answer navigates too: the session lives in
 * a cookie, not in the record, so only `/kabinet` can tell. With the session
 * open it shows the support view; without one the operator lands on the list
 * (`/kabinet` redirects a super_admin there), and nothing claims either.
 *
 * rebase: mount on S4, in the header (KABINET S4: "Header actions").
 */
export function SupportEntry() {
  const { view, phase, run, navigate } = useOperatorActions();
  const t = uk.kabinet.operator;
  const [failed, setFailed] = useState(false);
  const busy = phase.kind !== "idle";
  const mine = busy && phase.owner === OWNER;

  const enter = async () => {
    if (busy) return;
    setFailed(false);
    const settled = await run({
      owner: OWNER,
      call: (client) => client.registry.support.enter({ shelterId: view.id }),
      landed: () => false,
      rereads: false,
    });
    if (settled.kind === "busy") return;
    if (settled.kind === "ok" || settled.kind === "lost") {
      navigate(SUPPORT_VIEW_PATH);
      return;
    }
    setFailed(true);
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        aria-disabled={busy || undefined}
        aria-busy={mine || undefined}
        onClick={enter}
      >
        {t.support.enter}
      </Button>
      {failed ? (
        <p role="alert" className={NOTICE}>
          {t.errors.failed}
        </p>
      ) : null}
    </div>
  );
}
