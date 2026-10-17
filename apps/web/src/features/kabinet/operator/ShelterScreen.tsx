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
import { linkClass } from "../../controls/controls";
import { channelValue, groupEdrpou } from "../ProfileParts";
import {
  BODY,
  CAPTION,
  CARD,
  CARD_TITLE,
  INNER,
  PAGE_TITLE,
  STATUS_CHIP,
  STRONG,
} from "../profile-edit/styles";
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
      <dt className={CAPTION}>{label}</dt>
      <dd className={`${STRONG} break-words`}>{children}</dd>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={CARD}>
      <h2 id={id} className={CARD_TITLE}>
        {title}
      </h2>
      {children}
    </section>
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
        <p className={BODY}>{e.empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {evidence.items.map((item, index) => (
            <li
              // Evidence items have no id; their order is the record's.
              key={`${item.kind}-${index}`}
              className={`${INNER} flex flex-col gap-3`}
            >
              <p className={STRONG}>
                {e.kind[item.kind]}{" "}
                <span className={CAPTION}>
                  {fillTemplate(e.added, { date: formatDate(evidence.submittedAt) })}
                </span>
              </p>
              <EvidenceFacts item={item} />
            </li>
          ))}
        </ul>
      )}
      {gaps.map((gap) => (
        <p key={gap.kind} className={STRONG}>
          {fillTemplate(e.gaps, {
            kind: e.kind[gap.kind],
            provided: String(gap.provided),
            minimum: String(gap.minimum),
          })}
        </p>
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
          {item.documentKey === null ? <p className={CAPTION}>{t.evidence.noDocument}</p> : null}
        </dl>
      );
    case "bank_account_holder":
      return (
        <dl className="flex flex-col gap-2">
          <Fact label={f.holderName}>{item.holderName}</Fact>
          {item.documentKey === null ? <p className={CAPTION}>{t.evidence.noDocument}</p> : null}
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
      <p className={BODY}>{t.create.legalKind[legal.kind]}</p>
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
      <p className={CAPTION}>{t.shelter.legalNote}</p>
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
      <p className={CAPTION}>{uk.kabinet.profile.addressNote}</p>
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
        <div className={`${INNER} flex flex-col gap-2`}>
          <p className={STRONG}>
            {
              // The date ends in «р.», and the sentence's own full stop follows
              // it: one stop serves both, as Ukrainian writes an abbreviation at
              // a sentence's end.
              fillTemplate(d.proposed, {
                host: donationHost(view.pendingDonation.link),
                date: formatDate(view.pendingDonation.proposedAt),
              }).replace(" р.. ", " р. ")
            }
          </p>
          <p className={`${BODY} break-words`}>{view.pendingDonation.link.url}</p>
        </div>
      ) : null}
      {decision}
    </Section>
  );
}

function AdminsCard({
  view,
  now,
  manager,
}: {
  view: RegistryShelterView;
  now: Date;
  manager: ReactNode;
}) {
  const a = t.admins;
  return (
    <Section id="operator-admins" title={a.title}>
      {manager !== undefined ? (
        manager
      ) : view.admins.length === 0 ? (
        <p className={BODY}>{a.none}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {view.admins.map((admin) => (
            <li key={admin.id} className="flex flex-col gap-1">
              <p className={STRONG}>{admin.name}</p>
              <p className={`${BODY} break-words`}>{admin.email}</p>
              <p className={CAPTION}>
                {admin.invite.status === "accepted"
                  ? a.joined
                  : admin.invite.expiresAt.getTime() > now.getTime()
                    ? fillTemplate(a.invitedUntil, { date: formatDate(admin.invite.expiresAt) })
                    : a.invitedExpired}
              </p>
            </li>
          ))}
        </ul>
      )}
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
        <p className={BODY}>{b.unknown[blocked.why]}</p>
      ) : (
        <>
          {blocked.kind === "checked" && blocked.blocked.length === 0 ? (
            <p className={BODY}>{b.none}</p>
          ) : null}
          {blocked.kind === "incomplete" ? <p className={BODY}>{b.incomplete}</p> : null}
          {shown.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {shown.map((entry) => (
                <li key={entry.email} className={`${STRONG} break-words`}>
                  {fillTemplate(b.line, {
                    email: entry.email,
                    reason: blockReasonOf(entry.reason),
                  })}
                </li>
              ))}
            </ul>
          ) : null}
          <p className={CAPTION}>{fillTemplate(b.asOf, { time: formatTime(blocked.asOf) })}</p>
        </>
      )}
      {shown.length > 0 ? <p className={CAPTION}>{b.manualUnblock}</p> : null}
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
 * the decision panel at the head of the second column (beside the evidence,
 * as S3's panel sits), the donation decision under the proposal, and the
 * admins list with its actions in place of the read-only one. The page
 * composes them (`actions/ShelterActionsScreen.tsx`); this screen only places
 * them, so it holds no client state of its own.
 */
export type ShelterScreenActions = {
  supportEntry: ReactNode;
  decision: ReactNode;
  donationDecision: ReactNode;
  admins: ReactNode;
};

/**
 * S4 · one shelter (R-UI 1; S3 folded in, RU-T2): its status and since when,
 * the evidence, the legal data, the premises address, contacts, description,
 * the donation link (live and proposed), admins, blocked addresses and the
 * history. With `actions` (R-UI 3, which the page always passes) it carries
 * the operator's moves on it; without, it reads only.
 */
export function ShelterScreen({
  view,
  cityName,
  history,
  blocked,
  me,
  now,
  actions,
}: {
  view: RegistryShelterView;
  cityName: string | null;
  history: HistoryPage;
  blocked: BlockedAddressesView;
  me: ModeratorId;
  now: Date;
  actions?: ShelterScreenActions | undefined;
}) {
  const joined = view.admins.filter((admin) => admin.invite.status === "accepted").length;
  return (
    <>
      <a href={OPERATOR_HOME} className={`${linkClass("text")} self-start`}>
        {t.shelter.back}
      </a>
      <div className="flex flex-col gap-2">
        <h1 className={PAGE_TITLE}>{view.displayName}</h1>
        <p className={BODY}>
          {fillTemplate(t.shelter.meta, {
            city: cityName ?? notRecorded,
            admins: fillTemplate(t.list.admins, { count: String(joined) }),
          })}
        </p>
        <p className="flex flex-wrap items-center gap-2">
          <span className={STATUS_CHIP}>{uk.kabinet.profileStatus[view.verification.status]}</span>
          <span className={BODY}>
            {fillTemplate(t.shelter.timeInState, {
              date: formatDate(enteredAt(view.verification)),
            })}
          </span>
        </p>
        {actions?.supportEntry}
      </div>
      <div className="grid grid-cols-1 items-start gap-4 desktop:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <EvidenceCard view={view} />
          <LegalCard view={view} />
          <AddressCard view={view} cityName={cityName} />
          <ContactsCard view={view} />
          <Section id="operator-description" title={t.shelter.descriptionTitle}>
            <p className={`${BODY} whitespace-pre-line break-words`}>{view.description.uk}</p>
          </Section>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {actions?.decision}
          <DonationCard view={view} decision={actions?.donationDecision} />
          <AdminsCard view={view} now={now} manager={actions?.admins} />
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
