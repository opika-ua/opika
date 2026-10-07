import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Cursor payload, signed with HMAC to prevent tampering.
 *
 * The cursor encodes:
 * - `kind`: which list this cursor belongs to (feed vs reveal)
 * - `filtersFingerprint`: a hash of the filters the cursor was issued against
 * - `at`: the ordering value — the feed's `last_confirmed_at`, the reveal
 *   history's `revealed_at` (each list maps its own key onto this one, so
 *   neither is stored under the other's name)
 * - `id`: the tiebreaker
 *
 * The key was `lastUpdatedAt` until H2-3 moved the feed's ordering onto
 * confirmation, and renamed so neither list's value travels under the other's
 * name. Cursors issued before that change decode as invalid
 * (`INVALID_CURSOR`): the deck shows its `sessionExpired` error state, whose
 * retry restarts the feed from the first page. `reveals.listMine` has no
 * client caller yet, so no reveal cursor is in flight anywhere.
 *
 * Signing prevents:
 * - Constructing cursors to skip directly to a position
 * - Reusing a feed cursor as a reveal cursor (kind mismatch)
 * - Reusing a cursor after changing filters (fingerprint mismatch)
 */
type CursorPayload = {
  kind: "feed" | "reveal";
  filtersFingerprint: string;
  at: string;
  id: string;
};

/** A keyset position: the ordering value and the id that breaks ties. */
export type CursorPosition = { at: Date; id: string };

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex").slice(0, 16);
}

function encodeCursor(kind: CursorPayload["kind"], data: CursorPosition, secret: string): string {
  const payload: CursorPayload = {
    kind,
    filtersFingerprint: "",
    at: data.at.toISOString(),
    id: data.id,
  };
  const json = JSON.stringify(payload);
  const mac = sign(json, secret);
  return Buffer.from(`${mac}:${json}`).toString("base64url");
}

function encodeCursorWithFingerprint(
  kind: CursorPayload["kind"],
  data: CursorPosition,
  fingerprint: string,
  secret: string,
): string {
  const payload: CursorPayload = {
    kind,
    filtersFingerprint: fingerprint,
    at: data.at.toISOString(),
    id: data.id,
  };
  const json = JSON.stringify(payload);
  const mac = sign(json, secret);
  return Buffer.from(`${mac}:${json}`).toString("base64url");
}

export function encodeFeedCursor(
  data: CursorPosition,
  filtersFingerprint: string,
  secret: string,
): string {
  return encodeCursorWithFingerprint("feed", data, filtersFingerprint, secret);
}

export function encodeRevealCursor(data: CursorPosition, secret: string): string {
  return encodeCursor("reveal", data, secret);
}

type DecodedCursor = {
  data: CursorPosition;
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

    const at = new Date(payload.at);
    if (Number.isNaN(at.getTime())) return null;

    return {
      data: { at, id: payload.id },
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
): { data: CursorPosition } | null {
  return decodeCursor(cursor, "reveal", null, secret);
}
