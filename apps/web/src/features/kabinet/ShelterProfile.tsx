import type { KabinetShelterView } from "@opika/contracts";
import type { ShelterFacingVerification } from "@opika/domain";
import { uk } from "@opika/i18n";
import type { ReactNode } from "react";
import { KabinetBrand, KabinetMark } from "./KabinetBrand";
import { SignOutButton } from "./SignOutButton";
import { SupportBanner } from "./SupportBanner";

/**
 * The read-only "your shelter" page (KS-Q1, Oleksii: "A"; mock
 * `Opika Kabinet.dc.html`, «K4 Профіль притулку» 1440 and 360). K4's sections
 * in K4's order (contacts and fundraising, then the shelter's voice and the
 * block set during verification), with every value a label–value row: the
 * pattern K4 already uses for its locked block (N10), so nothing on the page
 * looks editable. No inputs, no Save bar, and no view or inquiry counts in any
 * form (commitment #2; KABINET K4: «Немає статистики переглядів чи запитів»).
 *
 * The dashed border stays on the verification block only: in the design it
 * means "not yours to edit" (K4's note), which is true of the verified
 * details but not of contacts, which the shelter will edit once editing
 * ships. In support mode (S5) the same page sits under the support banner.
 */

const ROW_LABEL =
  "text-[13px] leading-[18px] text-rg-ink-3 tablet:text-[15px] tablet:leading-[22px] tablet:text-rg-ink-2";
const ROW_VALUE = "text-[15px] leading-[22px] font-medium text-rg-ink break-words";
const CARD = "flex flex-col gap-4 rounded-rg-card bg-rg-surface p-4 tablet:p-6";
const CARD_TITLE = "text-[19px] leading-6 font-bold tracking-[-0.02em] text-rg-ink";
const CAPTION = "text-[13px] leading-[18px] text-rg-ink-3";

/** One fact: label above value on the phone (K4 360), a 200px label column from tablet up (K4 1440). */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-0 tablet:grid tablet:grid-cols-[200px_minmax(0,1fr)] tablet:gap-4 tablet:py-3">
      <dt className={ROW_LABEL}>{label}</dt>
      <dd className={ROW_VALUE}>{children}</dd>
    </div>
  );
}

const fill = (template: string, values: Record<string, string>): string =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, () => value),
    template,
  );

/**
 * Native `Intl`, never a hand-rolled month list (standing rule), as the reveal
 * dialog formats its date. Kyiv time: a date is the day it was in Ukraine,
 * whatever zone the server renders in.
 */
const formatDate = (date: Date): string =>
  new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Kyiv",
  }).format(date);

const statusDate = (verification: ShelterFacingVerification): Date =>
  "since" in verification ? verification.since : verification.at;

type Channel = KabinetShelterView["contact"]["primary"];

