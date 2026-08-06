import type { Database } from "@opika/db";
import { adopterRepo, sessionRepo } from "@opika/db/repos";
import type { AdopterId, AdopterProfile } from "@opika/domain";
import { parseSessionToken } from "./cookie";
import { hashesEqual, hashToken } from "./token";

/**
 * Session expiry policy.
 *
 * Absolute: a session is rejected after this many seconds regardless of
 * activity. Forces periodic re-creation, limiting the window if a token
 * is leaked.
 *
 * Idle: a session is rejected if the last request was more than this
 * many seconds ago. Catches abandoned devices.
 */
export type SessionPolicy = {
  absoluteExpirySeconds: number;
  idleExpirySeconds: number;
};

export const DEFAULT_SESSION_POLICY: SessionPolicy = {
  absoluteExpirySeconds: 30 * 24 * 3600, // 30 days
  idleExpirySeconds: 7 * 24 * 3600, // 7 days
};

export type SessionResult =
  | { ok: true; adopterId: AdopterId; tokenHash: string }
  | { ok: false; reason: "no_token" | "invalid" | "expired" };

/**
 * Validate a session from a Cookie header.
 *
 * Get-or-reject, never get-or-create: an unknown token is a rejected
 * session, not a new one. Creating on unknown values would let an
 * attacker enumerate sessions by sending arbitrary tokens.
 */
export async function validateSession(
  db: Database,
  cookieHeader: string | null,
  now: Date,
  policy: SessionPolicy = DEFAULT_SESSION_POLICY,
): Promise<SessionResult> {
  const token = parseSessionToken(cookieHeader);
  if (!token) return { ok: false, reason: "no_token" };

  const hash = hashToken(token);
  const sessions = sessionRepo(db);
  const row = await sessions.findByHash(hash);

  if (!row) return { ok: false, reason: "invalid" };

  // Timing-safe comparison even though we already found by hash —
  // the DB query timing may leak whether the hash exists, but
  // comparing the returned hash catches any future refactor that
  // changes to a range query or prefix match.
  if (!hashesEqual(row.tokenHash, hash)) {
    return { ok: false, reason: "invalid" };
  }

  // Absolute expiry
  const ageMs = now.getTime() - row.createdAt.getTime();
  if (ageMs > policy.absoluteExpirySeconds * 1000) {
    await sessions.deleteByHash(hash);
    return { ok: false, reason: "expired" };
  }

  // Idle expiry
  const idleMs = now.getTime() - row.lastSeenAt.getTime();
  if (idleMs > policy.idleExpirySeconds * 1000) {
    await sessions.deleteByHash(hash);
    return { ok: false, reason: "expired" };
  }

  // Touch last seen (fire-and-forget — a failed touch should not
  // break the request)
  sessions.touchLastSeen(hash, now).catch(() => {});

  return { ok: true, adopterId: row.adopterId, tokenHash: hash };
}

/**
 * Load the adopter profile for a validated session.
 */
export async function loadAdopter(
  db: Database,
  adopterId: AdopterId,
): Promise<AdopterProfile | null> {
  const adopters = adopterRepo(db);
  return adopters.findById(adopterId);
}
