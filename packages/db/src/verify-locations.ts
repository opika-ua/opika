import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type ExactAddress,
  type LocationPrivacyPolicy,
  type PublicLocation,
  publicLocationOf,
  type ShelterId,
  testOnlyLocationPolicy,
} from "@opika/domain";
import { createDatabase, type Database } from "./client";
import { productionLocationPolicy } from "./location-policy";
import { assertProductionWriteAllowed } from "./prod-guard";
import { shelters } from "./schema/shelters";
import { isSeedShelterId, SEED_LOCATION_POLICY_KEY } from "./seed-ids";

/**
 * `pnpm --filter @opika/db location:verify`: read-only (RG-Q10, Oleksii). For
 * every shelter, recomputes the public location from its exact address with
 * the configured `LOCATION_HMAC_SECRET` and compares it with the stored one.
 *
 * Why it exists: the registry recomputes a shelter's public location whenever
 * its address changes, using the key deployed to the app. If that key differs
 * from the one the onboarding script used, the first edit silently moves the
 * shelter's fuzzed pin to a new offset, and anyone holding both samples gets
 * two draws of the fuzz. So before the app's key goes live, this proves it is
 * the same key: zero mismatches, or the deploy waits.
 *
 * Prints counts only, never coordinates, addresses or ids: the point of the
 * fuzz is that the exact position doesn't leave the database.
 */

/**
 * Every shelter lands in exactly one count. Seeded rows are classified by
 * identity, not by key (RG-Q11, Oleksii): the test-only key is only
 * acceptable on an id from the seed's reserved range. On any other id it is a
 * privacy bug (that offset is reproducible from public code), and a failure
 * of its own, never folded into "mismatch".
 */
export type LocationReport = {
  match: number;
  /** Seed-range id, test-only key: the demo corpus. Not a failure. */
  demo: number;
  /** Outside the seed range, test-only key. Always a failure. */
  testKeyOnRealShelter: number;
  /** Matches neither key. */
  mismatch: number;
};

/** Key-order-independent equality for the jsonb round trip. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );

export function compareLocations(
  rows: readonly { id: string; exactAddress: ExactAddress; publicLocation: PublicLocation }[],
  policy: LocationPrivacyPolicy,
  testPolicy: LocationPrivacyPolicy,
): LocationReport {
  const report: LocationReport = { match: 0, demo: 0, testKeyOnRealShelter: 0, mismatch: 0 };
  for (const row of rows) {
    const stored = canonical(row.publicLocation);
    const id = row.id as ShelterId;
    if (canonical(publicLocationOf(id, row.exactAddress, policy)) === stored) {
      report.match += 1;
    } else if (canonical(publicLocationOf(id, row.exactAddress, testPolicy)) === stored) {
      if (isSeedShelterId(row.id)) report.demo += 1;
      else report.testKeyOnRealShelter += 1;
    } else {
      report.mismatch += 1;
    }
  }
  return report;
}

export async function verifyShelterLocations(
  db: Database,
  secret: string,
): Promise<LocationReport> {
  const rows = await db
    .select({
      id: shelters.id,
      exactAddress: shelters.exactAddress,
      publicLocation: shelters.publicLocation,
    })
    .from(shelters);
  // The seed's own policy, recomputed to recognise its rows. It refuses to
  // exist under NODE_ENV=production, which `main` checks first.
  return compareLocations(
    rows,
    productionLocationPolicy(secret),
    testOnlyLocationPolicy(SEED_LOCATION_POLICY_KEY),
  );
}

export function formatReport(report: LocationReport): string[] {
  const lines = [
    `match     ${report.match}`,
    `demo      ${report.demo}  (seeded fictional shelters on the test-only key)`,
    `MISMATCH  ${report.mismatch}`,
  ];
  if (report.testKeyOnRealShelter > 0) {
    lines.push(
      `PRIVACY   ${report.testKeyOnRealShelter}  shelter(s) outside the seed's id range carry the test-only key's offset: ` +
        "their fuzz is reproducible from public code. Recompute them with the production key.",
    );
  }
  return lines;
}

/** The gate: a demo row passes, a mismatch or a test key on a real shelter fails. */
export const exitCodeOf = (report: LocationReport): 0 | 1 =>
  report.mismatch > 0 || report.testKeyOnRealShelter > 0 ? 1 : 0;

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }
  // It writes nothing, but it reads every shelter's exact address, so it
  // takes the same explicit --prod as the scripts that write (Oleksii).
  assertProductionWriteAllowed(databaseUrl, process.argv, process.env, "read");
  console.log(`Target host: ${new URL(databaseUrl).hostname}`);

  if (process.env.NODE_ENV === "production") {
    console.error(
      "ERROR: run without NODE_ENV=production: recognising seeded rows needs the seed's test-only policy.",
    );
    process.exit(1);
  }
  const secret = process.env.LOCATION_HMAC_SECRET;
  if (!secret) {
    console.error("ERROR: LOCATION_HMAC_SECRET is not set.");
    process.exit(1);
  }
  const report = await verifyShelterLocations(createDatabase(databaseUrl), secret);
  for (const line of formatReport(report)) console.log(line);
  process.exit(exitCodeOf(report));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
