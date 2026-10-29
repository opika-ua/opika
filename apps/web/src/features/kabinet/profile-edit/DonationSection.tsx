"use client";

import type { KabinetShelterView } from "@opika/contracts";
import { fillTemplate, uk } from "@opika/i18n";
import { useId, useState } from "react";
import { Button } from "../../../ui/Button";
import { FormSection } from "../../../ui/FormSection";
import { InlineStatus } from "../../../ui/feedback";
import { TextField } from "../../../ui/form";
import { Panel } from "../../../ui/Panel";
import { Text } from "../../../ui/Text";
import { formatDate } from "../ProfileParts";
import { linkProblem } from "./fields";
import { Optional } from "./Optional";
import type { WriteResult } from "./write-result";

/** The host people are shown before they tap (hard constraint 5), from a link that parses. */
const hostOf = (url: string): string | null => {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};

type Notice = { kind: "none" } | { kind: "proposed" } | { kind: "cancelled" } | { kind: "failed" };

/**
 * K4's donation link (N20): proposed, never live on save. The field starts at
 * the live link, as the mock draws it, and shows the host people would see
 * before anything is sent. «Надіслати на перевірку» is offered only once the
 * field holds a link different from the live one and from the one already
 * waiting, so there is never a button that would send nothing.
 *
 * While a proposal waits, an inner block names its host and date with
 * «Скасувати пропозицію»; the live link is untouched. Removing the live link
 * is not offered: a shelter writes to the operator for that (answer 8, no
 * string). When the newest donation line in the shelter's history is the
 * operator declining the last proposal, one neutral line says so (answer 12)
 * until the next proposal.
 */
export function DonationSection({
  donation,
  pendingDonation,
  declined,
  propose,
  cancel,
}: {
  donation: KabinetShelterView["donation"];
  pendingDonation: KabinetShelterView["pendingDonation"];
  declined: boolean;
  propose: (url: string) => Promise<WriteResult>;
  cancel: () => Promise<WriteResult>;
}) {
  const t = uk.kabinet.profileEdit;
  const profile = uk.kabinet.profile;
  const id = useId();
  const live = donation?.url ?? "";
  const [value, setValue] = useState(live);
  const [error, setError] = useState<"httpsOnly" | "notAUrl" | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>({ kind: "none" });
  const [showDeclined, setShowDeclined] = useState(declined);

  const trimmed = value.trim();
  const offerPropose =
    trimmed !== "" && trimmed !== live && trimmed !== (pendingDonation?.link.url ?? null);
  const previewHost = linkProblem(trimmed) === null ? hostOf(trimmed) : null;

  const noticeOf = (result: WriteResult, success: Notice): Notice => {
    if (result.kind === "ok") return success;
    return { kind: "failed" };
  };

  const onPropose = async () => {
    if (busy) return;
    const problem = linkProblem(trimmed);
    if (problem !== null) {
      setError(problem);
      document.getElementById(`${id}-url`)?.focus();
      return;
    }
    setError(null);
    setBusy(true);
    const result = await propose(trimmed);
    setBusy(false);
    setNotice(noticeOf(result, { kind: "proposed" }));
    if (result.kind === "ok") {
      setShowDeclined(false);
      setValue(result.view.donation?.url ?? "");
    }
  };

  const onCancel = async () => {
    if (busy) return;
    setBusy(true);
    const result = await cancel();
    setBusy(false);
    setNotice(noticeOf(result, { kind: "cancelled" }));
  };

  const pendingHost = pendingDonation === null ? null : hostOf(pendingDonation.link.url);

  return (
    <FormSection id="donation" title={profile.donationTitle}>
      <TextField
        id={`${id}-url`}
        label={
          <>
            {profile.donationLink} <Optional />
          </>
        }
        type="url"
        inputMode="url"
        autoComplete="off"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        error={error === null ? null : t.errors[error]}
        hint={<p>{profile.donationNote}</p>}
      />

      {previewHost !== null ? (
        <div className="flex flex-col gap-2">
          <Text look="hint">{t.donation.previewLabel}</Text>
          {/* What the animal page shows (`AnimalDetailScreen`): a row, not a link here. */}
          <Panel
            tone="sunken"
            className="flex flex-wrap items-center justify-between gap-2 text-label text-ink"
          >
            <span>{uk.detail.donateShelter}</span>
            <span className="break-all text-ink-2">
              {fillTemplate(t.donation.previewHost, { host: previewHost })}
            </span>
          </Panel>
        </div>
      ) : null}

      {offerPropose ? (
        <div className="flex flex-col items-start gap-2">
          <Text look="hint">{t.donation.proposeNote}</Text>
          {pendingDonation !== null ? <Text look="hint">{t.donation.replaceNote}</Text> : null}
          <Button variant="primary" status={busy ? "loading" : "idle"} onClick={onPropose}>
            {t.donation.propose}
          </Button>
        </div>
      ) : null}

      {pendingDonation !== null ? (
        <Panel tone="sunken" className="flex flex-col items-start gap-1">
          <p className="text-label text-ink">{t.donation.pendingTitle}</p>
          <Text look="body" className="break-all">
            {fillTemplate(t.donation.pendingHost, {
              host: pendingHost ?? pendingDonation.link.url,
            })}
          </Text>
          <Text look="hint">
            {fillTemplate(t.donation.pendingSince, {
              date: formatDate(pendingDonation.proposedAt),
            })}
          </Text>
          <Button variant="ghost" status={busy ? "loading" : "idle"} onClick={onCancel}>
            {t.donation.cancelProposal}
          </Button>
        </Panel>
      ) : null}

      {showDeclined && pendingDonation === null ? (
        <Text look="body">{t.donation.declined}</Text>
      ) : null}

      {/* Always in the tree, so a screen reader hears the line it gains. */}
      <p role="status" className="text-caption text-ink-2">
        {notice.kind === "proposed"
          ? t.donation.proposed
          : notice.kind === "cancelled"
            ? t.donation.cancelled
            : null}
      </p>
      {notice.kind === "failed" ? (
        <InlineStatus tone="error">{t.donation.failed}</InlineStatus>
      ) : null}
    </FormSection>
  );
}
