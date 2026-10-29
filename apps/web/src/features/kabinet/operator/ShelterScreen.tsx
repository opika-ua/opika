import type {
  BlockedAddressesView,
  EMAIL_BLOCK_REASONS,
  RegistryShelterView,
} from "@opika/contracts";
import {
  DEFAULT_VERIFICATION_POLICY,
  donationHost,
  type EvidenceItem,
  enteredAt,
  evidenceGaps,
  type ModeratorId,
} from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import type { ReactNode } from "react";
import { Chip } from "../../../ui/Chip";
import { Heading } from "../../../ui/Heading";
import { Panel } from "../../../ui/Panel";
import { Text } from "../../../ui/Text";
import { TextLink } from "../../../ui/TextLink";
import { channelValue, groupEdrpou } from "../ProfileParts";
import { OPERATOR_HOME } from "../routes";
import { formatDate, formatTime } from "./format";
import { HistoryList } from "./HistoryList";
import type { HistoryPage } from "./pages";

const t = uk.kabinet.operator;
const notRecorded = uk.kabinet.profileNotRecorded;

/** One fact, label over value: a description list row, nothing editable. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-caption text-ink-2">{label}</dt>
      <dd className="text-label break-words text-ink">{children}</dd>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Panel as="section" aria-labelledby={id} padding="lg" className="flex min-w-0 flex-col gap-4">
      <Heading level={2} look="body-l" id={id}>
        {title}
      </Heading>
      {children}
    </Panel>
  );
}

/**
 * The reason a blocked address carries, in his words: the invitation
 * outcome's sentence (`email.blocked.*`; the copy sheet: "reasons reuse the
 * email outcomes") after its lead clause («Запрошення не надіслано: »), since
 * on S4 no invitation was attempted and the line must not say one was
 * (RU1-T4). The test pins each reason as it reads.
 */
export const blockReasonOf = (reason: (typeof EMAIL_BLOCK_REASONS)[number]): string => {
  const sentence = t.email.blocked[reason];
  return sentence.slice(sentence.indexOf(": ") + 2);
};

function EvidenceCard({ view }: { view: RegistryShelterView }) {
  const { evidence } = view.verification;
  const e = t.evidence;
  // What approval still needs, while approval is the next decision (pending
  // or under review): the domain's own rule, never a copy of it.
  const gaps =
    view.verification.status === "pending" || view.verification.status === "under_review"
      ? evidenceGaps(view.legalEntity, evidence, DEFAULT_VERIFICATION_POLICY)
      : [];
  return (
    <Section id="operator-evidence" title={e.title}>
      {evidence.items.length === 0 ? (
        <Text>{e.empty}</Text>
      ) : (
        <ul className="flex flex-col gap-3">
          {evidence.items.map((item, index) => (
            <li
              // Evidence items have no id; their order is the record's.
              key={`${item.kind}-${index}`}
            >
              <Panel tone="sunken" className="flex flex-col gap-3">
                <Text look="label">
                  {e.kind[item.kind]}{" "}
                  <Text as="span" look="hint">
                    {fillTemplate(e.added, { date: formatDate(evidence.submittedAt) })}
                  </Text>
                </Text>
                <EvidenceFacts item={item} />
              </Panel>
            </li>
          ))}
        </ul>
      )}
      {gaps.map((gap) => (
        <Text key={gap.kind} look="label">
          {fillTemplate(e.gaps, {
            kind: e.kind[gap.kind],
            provided: String(gap.provided),
            minimum: String(gap.minimum),
          })}
        </Text>
      ))}
    </Section>
  );
}

function EvidenceFacts({ item }: { item: EvidenceItem }) {
  const f = t.evidence.field;
  switch (item.kind) {
    case "edrpou_registration":
      return (
        <dl className="flex flex-col gap-2">
          <Fact label={uk.kabinet.profile.edrpou}>{groupEdrpou(item.edrpou)}</Fact>
          <Fact label={f.registeredName}>{item.registeredName}</Fact>
          {item.documentKey === null ? <Text look="hint">{t.evidence.noDocument}</Text> : null}
        </dl>
      );
    case "bank_account_holder":
      return (
        <dl className="flex flex-col gap-2">
          <Fact label={f.holderName}>{item.holderName}</Fact>
          {item.documentKey === null ? <Text look="hint">{t.evidence.noDocument}</Text> : null}
        </dl>
      );
    case "reference_contact":
      return (
        <dl className="flex flex-col gap-2">
          <Fact label={f.who}>{item.name}</Fact>
          <Fact label={f.channel}>
            {uk.kabinet.profileChannel[item.channel.kind]}: {channelValue(item.channel)}
          </Fact>
          <Fact label={f.relationship}>{t.evidence.relationship[item.relationship]}</Fact>
        </dl>
      );
    case "site_visit":
      return (
        <dl className="flex flex-col gap-2">
          <Fact label={f.visitedOn}>{formatDate(item.visitedAt)}</Fact>
          <Fact label={f.notes}>{item.notes}</Fact>
        </dl>
      );
    case "supporting_document":
      return (
        <dl className="flex flex-col gap-2">
          <Fact label={f.label}>{item.label.uk}</Fact>
        </dl>
      );
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = item;
      return unreachable;
    }
  }
}

