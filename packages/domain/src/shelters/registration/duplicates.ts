import type { CityId, ShelterId } from "../../primitives/ids";
import { linkMatchKey, shelterNameMatchKey } from "./normalize";

/** One shelter as the duplicate check sees it, the application and every existing one alike. */
export type DuplicateCandidate = {
  shelterId: ShelterId;
  name: string;
  cityId: CityId;
  /** Admin and invitation addresses; compared trimmed and lowercased. */
  emails: readonly string[];
  /** Submitted links and the website, Instagram and Facebook contacts, as URLs. */
  links: readonly string[];
};

export const DUPLICATE_SIGNAL_KINDS = ["same_name_city", "same_email", "same_link"] as const;
export type DuplicateSignalKind = (typeof DUPLICATE_SIGNAL_KINDS)[number];

export type DuplicateSignal = { kind: DuplicateSignalKind; shelterId: ShelterId };

const emailKey = (email: string): string => email.trim().toLowerCase();

const keysOf = (links: readonly string[]): Set<string> =>
  new Set(links.map(linkMatchKey).filter((key): key is string => key !== null));

/**
 * Exact matches on normalized values, no fuzzy matching (§11.5: `pg_trgm` only if real duplicates
 * get through). At most one signal per kind and shelter; the application itself is skipped.
 */
export function duplicateSignals(
  application: DuplicateCandidate,
  existing: readonly DuplicateCandidate[],
): readonly DuplicateSignal[] {
  const nameKey = shelterNameMatchKey(application.name);
  const emails = new Set(application.emails.map(emailKey));
  const links = keysOf(application.links);
  const signals: DuplicateSignal[] = [];

  for (const other of existing) {
    if (other.shelterId === application.shelterId) continue;
    if (
      nameKey !== "" &&
      other.cityId === application.cityId &&
      shelterNameMatchKey(other.name) === nameKey
    ) {
      signals.push({ kind: "same_name_city", shelterId: other.shelterId });
    }
    if (other.emails.some((email) => emails.has(emailKey(email)))) {
      signals.push({ kind: "same_email", shelterId: other.shelterId });
    }
    if ([...keysOf(other.links)].some((key) => links.has(key))) {
      signals.push({ kind: "same_link", shelterId: other.shelterId });
    }
  }
  return signals;
}
