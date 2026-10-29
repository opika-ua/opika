import type { ListingKind } from "@opika/domain";
import { uk } from "@opika/i18n";
import { Chip } from "../../../ui/Chip";

/**
 * One status language for a card's state (draft, published, reserved, adopted, withdrawn). The
 * cards people can be shown carry a filled chip, the rest a quiet one, and no tone is a warning:
 * a card that is stale is not a status here, only its date says so (freshness is never alarming).
 */
type StatusLook =
  | { kind: "status"; tone: "success" | "ink" }
  | { kind: "info"; tone: "neutral" | "outline" };

const STATUS_LOOK: Record<ListingKind, StatusLook> = {
  draft: { kind: "info", tone: "outline" },
  published: { kind: "status", tone: "success" },
  reserved: { kind: "status", tone: "ink" },
  adopted: { kind: "info", tone: "neutral" },
  withdrawn: { kind: "info", tone: "neutral" },
};

export function ListingStatusChip({ kind }: { kind: ListingKind }) {
  const look = STATUS_LOOK[kind];
  const label = uk.kabinet.listingStatus[kind];
  return look.kind === "status" ? (
    <Chip kind="status" tone={look.tone} className="self-start">
      {label}
    </Chip>
  ) : (
    <Chip kind="info" tone={look.tone} className="self-start">
      {label}
    </Chip>
  );
}
