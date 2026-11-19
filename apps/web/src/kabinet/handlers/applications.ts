import {
  type ApplicationDecisionResult,
  type ApplicationQueueItemView,
  ApplicationQueueItemViewSchema,
  type ApplicationsQueueView,
  type apiErrors,
  type PendingDonationItemView,
} from "@opika/contracts";
import {
  type ApplicationDecisionWrite,
  type ApplicationRow,
  applicationsRepo,
  type DuplicateSourceRow,
  funnelRepo,
  registrationFactsRepo,
  shelterRepo,
} from "@opika/db/repos";
import {
  type ApplicationDecision,
  type ApplicationRejectionReason,
  acceptApplication,
  type ContactChannel,
  type DuplicateCandidate,
  duplicateSignals,
  type EmailStatus,
  ERASED_ADMIN_EMAIL,
  earlyListingOf,
  FUNNEL_EVENT_KINDS,
  FUNNEL_WINDOW_DAYS,
  lifecycleOf,
  type ModeratorId,
  rejectApplication,
  type Shelter,
  type ShelterHistoryEntry,
  type ShelterId,
  type ShelterLegalEntity,
  type ShelterVerification,
} from "@opika/domain";
import type { ORPCErrorConstructorMap } from "@orpc/server";
import type { KabinetContext } from "../context";
import { sendApplicationDecision } from "./applications-mail";

/**
 * The operator's «Заявки» block (§3). Decisions follow `acceptApplication` / `rejectApplication`
 * and land as one statement conditional on the status and the version read, so a second tab or a
 * double click answers `already_decided` and writes nothing.
 */
export type ApplicationsDeps = Pick<KabinetContext, "db" | "now" | "newId" | "transactionalMail">;

type DecisionErrors = ORPCErrorConstructorMap<{
  CONFLICT: typeof apiErrors.CONFLICT;
  NOT_FOUND: typeof apiErrors.NOT_FOUND;
}>;

const DAY_MS = 24 * 60 * 60 * 1000;

const linksOfContact = (channel: ContactChannel): string[] => {
  switch (channel.kind) {
    case "website":
    case "facebook":
      return [channel.url];
    case "instagram":
      return [`https://www.instagram.com/${channel.handle}/`];
    case "telegram":
      return [`https://t.me/${channel.handle}`];
    default:
      return [];
  }
};

const publicLinksOf = (verification: ShelterVerification): string[] =>
  verification.evidence.items.flatMap((item) => (item.kind === "public_link" ? [item.url] : []));

const candidateOf = (source: DuplicateSourceRow): DuplicateCandidate => ({
  shelterId: source.shelterId,
  name: source.name,
  cityId: source.cityId,
  emails: source.emails,
  links: [
    ...publicLinksOf(source.verification),
    ...(source.contact === null
      ? []
      : [source.contact.primary, ...source.contact.additional].flatMap(linksOfContact)),
  ],
});

function warn(line: string): void {
  // biome-ignore lint/suspicious/noConsole: a reason code and an id, never applicant text
  console.warn(line);
}

/** Each queue load reads every card; once per process per shelter is enough to notice. */
const linkMissingLogged = new Set<string>();

const readableDate = (value: unknown): Date | null =>
  value instanceof Date && !Number.isNaN(value.getTime()) ? value : null;

function queueItemOf(
  row: ApplicationRow,
  existing: readonly DuplicateCandidate[],
  names: ReadonlyMap<string, string>,
): ApplicationQueueItemView {
  if (row.verification.status !== "application") {
    throw new Error(`Shelter ${row.shelterId} read as an application but is not one`);
  }
  // The registration write always records it; without it the card says so rather than vanishing.
  const link = publicLinksOf(row.verification)[0] ?? null;
  if (link === null && !linkMissingLogged.has(row.shelterId)) {
    linkMissingLogged.add(row.shelterId);
    warn(`[applications] ${row.shelterId}: application_link_missing`);
  }
  const self = existing.find((candidate) => candidate.shelterId === row.shelterId);
  const signals = self === undefined ? [] : duplicateSignals(self, existing);
  return {
    shelterId: row.shelterId,
    version: row.version,
    name: row.name,
    cityId: row.cityId,
    appliedAt: row.verification.appliedAt,
    link,
    contact: row.contact?.primary ?? null,
    email: row.registrant?.email ?? ERASED_ADMIN_EMAIL,
    emailStatus: row.registrant?.emailVerified === true ? "confirmed" : "unconfirmed",
    duplicates: signals.map((signal) => ({
      kind: signal.kind,
      shelterId: signal.shelterId,
      shelterName: names.get(signal.shelterId) ?? "",
    })),
    drafts: row.drafts,
  };
}

