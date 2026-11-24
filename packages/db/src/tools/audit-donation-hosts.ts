import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type LinkAddressProblem, linkAddressProblemOf } from "@opika/domain";
import { isNotNull, or } from "drizzle-orm";
import { createDatabase, type Database } from "../client";
import { assertProductionWriteAllowed, databaseTargetLine } from "../prod-guard";
import { shelters } from "../schema/shelters";

/**
 * `pnpm --filter @opika/db donation-links:audit-hosts`: read-only pre-check (owner, 2026-11-24).
 * Counts the stored donation links, live and proposed, that the new rule would refuse: an IP host
 * or an explicit port. It deletes and rewrites nothing; stored links keep rendering.
 * Prints counts and shelter ids only, never a URL.
 */

export type StoredDonationRow = {
  id: string;
  liveUrl: string | null;
  proposedUrl: string | null;
};

type Found = Readonly<Record<LinkAddressProblem, readonly string[]>>;

export type DonationHostAudit = {
  checked: { live: number; proposed: number };
  live: Found;
  proposed: Found;
};

const found = (
  rows: readonly StoredDonationRow[],
  url: (row: StoredDonationRow) => string | null,
) => {
  const out: Record<LinkAddressProblem, string[]> = { ip_host: [], port: [] };
  for (const row of rows) {
    const value = url(row);
    const problem = value === null ? null : linkAddressProblemOf(value);
    if (problem !== null) out[problem].push(row.id);
  }
  return { ip_host: out.ip_host.sort(), port: out.port.sort() };
};

export function auditDonationHosts(rows: readonly StoredDonationRow[]): DonationHostAudit {
  return {
    checked: {
      live: rows.filter((row) => row.liveUrl !== null).length,
      proposed: rows.filter((row) => row.proposedUrl !== null).length,
    },
    live: found(rows, (row) => row.liveUrl),
    proposed: found(rows, (row) => row.proposedUrl),
  };
}

export async function readStoredDonationLinks(db: Database): Promise<StoredDonationRow[]> {
  const rows = await db
    .select({
      id: shelters.id,
      donation: shelters.donation,
      pendingDonation: shelters.pendingDonation,
    })
    .from(shelters)
    .where(or(isNotNull(shelters.donation), isNotNull(shelters.pendingDonation)));
  return rows.map((row) => ({
    id: row.id,
    liveUrl: row.donation?.url ?? null,
    proposedUrl: row.pendingDonation?.link.url ?? null,
  }));
}

export function formatAudit(audit: DonationHostAudit): string[] {
  const line = (label: string, ids: readonly string[]) =>
    `${label} ${ids.length}${ids.length === 0 ? "" : `  shelters: ${ids.join(", ")}`}`;
  return [
    `checked   live ${audit.checked.live}, proposed ${audit.checked.proposed}`,
    line("live      IP host", audit.live.ip_host),
    line("live      port   ", audit.live.port),
    line("proposed  IP host", audit.proposed.ip_host),
    line("proposed  port   ", audit.proposed.port),
    "Nothing was changed.",
  ];
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }
  // It writes nothing, but it reads every shelter's links, so production takes --prod (as location:verify).
  assertProductionWriteAllowed(databaseUrl, process.argv, process.env, "read");
  console.log(databaseTargetLine(databaseUrl));
  const audit = auditDonationHosts(await readStoredDonationLinks(createDatabase(databaseUrl)));
  for (const line of formatAudit(audit)) console.log(line);
  process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
