import { createHmac, timingSafeEqual } from "node:crypto";
import type { FeedCursorData } from "@opika/db/repos";

/**
 * Cursor payload, signed with HMAC to prevent tampering.
 *
 * The cursor encodes:
 * - `kind`: which list this cursor belongs to (feed vs reveal)
 * - `filtersFingerprint`: a hash of the filters the cursor was issued against
 * - `lastUpdatedAt`: the ordering key
 * - `id`: the tiebreaker
 *
 * Signing prevents:
 * - Constructing cursors to skip directly to a position
 * - Reusing a feed cursor as a reveal cursor (kind mismatch)
 * - Reusing a cursor after changing filters (fingerprint mismatch)
 */
type CursorPayload = {
  kind: "feed" | "reveal";
  filtersFingerprint: string;
  lastUpdatedAt: string;
  id: string;
};

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex").slice(0, 16);
}

export function encodeFeedCursor(
  data: FeedCursorData,
  filtersFingerprint: string,
  secret: string,
): string {
  const payload: CursorPayload = {
    kind: "feed",
    filtersFingerprint,
    lastUpdatedAt: data.lastUpdatedAt.toISOString(),
    id: data.id,
  };
  const json = JSON.stringify(payload);
  const mac = sign(json, secret);
  return Buffer.from(`${mac}:${json}`).toString("base64url");
}

export type DecodedFeedCursor = {
  data: FeedCursorData;
  filtersFingerprint: string;
};

/**
 * Decode and verify a feed cursor.
 *
 * Returns null if:
 * - The cursor is malformed
 * - The HMAC signature doesn't match (tampered)
 * - The kind is not "feed"
 * - The filters fingerprint doesn't match the current filters
 */
export function decodeFeedCursor(
  cursor: string,
  expectedFingerprint: string,
  secret: string,
): DecodedFeedCursor | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const colonIndex = raw.indexOf(":");
    if (colonIndex === -1) return null;

    const mac = raw.slice(0, colonIndex);
    const json = raw.slice(colonIndex + 1);

    // Verify HMAC
    const expectedMac = sign(json, secret);
    if (mac.length !== expectedMac.length) return null;

    // Timing-safe comparison for the MAC
    const macBuffer = Buffer.from(mac);
    const expectedBuffer = Buffer.from(expectedMac);
    if (macBuffer.length !== expectedBuffer.length) return null;

    if (!timingSafeEqual(macBuffer, expectedBuffer)) return null;

    const payload = JSON.parse(json) as CursorPayload;

    if (payload.kind !== "feed") return null;
    if (payload.filtersFingerprint !== expectedFingerprint) return null;

    const lastUpdatedAt = new Date(payload.lastUpdatedAt);
    if (Number.isNaN(lastUpdatedAt.getTime())) return null;

    return {
      data: { lastUpdatedAt, id: payload.id },
      filtersFingerprint: payload.filtersFingerprint,
    };
  } catch {
    return null;
  }
}