/**
 * A card, or the row's id alone if it can't make one: a single bad application must not take the
 * queue, the donation links and the funnel down with it. Logged by field and issue code, no values.
 */
function cardOf(
  row: ApplicationRow,
  existing: readonly DuplicateCandidate[],
  names: ReadonlyMap<string, string>,
): ApplicationQueueItemView | null {
  let reason: string;
  try {
    const parsed = ApplicationQueueItemViewSchema.safeParse(queueItemOf(row, existing, names));
    if (parsed.success) return parsed.data;
    reason = parsed.error.issues.map((issue) => `${issue.path.join(".")}:${issue.code}`).join(",");
  } catch {
    reason = "thrown";
  }
  warn(`[applications] ${row.shelterId}: application_unreadable (${reason})`);
  return null;
}

/** Only what the holder check shows (D3); the EDRPOU and registration date stay off the queue. */
function holderOf(entity: ShelterLegalEntity | null): PendingDonationItemView["legalEntity"] {
  if (entity === null) return null;
  switch (entity.kind) {
    case "registered_ngo":
    case "sole_proprietor":
      return { kind: entity.kind, name: entity.legalName };
    case "unregistered_initiative":
      return { kind: entity.kind, name: entity.contactPersonName };
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = entity;
      return unreachable;
    }
  }
}

export async function applicationsList(
  deps: ApplicationsDeps,
  _moderatorId: ModeratorId,
): Promise<ApplicationsQueueView> {
  const repo = applicationsRepo(deps.db);
  const [pending, earlyListed, donations, counts] = await Promise.all([
    repo.pending(),
    repo.earlyListed(),
    repo.pendingDonations(),
    funnelRepo(deps.db).countsSince(new Date(deps.now.getTime() - FUNNEL_WINDOW_DAYS * DAY_MS)),
  ]);
  const sources = pending.length === 0 ? [] : await repo.duplicateSources();
  const candidates = sources.map(candidateOf);
  const names = new Map(sources.map((source) => [source.shelterId, source.name]));
  const cards = pending.map((row) => ({ row, card: cardOf(row, candidates, names) }));
  return {
    applications: cards.flatMap(({ card }) => (card === null ? [] : [card])),
    unreadable: cards.flatMap(({ row, card }) =>
      card === null ? [{ shelterId: row.shelterId, appliedAt: readableDate(row.appliedAt) }] : [],
    ),
    listedUnverified: earlyListed.flatMap((row) => {
      // Accepted, so the email no longer matters: only the listing's clock does.
      const lifecycle = lifecycleOf(
        row.verification,
        earlyListingOf(row.earlyListingSince),
        "confirmed",
        deps.now,
      );
      return lifecycle.stage === "listed_unverified"
        ? [
            {
              shelterId: row.shelterId,
              name: row.name,
              cityId: row.cityId,
              expiresAt: lifecycle.expiresAt,
              daysLeft: lifecycle.daysLeft,
              remind: lifecycle.remind,
            },
          ]
        : [];
    }),
    pendingDonations: donations.map((row) => ({
      shelterId: row.shelterId,
      name: row.name,
      version: row.version,
      proposedUrl: row.pendingDonation.link.url,
      legalEntity: holderOf(row.legalEntity),
    })),
    funnel: {
      windowDays: FUNNEL_WINDOW_DAYS,
      counts: FUNNEL_EVENT_KINDS.map((kind) => ({ kind, count: counts[kind] })),
    },
  };
}

type Decided = Extract<ApplicationDecision, { kind: "ok" }>;

type DecisionSpec = {
  plan: (shelter: Shelter, email: EmailStatus) => ApplicationDecision;
  write: (
    shelter: Shelter,
    decided: Decided,
  ) => { decision: ApplicationDecisionWrite; entries: ShelterHistoryEntry[] };
  /** Which email the registrant gets once the write has landed. */
  mail: { kind: "approved" } | { kind: "rejected"; reason: ApplicationRejectionReason };
};

const verificationLine = (shelter: Shelter, decided: Decided): ShelterHistoryEntry => ({
  kind: "verification",
  event: decided.event,
  from: shelter.verification.status,
  to: decided.next.status,
});

