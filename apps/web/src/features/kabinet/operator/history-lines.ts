import type { ShelterAdminView } from "@opika/contracts";
import {
  type AnimalEditedField,
  donationHost,
  ERASED_ADMIN_EMAIL,
  historyEntryAt,
  type ListingKind,
  type ModeratorId,
  type ShelterActor,
  type ShelterAdminId,
  type ShelterHistoryEntry,
  type VerificationEvent,
} from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { operatorStatusLabel } from "../verification-label";

/**
 * One line of a shelter's history as the operator reads it on S4 (R-UI 1).
 *
 * His rule (R-UI copy, "Code changes the copy relies on", verbatim): "history
 * lines are impersonal, with the actor appended as « · {actor}»". So `text` is
 * the impersonal line and `actor` who did it, joined by `historyLineText`;
 * Ukrainian's gendered past tense never has to guess anyone's gender.
 *
 * Pure, no hooks and no clock: the server page and the client «Показати ще»
 * both render with it, and every entry kind is tested table by table.
 */
/** `actor` is `null` for a line nobody did: a period that ran out on its own. */
export type HistoryLine = { at: Date; text: string; actor: string | null };

/** Who the people in a history are, as far as the page can tell. */
export type HistoryPeople = {
  /** The operator reading the page: their own lines read «ви». */
  me: ModeratorId;
  /** The shelter's admins and invitees now (S4's list): names for ids and addresses. */
  admins: readonly Pick<ShelterAdminView, "id" | "name" | "email">[];
};

export const historyLineText = (line: HistoryLine): string =>
  line.actor === null ? line.text : `${line.text} · ${line.actor}`;

const t = uk.kabinet.operator.history;
const labels = uk.kabinet.animalHistoryLabels;

/**
 * An operator's line: «ви» when it is the operator reading, else the generic
 * label (RU-T8: there is one operator today, so another operator's id is the
 * onboarding script's stand-in or a former operator, never named).
 */
const operatorActor = (moderatorId: ModeratorId, people: HistoryPeople): string =>
  moderatorId === people.me ? t.actor.you : t.actor.operator;

/** A shelter admin by their current name; once removed, the history has only their id. */
const adminActor = (shelterAdminId: ShelterAdminId, people: HistoryPeople): string =>
  people.admins.find((admin) => admin.id === shelterAdminId)?.name ?? t.actor.formerAdmin;

const actorOf = (actor: ShelterActor, people: HistoryPeople): string =>
  actor.kind === "moderator"
    ? operatorActor(actor.moderatorId, people)
    : adminActor(actor.shelterAdminId, people);

/**
 * The name behind an address in an admin line. History keeps the address
 * only, so the name is found among the shelter's current admins and
 * invitees; for anyone no longer there it isn't known (RU1-T3).
 */
const nameAt = (email: string, people: HistoryPeople): string | null =>
  // Every erased address is the same placeholder, so a lookup would match some other erased invitation.
  email === ERASED_ADMIN_EMAIL
    ? null
    : (people.admins.find((admin) => admin.email.toLowerCase() === email.toLowerCase())?.name ??
      null);

/** What an address reads as in a line: the label once it was erased, else its name or the address. */
const addressOrName = (email: string, people: HistoryPeople): string =>
  email === ERASED_ADMIN_EMAIL ? t.addressErased : (nameAt(email, people) ?? email);

const listingLabel = (kind: ListingKind): string => labels.listing[kind];

const fieldLabel = (field: AnimalEditedField): string => {
  switch (field) {
    case "vaccination":
      return uk.medical.vaccination;
    case "spayNeuter":
      return uk.medical.spayNeuter;
    case "name":
    case "species":
    case "sex":
    case "size":
    case "coatLength":
    case "colour":
    case "age":
    case "description":
    case "temperament":
    case "medicalNotes":
    case "photos":
      return labels.field[field];
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled field; unreachable at runtime */
    default: {
      const unreachable: never = field;
      return unreachable;
    }
  }
};

