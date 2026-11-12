"use client";

import "../../../../zod-client-config";
import { CONFIRMATION_REMINDER_DAYS } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { useId, useState } from "react";
import { Button } from "../../../../ui/Button";
import { Heading } from "../../../../ui/Heading";
import { Panel } from "../../../../ui/Panel";
import { Text } from "../../../../ui/Text";
import { countPhrase } from "../../shared/count-phrase";
import { formatDate } from "../format";
import { useOperatorActions } from "./operator-actions";
import { NOTICE } from "./styles";

const OWNER = "weekly-reminder";

type Notice = "none" | "conflict" | "failed";

/**
 * The weekly «непідтверджені картки» email, operator's switch (`updateProfile`, `weeklyReminder`).
 * Off is what a shelter asks for by replying to the mail; the operator turns it off here, and back
 * on the same way. The version the page read goes with the write, so a stale page is a CONFLICT
 * (the runner re-reads before the notice appears), never a silent overwrite.
 */
export function ReminderPanel() {
  const { view, phase, run } = useOperatorActions();
  const t = uk.kabinet.operator.reminder;
  const id = useId();
  const [notice, setNotice] = useState<Notice>("none");
  const busy = phase.kind !== "idle";
  const mine = busy && phase.owner === OWNER;
  const offAt = view.freshnessReminderOffAt;
  const isOff = offAt !== null;

  const toggle = async () => {
    if (busy) return;
    setNotice("none");
    const wantOff = !isOff;
    const settled = await run({
      owner: OWNER,
      call: (client) =>
        client.registry.shelters.updateProfile({
          shelterId: view.id,
          expectedVersion: view.version,
          weeklyReminder: wantOff ? "off" : "on",
        }),
      viewOf: (answered) => answered,
      landed: (fresh) => (fresh.freshnessReminderOffAt !== null) === wantOff,
    });
    switch (settled.kind) {
      case "busy":
      case "ok":
        return;
      case "lost":
        if (!settled.landed) setNotice("failed");
        return;
      case "refused":
        setNotice(
          settled.failure.kind === "conflict" && settled.reread === "done" ? "conflict" : "failed",
        );
        return;
      /* v8 ignore next 4 -- exists so the compiler rejects an unhandled outcome; unreachable at runtime */
      default: {
        const unreachable: never = settled;
        return unreachable;
      }
    }
  };

  return (
    <Panel
      as="section"
      padding="lg"
      aria-labelledby={`${id}-title`}
      className="flex min-w-0 flex-col gap-3"
    >
      <Heading level={3} look="body-l" id={`${id}-title`}>
        {t.title}
      </Heading>
      <Text>
        {isOff
          ? fillTemplate(t.off, { date: formatDate(offAt) })
          : fillTemplate(t.on, {
              days: countPhrase(CONFIRMATION_REMINDER_DAYS, uk.kabinet.units.days),
            })}
      </Text>
      <div>
        <Button
          variant="secondary"
          aria-disabled={busy || undefined}
          aria-busy={mine || undefined}
          onClick={toggle}
        >
          {isOff ? t.turnOn : t.turnOff}
        </Button>
      </div>
      <p role="status" className={NOTICE}>
        {mine && phase.kind === "checking" ? uk.kabinet.operator.errors.lostAnswer : null}
      </p>
      {notice === "conflict" ? (
        <p role="alert" className={NOTICE}>
          {uk.kabinet.operator.errors.conflictReload}
        </p>
      ) : null}
      {notice === "failed" ? (
        <p role="alert" className={NOTICE}>
          {uk.kabinet.operator.errors.failed}
        </p>
      ) : null}
    </Panel>
  );
}