function LegalCard({ view }: { view: RegistryShelterView }) {
  const p = uk.kabinet.profile;
  const legal = view.legalEntity;
  return (
    <Section id="operator-legal" title={t.create.legalTitle}>
      <Text>{t.create.legalKind[legal.kind]}</Text>
      <dl className="flex flex-col gap-3">
        {legal.kind === "unregistered_initiative" ? (
          <Fact label={p.contactPerson}>{legal.contactPersonName}</Fact>
        ) : (
          <>
            <Fact label={p.legalName}>{legal.legalName}</Fact>
            <Fact label={p.edrpou}>{groupEdrpou(legal.edrpou)}</Fact>
            {legal.kind === "registered_ngo" ? (
              <Fact label={t.create.registeredAt}>{formatDate(legal.registeredAt)}</Fact>
            ) : null}
          </>
        )}
      </dl>
      <Text look="hint">{t.shelter.legalNote}</Text>
    </Section>
  );
}

function AddressCard({ view, cityName }: { view: RegistryShelterView; cityName: string | null }) {
  const address = view.exactAddress;
  const line = [cityName, address.line1, address.line2, address.postalCode]
    .filter((part): part is string => part !== null && part !== "")
    .join(", ");
  return (
    <Section id="operator-address" title={uk.kabinet.profile.address}>
      <dl className="flex flex-col gap-3">
        <Fact label={uk.kabinet.profile.address}>{line === "" ? notRecorded : line}</Fact>
        <Fact label={t.create.coordinates}>
          {address.coordinates.lat}, {address.coordinates.lng}
        </Fact>
      </dl>
      <Text look="hint">{uk.kabinet.profile.addressNote}</Text>
    </Section>
  );
}

function ContactsCard({ view }: { view: RegistryShelterView }) {
  return (
    <Section id="operator-contacts" title={uk.kabinet.profile.contactsTitle}>
      <dl className="flex flex-col gap-3">
        {[view.contact.primary, ...view.contact.additional].map((channel, index) => (
          <Fact key={`${channel.kind}-${index}`} label={uk.kabinet.profileChannel[channel.kind]}>
            {channelValue(channel)}
          </Fact>
        ))}
      </dl>
    </Section>
  );
}

function DonationCard({ view, decision }: { view: RegistryShelterView; decision: ReactNode }) {
  const d = t.donation;
  return (
    <Section id="operator-donation" title={uk.kabinet.profile.donationTitle}>
      <dl className="flex flex-col gap-3">
        <Fact label={d.live}>{view.donation?.url ?? d.none}</Fact>
      </dl>
      {view.pendingDonation !== null ? (
        <Panel tone="sunken" className="flex flex-col gap-2">
          <Text look="label">
            {
              // The date ends in «р.», and the sentence's own full stop follows
              // it: one stop serves both, as Ukrainian writes an abbreviation at
              // a sentence's end.
              fillTemplate(d.proposed, {
                host: donationHost(view.pendingDonation.link),
                date: formatDate(view.pendingDonation.proposedAt),
              }).replace(" р.. ", " р. ")
            }
          </Text>
          <Text className="break-words">{view.pendingDonation.link.url}</Text>
        </Panel>
      ) : null}
      {decision}
    </Section>
  );
}

/**
 * Which of the shelter's addresses the provider won't deliver to (answer 4),
 * in each of its three answers: checked (none, or who), incomplete (who so
 * far), unknown (why). An empty list reads «none blocked» only when the whole
 * list was read.
 */
