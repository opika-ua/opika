import type {
  ApplicationQueueItemView,
  ApplicationsQueueView,
  FunnelCountsView,
  ListedUnverifiedItemView,
  PendingDonationItemView,
} from "@opika/contracts";
import { pluralizeUk } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { Card } from "../../../../ui/Card";
import { Heading } from "../../../../ui/Heading";
import { InlineList } from "../../../../ui/InlineList";
import { Text } from "../../../../ui/Text";
import { TextLink } from "../../../../ui/TextLink";
import { channelValue, formatDate } from "../../ProfileParts";
import { shelterPath } from "../list-params";
import { ApplicationDecision, DonationQueueDecision } from "./QueueDecisions";

const t = uk.kabinet.applications;
const op = uk.kabinet.operator;

/** Highlighted past this (§14 Q5: the banner promises a decision within 2 days). */
export const WAITING_LONG_MS = 36 * 60 * 60 * 1000;

/** A link the applicant submitted: shown in full, opened apart, never followed by the server. */
function SubmittedLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="w-fit break-all text-label text-ink underline underline-offset-4 focus-ring"
    >
      {url}
    </a>
  );
}

const countOf = (count: number, forms: { one: string; few: string; many: string }): string =>
  fillTemplate(pluralizeUk(count, forms), { count: String(count) });

const waitedLong = (appliedAt: Date | null, now: Date): boolean =>
  appliedAt !== null && now.getTime() - appliedAt.getTime() > WAITING_LONG_MS;

type QueueEntry =
  | { kind: "card"; item: ApplicationQueueItemView }
  | { kind: "unreadable"; row: ApplicationsQueueView["unreadable"][number] };

const appliedAtOf = (entry: QueueEntry): number | null =>
  (entry.kind === "card" ? entry.item.appliedAt : entry.row.appliedAt)?.getTime() ?? null;

/** Oldest first across both kinds; an unreadable row with no date goes last. */
function queueOrderOf(view: ApplicationsQueueView): QueueEntry[] {
  return [
    ...view.applications.map((item): QueueEntry => ({ kind: "card", item })),
    ...view.unreadable.map((row): QueueEntry => ({ kind: "unreadable", row })),
  ].sort((a, b) => {
    const [at, bt] = [appliedAtOf(a), appliedAtOf(b)];
    if (at === null || bt === null) return at === bt ? 0 : at === null ? 1 : -1;
    return at - bt;
  });
}

function ApplicationCard({
  item,
  cityName,
  now,
}: {
  item: ApplicationQueueItemView;
  cityName: string | null;
  now: Date;
}) {
  const waitingLong = waitedLong(item.appliedAt, now);
  return (
    <Card as="li" tone="outline" className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1">
        <Heading level={3} className="break-words">
          {item.name}
        </Heading>
        <div className="text-caption text-ink-2">
          <InlineList
            items={[
              ...(cityName === null ? [] : [cityName]),
              fillTemplate(op.shelter.timeInState, { date: formatDate(item.appliedAt) }),
            ]}
          />
        </div>
        {waitingLong ? <Text look="label">{t.waitingLong}</Text> : null}
      </div>
      <div className="flex flex-col gap-1">
        {item.link === null ? (
          // A row without its link still gets its card; it says what's missing (unknown field rule).
          <Text look="label">
            {uk.registration.link.label}: {uk.kabinet.profileNotRecorded}
          </Text>
        ) : (
          <SubmittedLink url={item.link} />
        )}
        <Text className="break-words">{channelValue(item.contact)}</Text>
        <Text className="break-all">{item.email}</Text>
        <Text
          look={item.emailStatus === "confirmed" ? "body" : "label"}
          id={`${item.shelterId}-email`}
        >
          {item.emailStatus === "confirmed" ? t.emailConfirmed : t.emailUnconfirmed}
        </Text>
        <Text>
          {fillTemplate(t.drafts, {
            animals: countOf(item.drafts.animals, t.draftsAnimals),
            photos: countOf(item.drafts.photos, t.draftsPhotos),
          })}
        </Text>
      </div>
      {item.duplicates.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {item.duplicates.map((signal) => (
            <li key={`${signal.kind}-${signal.shelterId}`}>
              <TextLink href={shelterPath(signal.shelterId)}>
                {fillTemplate(t.duplicate, {
                  name: signal.shelterName,
                  why: t.duplicateWhy[signal.kind],
                })}
              </TextLink>
            </li>
          ))}
        </ul>
      ) : null}
      <TextLink href={shelterPath(item.shelterId)} placement="standalone">
        {op.list.open}
      </TextLink>
      <ApplicationDecision
        shelterId={item.shelterId}
        version={item.version}
        name={item.name}
        emailStatus={item.emailStatus}
      />
    </Card>
  );
}

