import type { KabinetShelterView } from "@opika/contracts";
import type { ShelterFacingVerification } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import type { ReactNode } from "react";

/**
 * Pieces the read-only profile and K4's editor share: the label–value row
 * and the locked block (N10). No hooks and no browser API, so the server page
 * renders them and the editor, a client component, re-renders the locked
 * block from its own state after a pause or resume changes the status chip.
 */

const ROW_LABEL =
  "text-[13px] leading-[18px] text-rg-ink-3 tablet:text-[15px] tablet:leading-[22px] tablet:text-rg-ink-2";
const ROW_VALUE = "text-[15px] leading-[22px] font-medium text-rg-ink break-words";
export const CARD = "flex flex-col gap-4 rounded-rg-card bg-rg-surface p-4 tablet:p-6";
export const CARD_TITLE = "text-[19px] leading-6 font-bold tracking-[-0.02em] text-rg-ink";
export const CAPTION = "text-[13px] leading-[18px] text-rg-ink-3";

/** One fact: label above value on the phone (K4 360), a 200px label column from tablet up (K4 1440). */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-0 tablet:grid tablet:grid-cols-[200px_minmax(0,1fr)] tablet:gap-4 tablet:py-3">
      <dt className={ROW_LABEL}>{label}</dt>
      <dd className={ROW_VALUE}>{children}</dd>
    </div>
  );
}

/**
 * Native `Intl`, never a hand-rolled month list (standing rule), as the reveal
 * dialog formats its date. Kyiv time: a date is the day it was in Ukraine,
 * whatever zone the server renders in.
 */
export const formatDate = (date: Date): string =>
  new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Kyiv",
  }).format(date);

type Channel = KabinetShelterView["contact"]["primary"];

/** A contact channel's value as a person would type or dial it. */
export const channelValue = (channel: Channel): string => {
  switch (channel.kind) {
    case "phone":
    case "viber":
      return channel.e164;
    case "email":
      return channel.address;
    case "telegram":
      return `@${channel.handle}`;
    case "website":
      return channel.url;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled channel; unreachable at runtime */
    default: {
      const unreachable: never = channel;
      return unreachable;
    }
  }
};

const statusDate = (verification: ShelterFacingVerification): Date =>
  "since" in verification ? verification.since : verification.at;

/** An EDRPOU code grouped 2·3·3, as the mock writes it («43 218 765»). */
export const groupEdrpou = (code: string): string =>
  code.length === 8 ? `${code.slice(0, 2)} ${code.slice(2, 5)} ${code.slice(5)}` : code;

/**
 * N10: what was set during verification, read-only in K4 as on the read-only
 * page. Dashed because in this design dashed means "not yours to edit".
 */
export function LockedBlock({
  view,
  cityName,
  operatorName,
}: {
  view: KabinetShelterView;
  cityName: string | null;
  operatorName: string;
}) {
  const t = uk.kabinet.profile;
  const notRecorded = uk.kabinet.profileNotRecorded;
  const legal = view.legalEntity;
  const address = [cityName, view.exactAddress.line1, view.exactAddress.line2]
    .filter((part): part is string => part !== null && part !== "")
    .join(", ");
  return (
    <section
      aria-labelledby="kabinet-locked"
      className="flex flex-col gap-3 rounded-rg-card border-2 border-dashed border-rg-ink-3 p-4 tablet:grid tablet:grid-cols-[1fr_auto] tablet:p-6"
    >
      {/* Source order is K4 360's (title, note, chip); from tablet up
          the grid lifts the chip beside the title, as K4 1440 draws it. */}
      <h2 id="kabinet-locked" className={`${CARD_TITLE} tablet:self-center`}>
        {t.lockedTitle}
      </h2>
      <p className={`${CAPTION} tablet:col-span-2`}>
        {fillTemplate(t.lockedNote, { operator: operatorName })}
      </p>
      <span className="inline-flex min-h-8 items-center self-start rounded-rg-chip bg-rg-ink px-3 text-[13px] leading-[18px] font-medium whitespace-nowrap text-white tablet:col-start-2 tablet:row-start-1 tablet:self-center">
        {uk.kabinet.profileStatus[view.verification.status]}
      </span>
      <dl className="flex flex-col gap-3 tablet:col-span-2 tablet:gap-0">
        {legal.kind === "unregistered_initiative" ? (
          <Row label={t.contactPerson}>{legal.contactPersonName}</Row>
        ) : (
          <>
            <Row label={t.legalName}>{legal.legalName}</Row>
            <Row label={t.edrpou}>{groupEdrpou(legal.edrpou)}</Row>
          </>
        )}
        <Row label={t.registrationStatus}>
          {fillTemplate(t.statusSince, {
            status: uk.kabinet.profileStatus[view.verification.status],
            date: formatDate(statusDate(view.verification)),
          })}
        </Row>
        <Row label={t.address}>{address === "" ? notRecorded : address}</Row>
      </dl>
      <p className={`${CAPTION} tablet:col-span-2`}>{t.addressNote}</p>
    </section>
  );
}