export function BlockedCard({ blocked }: { blocked: BlockedAddressesView }) {
  const b = t.blocked;
  const shown =
    blocked.kind === "checked"
      ? blocked.blocked
      : blocked.kind === "incomplete"
        ? blocked.blockedSoFar
        : [];
  return (
    <Section id="operator-blocked" title={b.title}>
      {blocked.kind === "unknown" ? (
        <Text>{b.unknown[blocked.why]}</Text>
      ) : (
        <>
          {blocked.kind === "checked" && blocked.blocked.length === 0 ? (
            <Text>{b.none}</Text>
          ) : null}
          {blocked.kind === "incomplete" ? <Text>{b.incomplete}</Text> : null}
          {shown.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {shown.map((entry) => (
                <li key={entry.email} className="text-label break-words text-ink">
                  {fillTemplate(b.line, {
                    email: entry.email,
                    reason: blockReasonOf(entry.reason),
                  })}
                </li>
              ))}
            </ul>
          ) : null}
          <Text look="hint">{fillTemplate(b.asOf, { time: formatTime(blocked.asOf) })}</Text>
        </>
      )}
      {shown.length > 0 ? <Text look="hint">{b.manualUnblock}</Text> : null}
    </Section>
  );
}

/**
 * Which first page of the history the list was started from. `HistoryList`
 * keeps the pages it has shown (`useMore`), so when the page re-renders after
 * an R-UI 3 action with a newer first page, a new key starts the list from
 * it; otherwise the line the action just wrote would only appear on a reload.
 */
const historyKeyOf = (page: HistoryPage): string => {
  const newest = page.items[0];
  if (newest === undefined) return "empty";
  const at = "at" in newest ? newest.at : newest.event.at;
  return `${at.toISOString()}:${page.items.length}`;
};

/**
 * R-UI 3's controls, each mounted where it acts: support mode in the header,
 * R-UI 4's rename form under it (beside the name it changes), the decision
 * panel at the head of the second column (beside the evidence, as S3's panel
 * sits), the donation decision under the proposal, and the
 * admins list with its actions as the admins card. The page composes them (`actions/ShelterActionsScreen.tsx`); this screen only places
 * them, so it holds no client state of its own.
 */
export type ShelterScreenActions = {
  supportEntry: ReactNode;
  rename: ReactNode;
  decision: ReactNode;
  donationDecision: ReactNode;
  admins: ReactNode;
};

/**
 * S4 · one shelter (R-UI 1; S3 folded in, RU-T2): its status and since when,
 * the evidence, the legal data, the premises address, contacts, description,
 * the donation link (live and proposed), admins, blocked addresses and the
 * history, with the operator's moves on it (`actions`, R-UI 3). The admins
 * card is the actions' list (`AdminsManager`), which shows each admin's
 * access itself.
 */
export function ShelterScreen({
  view,
  cityName,
  history,
  blocked,
  me,
  actions,
}: {
  view: RegistryShelterView;
  cityName: string | null;
  history: HistoryPage;
  blocked: BlockedAddressesView;
  me: ModeratorId;
  actions: ShelterScreenActions;
}) {
  const joined = view.admins.filter((admin) => admin.invite.status === "accepted").length;
  return (
    <>
      <TextLink href={OPERATOR_HOME} className="self-start">
        {t.shelter.back}
      </TextLink>
      <div className="flex flex-col gap-2">
        <Heading level={1} look="title" className="break-words">
          {view.displayName}
        </Heading>
        <Text>
          {fillTemplate(t.shelter.meta, {
            city: cityName ?? notRecorded,
            admins: fillTemplate(t.list.admins, { count: String(joined) }),
          })}
        </Text>
        <p className="flex flex-wrap items-center gap-2">
          <Chip kind="status" tone="ink">
            {uk.kabinet.profileStatus[view.verification.status]}
          </Chip>
          <Text as="span">
            {fillTemplate(t.shelter.timeInState, {
              date: formatDate(enteredAt(view.verification)),
            })}
          </Text>
        </p>
        {actions.supportEntry}
        {actions.rename}
      </div>
      <div className="grid grid-cols-1 items-start gap-4 desktop:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <EvidenceCard view={view} />
          <LegalCard view={view} />
          <AddressCard view={view} cityName={cityName} />
          <ContactsCard view={view} />
          <Section id="operator-description" title={t.shelter.descriptionTitle}>
            <Text className="whitespace-pre-line break-words">{view.description.uk}</Text>
          </Section>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {actions.decision}
          <DonationCard view={view} decision={actions.donationDecision} />
          <Section id="operator-admins" title={t.admins.title}>
            {actions.admins}
          </Section>
          <BlockedCard blocked={blocked} />
          <HistoryList
            key={historyKeyOf(history)}
            shelterId={view.id}
            first={history}
            people={{ me, admins: view.admins }}
          />
        </div>
      </div>
    </>
  );
}
