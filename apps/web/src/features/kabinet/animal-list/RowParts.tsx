import type { FreshnessKind, ListingKind } from "@opika/domain";
import { uk } from "@opika/i18n";
import { Chip } from "../../../ui/Chip";
import { cx } from "../../../ui/cx";

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

/**
 * The three freshness pips on the kit's tokens: filled counts how far the last confirmation has
 * travelled, never a colour of alarm. Mirrors `freshnessPips` in packages/ui (the deck's copy,
 * still on the old tokens); `RowParts.test.tsx` fails if the two ever disagree on how many pips
 * are filled. Hidden from screen readers: the day count beside it says the same in words.
 */
const FILLED: Record<FreshnessKind, readonly ("success" | "muted" | "ink" | "empty")[]> = {
  fresh: ["success", "empty", "empty"],
  aging: ["muted", "muted", "empty"],
  stale: ["muted", "muted", "ink"],
};
const PIP = {
  success: "bg-success",
  muted: "bg-ink-2",
  ink: "bg-ink",
  empty: "border-2 border-ink-2",
} as const;

export const filledPipCount = (kind: FreshnessKind): number =>
  FILLED[kind].filter((fill) => fill !== "empty").length;

export function FreshnessPips({ kind }: { kind: FreshnessKind }) {
  return (
    <span aria-hidden="true" className="flex shrink-0 gap-1">
      {FILLED[kind].map((fill, index) => (
        <span key={index} className={cx("size-3 rounded-pill", PIP[fill])} />
      ))}
    </span>
  );
}
