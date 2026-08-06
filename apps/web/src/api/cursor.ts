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

function encodeCursor(kind: CursorPayload["kind"], data: FeedCursorData, secret: string): string {
  const payload: CursorPayload = {
    kind,
    filtersFingerprint: "",
    lastUpdatedAt: data.lastUpdatedAt.toISOString(),
    id: data.id,
  };
  const json = JSON.stringify(payload);
  const mac = sign(json, secret);
  return Buffer.from(`${mac}:${json}`).toString("base64url");
}

function encodeCursorWithFingerprint(
  kind: CursorPayload["kind"],
  data: FeedCursorData,
  fingerprint: string,
  secret: string,
): string {
  const payload: CursorPayload = {
    kind,
    filtersFingerprint: fingerprint,
    lastUpdatedAt: data.lastUpdatedAt.toISOString(),
    id: data.id,
  };
  const json = JSON.stringify(payload);
  const mac = sign(json, secret);
  return Buffer.from(`${mac}:${json}`).toString("base64url");
}

export function encodeFeedCursor(
  data: FeedCursorData,
  filtersFingerprint: string,
  secret: string,
): string {
  return encodeCursorWithFingerprint("feed", data, filtersFingerprint, secret);
}

export function encodeRevealCursor(data: FeedCursorData, secret: string): string {
  return encodeCursor("reveal", data, secret);
}

type DecodedCursor = {
  data: FeedCursorData;
  filtersFingerprint: string;
};

export type DecodedFeedCursor = DecodedCursor;

/**
 * Decode and verify a signed cursor, checking kind and optional fingerprint.
 *
 * Returns null if:
 * - The cursor is malformed
 * - The HMAC signature doesn't match (tampered)
 * - The kind doesn't match expectedKind
 * - The filters fingerprint doesn't match expectedFingerprint (if provided)
 */
function decodeCursor(
  cursor: string,
  expectedKind: CursorPayload["kind"],
  expectedFingerprint: string | null,
  secret: string,
): DecodedCursor | null {
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

    if (payload.kind !== expectedKind) return null;
    if (expectedFingerprint !== null && payload.filtersFingerprint !== expectedFingerprint)
      return null;

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

export function decodeFeedCursor(
  cursor: string,
  expectedFingerprint: string,
  secret: string,
): DecodedFeedCursor | null {
  return decodeCursor(cursor, "feed", expectedFingerprint, secret);
}

export function decodeRevealCursor(
  cursor: string,
  secret: string,
): { data: FeedCursorData } | null {
  return decodeCursor(cursor, "reveal", null, secret);
}