/**
 * A rename's line (R-UI 4), «Назва притулку: «{from}» → «{to}»», made only of
 * his strings: the S2 field's label (`create.name`) put through his own
 * «{name}: «{from}» → «{to}»» line for a value that moved
 * (`animal_listing_changed`). Operator screens take no `[COPY PENDING]`
 * string, and this needs no new one: it says what changed, from what, to
 * what, as that line already does for a listing.
 */
const renameLine = (from: string, to: string): string =>
  fillTemplate(t.animal_listing_changed, { name: uk.kabinet.operator.create.name, from, to });

/** A reason's line: «{code}. {note}», the note left off when none was written. */
const withNote = (template: string, code: string, note: string | null): string =>
  fillTemplate(template, { code, note: note ?? "" }).trimEnd();

function verificationLine(
  event: VerificationEvent,
  to: ShelterHistoryEntry & { kind: "verification" },
  people: HistoryPeople,
): { text: string; actor: string } {
  const v = t.verification;
  switch (event.type) {
    case "start_review":
      return { text: v.start_review, actor: operatorActor(event.reviewerId, people) };
    case "approve":
      return { text: v.approve, actor: operatorActor(event.moderatorId, people) };
    case "reject":
      return {
        text: withNote(
          v.reject,
          uk.kabinet.operator.codes.rejection[event.reason.code],
          event.reason.note,
        ),
        actor: operatorActor(event.moderatorId, people),
      };
    case "suspend":
      return {
        text: withNote(
          v.suspend,
          uk.kabinet.operator.codes.suspension[event.reason.code],
          event.reason.note,
        ),
        actor: operatorActor(event.moderatorId, people),
      };
    case "reinstate":
      return {
        text: fillTemplate(v.reinstate, { status: operatorStatusLabel(to.to) }),
        actor: operatorActor(event.moderatorId, people),
      };
    case "resubmit":
      return { text: v.resubmit, actor: actorOf(event.actor, people) };
    case "pause":
      return {
        // `other` carries no information, so it keeps the plain line.
        text:
          event.reason.code === "other"
            ? v.pause
            : fillTemplate(v.pause_reason, {
                reason: uk.kabinet.profileEdit.pause.reason[event.reason.code],
              }),
        actor: actorOf(event.actor, people),
      };
    case "resume":
      return { text: v.resume, actor: actorOf(event.actor, people) };
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled event; unreachable at runtime */
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}

function lineOf(
  entry: ShelterHistoryEntry,
  people: HistoryPeople,
): Pick<HistoryLine, "text" | "actor"> {
  switch (entry.kind) {
    case "verification":
      return verificationLine(entry.event, entry, people);
    case "shelter_created":
      return {
        text: entry.via === "script" ? t.shelter_created_script : t.shelter_created,
        actor: operatorActor(entry.moderatorId, people),
      };
    case "admin_invited":
      return {
        // The line shows the address beside the name, so an unknown name reads
        // «Не записано» rather than repeating the address (RU1-T3).
        text:
          entry.email === ERASED_ADMIN_EMAIL
            ? t.admin_invited_erased
            : fillTemplate(t.admin_invited, {
                name: nameAt(entry.email, people) ?? uk.kabinet.profileNotRecorded,
                email: entry.email,
              }),
        actor: operatorActor(entry.moderatorId, people),
      };
    case "admin_invitation_resent":
      return {
        text: fillTemplate(t.admin_invitation_resent, {
          name: addressOrName(entry.email, people),
        }),
        actor: operatorActor(entry.moderatorId, people),
      };
    case "admin_joined":
      return {
        text:
          entry.email === ERASED_ADMIN_EMAIL
            ? uk.kabinet.history.adminJoinedErased
            : fillTemplate(uk.kabinet.history.adminJoined, { email: entry.email }),
        actor: adminActor(entry.shelterAdminId, people),
      };
    case "admin_removed":
      return {
        text: fillTemplate(entry.wasPending ? t.admin_removed_pending : t.admin_removed, {
          name: addressOrName(entry.email, people),
        }),
        actor: operatorActor(entry.moderatorId, people),
      };
    case "contact_changed":
      return { text: t.contact_changed, actor: actorOf(entry.actor, people) };
    case "freshness_sentence_changed":
      return { text: t.freshness_sentence_changed, actor: actorOf(entry.actor, people) };
    case "description_changed":
      return { text: t.description_changed, actor: actorOf(entry.actor, people) };
    case "logo_changed":
      return { text: t.logo_changed, actor: actorOf(entry.actor, people) };
    case "donation_proposed":
      return {
        text: fillTemplate(t.donation_proposed, { host: donationHost(entry.link) }),
        actor: actorOf(entry.actor, people),
      };
    case "donation_proposal_cancelled":
      return { text: t.donation_proposal_cancelled, actor: actorOf(entry.actor, people) };
    case "donation_decided":
      return {
        text: entry.decision === "approved" ? t.donation_approved : t.donation_rejected,
        actor: operatorActor(entry.moderatorId, people),
      };
    case "donation_removed": {
      const removed = fillTemplate(t.donation_removed, {
        host: donationHost(entry.previousLive),
        code: uk.kabinet.operator.codes.donationRemoval[entry.reason.code],
        note: entry.reason.note,
      }).trimEnd();
      return {
        text: entry.clearedPending ? `${removed} ${t.donation_removed_pending}` : removed,
        actor: operatorActor(entry.moderatorId, people),
      };
    }
    case "donation_suspended":
      return {
        text: fillTemplate(
          entry.outcome === "moved_to_pending"
            ? t.donation_suspended_to_pending
            : t.donation_suspended_recorded,
          { host: donationHost(entry.previousLive) },
        ),
        actor: operatorActor(entry.moderatorId, people),
      };
    case "verified_data_changed":
      return {
        // A null previous is the first value of a shelter created without it (minimal create).
        text: (entry.change.previous === null ? t.verified_data_added : t.verified_data_changed)[
          entry.change.field
        ],
        actor: operatorActor(entry.moderatorId, people),
      };
    case "display_name_changed":
      return {
        text: renameLine(entry.from, entry.to),
        actor: operatorActor(entry.moderatorId, people),
      };
    case "freshness_reminder_changed":
      return {
        text: entry.off ? t.freshness_reminder_off : t.freshness_reminder_on,
        actor: operatorActor(entry.moderatorId, people),
      };
    case "evidence_added":
      return {
        text: fillTemplate(t.evidence_added, {
          kinds: entry.items.map((item) => uk.kabinet.operator.evidence.kind[item.kind]).join(", "),
        }),
        actor: operatorActor(entry.moderatorId, people),
      };
    // The approved N4-N6 lines, as the shelter reads them; the period and note stay in the record.
    case "early_listing_allowed":
      return { text: t.early_listing_allowed, actor: operatorActor(entry.moderatorId, people) };
    case "early_listing_revoked":
      return { text: t.early_listing_revoked, actor: operatorActor(entry.moderatorId, people) };
    case "early_listing_lapsed":
      return { text: t.early_listing_lapsed, actor: null };
    case "animals_imported":
      return {
        text: fillTemplate(t.animals_imported, { count: String(entry.count) }),
        actor: operatorActor(entry.moderatorId, people),
      };
    case "animal_created":
      return {
        text: fillTemplate(t.animal_created, { name: entry.animalName }),
        actor: actorOf(entry.actor, people),
      };
    case "animal_edited":
      return {
        text: fillTemplate(t.animal_edited, {
          name: entry.animalName,
          fields: entry.fields.map(fieldLabel).join(", "),
        }),
        actor: actorOf(entry.actor, people),
      };
    case "animal_listing_changed":
      return {
        text: fillTemplate(t.animal_listing_changed, {
          name: entry.animalName,
          from: listingLabel(entry.from),
          to: listingLabel(entry.to),
        }),
        actor: actorOf(entry.actor, people),
      };
    case "animal_deleted":
      return {
        text: fillTemplate(t.animal_deleted, { name: entry.animalName }),
        actor: actorOf(entry.actor, people),
      };
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = entry;
      return unreachable;
    }
  }
}

export function historyLineOf(entry: ShelterHistoryEntry, people: HistoryPeople): HistoryLine {
  return { at: historyEntryAt(entry), ...lineOf(entry, people) };
}
