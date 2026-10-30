import type { ListingKind, ShelterVerification } from "@opika/domain";
import { uk } from "@opika/i18n";
import { Chip } from "../../ui/Chip";

/**
 * One status language for the kabinet: a card's state (animal list) and a shelter's state (operator
 * screens, the profile's verification block). Soft brand tints, no tone is a warning: a stale card
 * is not a status here, only its date says so (freshness is never alarming).
 */
type Look =
  | { kind: "status"; tone: "published" | "reserved" | "adopted" | "withdrawn" }
  | { kind: "info"; tone: "outline" };

const LISTING_LOOK: Record<ListingKind, Look> = {
  draft: { kind: "info", tone: "outline" },
  published: { kind: "status", tone: "published" },
  reserved: { kind: "status", tone: "reserved" },
  adopted: { kind: "status", tone: "adopted" },
  withdrawn: { kind: "status", tone: "withdrawn" },
};

const VERIFICATION_LOOK: Record<ShelterVerification["status"], Look> = {
  verified: { kind: "status", tone: "published" },
  pending: { kind: "status", tone: "reserved" },
  under_review: { kind: "status", tone: "reserved" },
  paused: { kind: "status", tone: "withdrawn" },
  suspended: { kind: "status", tone: "adopted" },
  rejected: { kind: "status", tone: "adopted" },
};

function LookChip({ look, label, className }: { look: Look; label: string; className?: string }) {
  return look.kind === "status" ? (
    <Chip kind="status" tone={look.tone} {...(className ? { className } : {})}>
      {label}
    </Chip>
  ) : (
    <Chip kind="info" tone={look.tone} {...(className ? { className } : {})}>
      {label}
    </Chip>
  );
}

export function ListingStatusChip({ kind }: { kind: ListingKind }) {
  return (
    <LookChip
      look={LISTING_LOOK[kind]}
      label={uk.kabinet.listingStatus[kind]}
      className="self-start"
    />
  );
}

export function VerificationStatusChip({ status }: { status: ShelterVerification["status"] }) {
  return <LookChip look={VERIFICATION_LOOK[status]} label={uk.kabinet.profileStatus[status]} />;
}