/**
 * Both decisions: plan on the row read, refuse a stale form (CONFLICT), write once, and on a lost
 * write tell a decision that landed meanwhile (`already_decided`) from an applicant's edit
 * (CONFLICT). The funnel and the email follow a write that happened and never fail it.
 */
async function decide(
  deps: ApplicationsDeps,
  input: { shelterId: ShelterId; expectedVersion: number },
  errors: DecisionErrors,
  spec: DecisionSpec,
): Promise<ApplicationDecisionResult> {
  const shelter = await shelterRepo(deps.db).findById(input.shelterId);
  if (shelter === null) throw errors.NOT_FOUND();
  const facts = await registrationFactsRepo(deps.db).of(shelter.id);
  const planned = spec.plan(
    shelter,
    facts?.source === "self_registration" ? facts.email : "unconfirmed",
  );
  switch (planned.kind) {
    case "already_decided":
      return { kind: "already_decided", status: planned.status };
    case "email_unconfirmed":
      return { kind: "email_unconfirmed" };
    case "non_monotonic":
      // The server stamps `at`, so this is its own clock behind the last write: a deployment fault.
      throw new Error(`Shelter ${shelter.id}: the decision precedes its current state`);
    case "ok":
      break;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = planned;
      return unreachable;
    }
  }
  const { decision, entries } = spec.write(shelter, planned);
  const repo = applicationsRepo(deps.db);
  const result = await repo.decide({
    shelterId: shelter.id,
    expectedVersion: input.expectedVersion,
    decision,
    entries: entries.map((entry) => ({ id: deps.newId(), entry })),
    now: deps.now,
  });
  if (result === "lost") {
    const current = await shelterRepo(deps.db).findById(shelter.id);
    if (current === null) throw errors.NOT_FOUND();
    if (current.verification.status !== "application") {
      return { kind: "already_decided", status: current.verification.status };
    }
    throw errors.CONFLICT();
  }

  if (spec.mail.kind === "approved") {
    // Once per shelter by construction (`already_recorded`).
    await funnelRepo(deps.db)
      .record("approved", shelter.id, deps.now)
      .catch(() => warn(`[applications] ${shelter.id}: funnel_not_recorded`));
  }
  const transactional = deps.transactionalMail;
  try {
    const registrant = transactional === null ? null : await repo.registrantOf(shelter.id);
    if (transactional !== null && registrant !== null) {
      const mail = {
        ...spec.mail,
        shelterId: shelter.id,
        name: shelter.displayName,
        to: registrant.email,
        recipientUserId: registrant.userId,
      };
      transactional.schedule(async () => {
        await sendApplicationDecision(transactional.mail, mail);
      });
    }
  } catch {
    warn(`[applications] ${shelter.id}: decision_email_not_handed_over`);
  }
  return { kind: "decided", status: planned.next.status };
}

export function applicationsAccept(
  deps: ApplicationsDeps,
  moderatorId: ModeratorId,
  input: { shelterId: ShelterId; expectedVersion: number },
  errors: DecisionErrors,
): Promise<ApplicationDecisionResult> {
  return decide(deps, input, errors, {
    plan: (shelter, email) =>
      acceptApplication({ verification: shelter.verification, email, moderatorId, now: deps.now }),
    write: (shelter, decided) => ({
      decision: {
        kind: "accept",
        verification: decided.next,
        earlyListingSince: decided.earlyListingSince ?? deps.now,
      },
      entries: [
        verificationLine(shelter, decided),
        // An application has never been listed, so this is always its first period (P0-1).
        { kind: "early_listing_allowed", at: deps.now, moderatorId, period: 1, note: null },
      ],
    }),
    mail: { kind: "approved" },
  });
}

export function applicationsReject(
  deps: ApplicationsDeps,
  moderatorId: ModeratorId,
  input: { shelterId: ShelterId; expectedVersion: number; reason: ApplicationRejectionReason },
  errors: DecisionErrors,
): Promise<ApplicationDecisionResult> {
  return decide(deps, input, errors, {
    plan: (shelter) =>
      rejectApplication({
        verification: shelter.verification,
        reason: input.reason,
        moderatorId,
        now: deps.now,
      }),
    write: (shelter, decided) => ({
      decision: { kind: "reject", verification: decided.next, rejectedAt: deps.now },
      entries: [verificationLine(shelter, decided)],
    }),
    mail: { kind: "rejected", reason: input.reason },
  });
}