/** A row the server couldn't make a card of: said plainly, with the id to find it by. */
function UnreadableCard({
  row,
  now,
}: {
  row: ApplicationsQueueView["unreadable"][number];
  now: Date;
}) {
  return (
    <Card as="li" tone="outline" className="flex flex-col gap-1 p-4">
      <Text>{t.cardUnreadable}</Text>
      <Text look="hint" className="break-all">
        {row.shelterId}
      </Text>
      {waitedLong(row.appliedAt, now) ? <Text look="label">{t.waitingLong}</Text> : null}
    </Card>
  );
}

function ListedUnverified({
  items,
  cityNames,
}: {
  items: readonly ListedUnverifiedItemView[];
  cityNames: Readonly<Record<string, string>>;
}) {
  return (
    <section aria-labelledby="queue-listed-title" className="flex flex-col gap-2">
      <Heading level={3} id="queue-listed-title">
        {op.earlyListing.title}
      </Heading>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.shelterId} className="flex flex-col">
            <TextLink href={shelterPath(item.shelterId)} placement="standalone">
              {item.name}
            </TextLink>
            <div className={item.remind ? "text-label text-ink" : "text-caption text-ink-2"}>
              <InlineList
                items={[
                  ...(cityNames[item.cityId] === undefined ? [] : [cityNames[item.cityId]]),
                  countOf(item.daysLeft, op.earlyListing.daysLeft),
                ]}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The account-holder check S4 shows beside «Схвалити» (D3): money never goes live unchecked, so the
 * name to compare the link's holder with sits on the card, with S4's own reminder.
 */
function HolderCheck({ legalEntity }: { legalEntity: PendingDonationItemView["legalEntity"] }) {
  const initiative = legalEntity?.kind === "unregistered_initiative";
  return (
    <div className="flex flex-col gap-1">
      <Text look="hint">
        {initiative ? op.donation.approveHintInitiative : op.donation.approveHint}
      </Text>
      <Text look="body">
        {initiative ? uk.kabinet.profile.contactPerson : uk.kabinet.profile.legalName}:{" "}
        {legalEntity === null ? uk.kabinet.profileNotRecorded : legalEntity.name}
      </Text>
    </div>
  );
}

function PendingDonations({ items }: { items: readonly PendingDonationItemView[] }) {
  return (
    <section aria-labelledby="queue-donations-title" className="flex flex-col gap-2">
      <Heading level={3} id="queue-donations-title">
        {op.list.donationPending}
      </Heading>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <Card as="li" tone="outline" key={item.shelterId} className="flex flex-col gap-2 p-4">
            <TextLink href={shelterPath(item.shelterId)} placement="standalone">
              {item.name}
            </TextLink>
            <SubmittedLink url={item.proposedUrl} />
            <HolderCheck legalEntity={item.legalEntity} />
            <DonationQueueDecision
              shelterId={item.shelterId}
              version={item.version}
              proposedUrl={item.proposedUrl}
            />
          </Card>
        ))}
      </ul>
    </section>
  );
}

/** The onboarding funnel (§8): operator only, never shown to a shelter. */
export function FunnelTable({ funnel }: { funnel: FunnelCountsView }) {
  return (
    <table className="w-full text-left">
      <caption className="pb-2 text-left text-label text-ink">{t.funnel.title}</caption>
      <tbody className="divide-y divide-line">
        {funnel.counts.map((row) => (
          <tr key={row.kind}>
            <th scope="row" className="py-2 pr-4 text-body font-normal text-ink">
              {t.funnel[row.kind]}
            </th>
            <td className="py-2 text-right text-label text-ink">{row.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * «Заявки (N)» at the top of S1 (§3): each application on one card with what's needed to decide
 * there, oldest first; then the accepted ones still listed early, the donation links waiting, and
 * the funnel. Rendered only while `SELF_REGISTRATION_ENABLED` is on (the page decides).
 */
export function ApplicationsBlock({
  view,
  cityNames,
  now,
}: {
  view: ApplicationsQueueView;
  cityNames: Readonly<Record<string, string>>;
  now: Date;
}) {
  return (
    <section aria-labelledby="queue-title" className="flex flex-col gap-4">
      <Heading level={2} look="section" id="queue-title">
        {fillTemplate(t.title, {
          count: String(view.applications.length + view.unreadable.length),
        })}
      </Heading>
      {view.applications.length + view.unreadable.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {queueOrderOf(view).map((entry) =>
            entry.kind === "card" ? (
              <ApplicationCard
                key={entry.item.shelterId}
                item={entry.item}
                cityName={cityNames[entry.item.cityId] ?? null}
                now={now}
              />
            ) : (
              <UnreadableCard key={entry.row.shelterId} row={entry.row} now={now} />
            ),
          )}
        </ul>
      ) : null}
      {view.listedUnverified.length > 0 ? (
        <ListedUnverified items={view.listedUnverified} cityNames={cityNames} />
      ) : null}
      {view.pendingDonations.length > 0 ? <PendingDonations items={view.pendingDonations} /> : null}
      <FunnelTable funnel={view.funnel} />
    </section>
  );
}