const channelValue = (channel: Channel): string => {
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

/** An EDRPOU code grouped 2·3·3, as the mock writes it («43 218 765»). */
const groupEdrpou = (code: string): string =>
  code.length === 8 ? `${code.slice(0, 2)} ${code.slice(2, 5)} ${code.slice(5)}` : code;

export type ShelterProfileProps = {
  view: KabinetShelterView;
  cityName: string | null;
  viewer: "admin" | "support";
  /** The operator's display name (RS-Q2), for the verification block's note. */
  operatorName: string;
};

export function ShelterProfile({ view, cityName, viewer, operatorName }: ShelterProfileProps) {
  const t = uk.kabinet.profile;
  const notRecorded = uk.kabinet.profileNotRecorded;
  const support = viewer === "support";
  const legal = view.legalEntity;
  const address = [cityName, view.exactAddress.line1, view.exactAddress.line2]
    .filter((part): part is string => part !== null && part !== "")
    .join(", ");

  return (
    <div
      className={
        support ? "min-h-dvh outline-4 -outline-offset-4 outline-rg-ink outline-solid" : "min-h-dvh"
      }
    >
      {support ? <SupportBanner shelterName={view.displayName} /> : null}

      <header className="flex min-h-16 items-center gap-3 bg-rg-surface px-4 desktop:min-h-[72px] desktop:gap-5 desktop:px-8">
        {/* Phone (K4 360): the mark and the page's short name; desktop (K4 1440): the brand row. */}
        <span className="flex items-center gap-2 desktop:hidden">
          <KabinetMark />
          <span className="text-[19px] leading-6 font-bold tracking-[-0.02em] text-rg-ink">
            {t.phoneTitle}
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
          {support ? uk.kabinet.support.viewingAs : t.role}
        </span>
        {support ? (
          <span className="text-[15px] leading-[22px] text-rg-ink-3">
            {uk.kabinet.support.signOutDisabled}
          </span>
        ) : (
          <SignOutButton />
        )}
      </header>

      <div className="flex flex-col gap-3 px-4 pt-5 pb-6 desktop:flex-row desktop:items-start desktop:gap-8 desktop:px-8 desktop:pt-8 desktop:pb-14">
        {/*
          K4's side nav holds «Тварини» and «Профіль притулку». Only this page
          exists (no animal screen in this PR), so only its item is shown:
          a link to a screen that isn't there would be a dead end.
        */}
        <nav
          aria-label={t.title}
          className="hidden w-[220px] flex-none flex-col gap-1 desktop:flex"
        >
          <span
            aria-current="page"
            className="flex min-h-12 items-center rounded-rg-button bg-rg-surface px-4 text-[15px] font-medium text-rg-ink"
          >
            {t.title}
          </span>
        </nav>

        <main className="flex min-w-0 max-w-[1080px] flex-1 flex-col gap-3 desktop:gap-6">
          <div className="flex flex-col gap-1">
            {/* K4 360 shows neither: the header names the page there. The heading stays for screen readers. */}
            <h1 className="sr-only desktop:not-sr-only desktop:text-[44px] desktop:leading-[46px] desktop:font-bold desktop:tracking-[-0.035em] desktop:text-rg-ink">
              {t.title}
            </h1>
            <p className={`hidden desktop:block ${CAPTION}`}>{t.intro}</p>
          </div>

          <div className="grid grid-cols-1 items-start gap-3 desktop:grid-cols-2 desktop:gap-4">
            <div className="flex flex-col gap-3 desktop:gap-4">
              <section aria-labelledby="kabinet-contacts" className={CARD}>
                <h2 id="kabinet-contacts" className={CARD_TITLE}>
                  {t.contactsTitle}
                </h2>
                <dl className="flex flex-col gap-3 tablet:gap-0">
                  {[view.contact.primary, ...view.contact.additional].map((channel, index) => (
                    <Row
                      key={`${channel.kind}-${index}`}
                      label={uk.kabinet.profileChannel[channel.kind]}
                    >
                      {channelValue(channel)}
                    </Row>
                  ))}
                </dl>
                <p className={CAPTION}>{t.contactsNote}</p>
              </section>

              <section aria-labelledby="kabinet-donation" className={CARD}>
                <h2 id="kabinet-donation" className={CARD_TITLE}>
                  {t.donationTitle}
                </h2>
                <dl className="flex flex-col gap-3 tablet:gap-0">
                  <Row label={t.donationLink}>{view.donation?.url ?? notRecorded}</Row>
                  {view.pendingDonation !== null ? (
                    <Row label={t.donationPending}>{view.pendingDonation.link.url}</Row>
                  ) : null}
                </dl>
                <p className={CAPTION}>{t.donationNote}</p>
              </section>
            </div>

            <div className="flex flex-col gap-3 desktop:gap-4">
              <section aria-labelledby="kabinet-voice" className={CARD}>
                <h2 id="kabinet-voice" className={CARD_TITLE}>
                  {t.voiceTitle}
                </h2>
                <dl className="flex flex-col gap-3 tablet:gap-0">
                  <Row label={t.voiceLabel}>{view.freshnessSentence?.uk ?? notRecorded}</Row>
                </dl>
                <p className={CAPTION}>{t.voiceNote}</p>
              </section>

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
                  {fill(t.lockedNote, { operator: operatorName })}
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
                    {fill(t.statusSince, {
                      status: uk.kabinet.profileStatus[view.verification.status],
                      date: formatDate(statusDate(view.verification)),
                    })}
                  </Row>
                  <Row label={t.address}>{address === "" ? notRecorded : address}</Row>
                </dl>
                <p className={`${CAPTION} tablet:col-span-2`}>{t.addressNote}</p>
              </section>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
