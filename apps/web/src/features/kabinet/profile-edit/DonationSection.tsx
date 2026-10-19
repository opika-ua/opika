"use client";

import type { KabinetShelterView } from "@opika/contracts";
import { fillTemplate, uk } from "@opika/i18n";
import { useId, useState } from "react";
import { Button, TextField } from "../../controls/controls";
import { linkProblem } from "./fields";
import { BODY, CAPTION, CARD, CARD_TITLE, ERROR_TEXT, INNER, OPTIONAL, STRONG } from "./styles";
import type { WriteResult } from "./write-result";

/** The host people are shown before they tap (hard constraint 5), from a link that parses. */
const hostOf = (url: string): string | null => {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};

const formatDate = (date: Date): string =>
  new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Kyiv",
  }).format(date);

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
    <section aria-labelledby={`${id}-title`} className={CARD}>
      <h2 id={`${id}-title`} className={CARD_TITLE}>
        {profile.donationTitle}
      </h2>
      <TextField
        id={`${id}-url`}
        label={
          <>
            {profile.donationLink} <span className={OPTIONAL}>{t.donation.optional}</span>
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
          <p className={CAPTION}>{t.donation.previewLabel}</p>
          {/* What the animal page shows (`AnimalDetailScreen`): a row, not a link here. */}
          <div className={`${INNER} flex flex-wrap items-center justify-between gap-2 ${STRONG}`}>
            <span>{uk.detail.donateShelter}</span>
            <span className="break-all text-rg-ink-2">
              {fillTemplate(t.donation.previewHost, { host: previewHost })}
            </span>
          </div>
        </div>
      ) : null}

      {offerPropose ? (
        <div className="flex flex-col items-start gap-2">
          <p className={CAPTION}>{t.donation.proposeNote}</p>
          {pendingDonation !== null ? <p className={CAPTION}>{t.donation.replaceNote}</p> : null}
          <Button variant="primary" aria-busy={busy || undefined} onClick={onPropose}>
            {t.donation.propose}
          </Button>
        </div>
      ) : null}

      {pendingDonation !== null ? (
        <div className={`${INNER} flex flex-col items-start gap-1`}>
          <p className={STRONG}>{t.donation.pendingTitle}</p>
          <p className={`${BODY} break-all`}>
            {fillTemplate(t.donation.pendingHost, {
              host: pendingHost ?? pendingDonation.link.url,
            })}
          </p>
          <p className={CAPTION}>
            {fillTemplate(t.donation.pendingSince, {
              date: formatDate(pendingDonation.proposedAt),
            })}
          </p>
          <Button variant="text" aria-busy={busy || undefined} onClick={onCancel}>
            {t.donation.cancelProposal}
          </Button>
        </div>
      ) : null}

      {showDeclined && pendingDonation === null ? (
        <p className={BODY}>{t.donation.declined}</p>
      ) : null}

      {/* Always in the tree, so a screen reader hears the line it gains. */}
      <p role="status" className={CAPTION}>
        {notice.kind === "proposed"
          ? t.donation.proposed
          : notice.kind === "cancelled"
            ? t.donation.cancelled
            : null}
      </p>
      {notice.kind === "failed" ? (
        <p role="alert" className={ERROR_TEXT}>
          {t.donation.failed}
        </p>
      ) : null}
    </section>
  );
}
