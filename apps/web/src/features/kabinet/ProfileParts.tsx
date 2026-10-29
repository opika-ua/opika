import type { KabinetShelterView } from "@opika/contracts";
import type { ShelterFacingVerification } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import type { ReactNode } from "react";
import { Card } from "../../ui/Card";
import { Chip } from "../../ui/Chip";
import { Heading } from "../../ui/Heading";
import { Text } from "../../ui/Text";

/**
 * Pieces the read-only profile and K4's editor share: the label-value row
 * and the locked block (N10). No hooks and no browser API, so the server page
 * renders them and the editor, a client component, re-renders the locked
 * block from its own state after a pause or resume changes the status chip.
 */

/**
 * One fact: the label (quiet, ink-2) above the value (600) on a phone, label and value side by side
 * from tablet. The value carries the weight because it is what the person came to read.
 */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 tablet:grid tablet:grid-cols-3 tablet:gap-4">
      <dt className="text-caption text-ink-2">{label}</dt>
      <dd className="text-label break-words text-ink tablet:col-span-2">{children}</dd>
    </div>
  );
}

/** A list of `Row`s, divided by quiet rules. */
export function Facts({ children }: { children: ReactNode }) {
  return <dl className="flex flex-col divide-y divide-line">{children}</dl>;
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
 * page. The quiet outlined card, not the white one every editable section
 * uses, is how it reads as "not yours to edit"; the note says why in words.
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
    <Card as="section" tone="outline" aria-labelledby="kabinet-locked">
      <div className="flex flex-col gap-4 p-4 tablet:p-6 desktop:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Heading level={2} look="section" id="kabinet-locked">
            {t.lockedTitle}
          </Heading>
          <Chip kind="status" tone="ink">
            {uk.kabinet.profileStatus[view.verification.status]}
          </Chip>
        </div>
        <Text look="hint">{fillTemplate(t.lockedNote, { operator: operatorName })}</Text>
        <Facts>
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
        </Facts>
        <Text look="hint">{t.addressNote}</Text>
      </div>
    </Card>
  );
}
