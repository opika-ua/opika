import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cityRepo } from "../src/repos/city-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { shelters } from "../src/schema/shelters";
import { makeCity, makeShelter, setupTestDatabase, truncateAll } from "../src/test-utils/index";
import {
  auditDonationHosts,
  formatAudit,
  readStoredDonationLinks,
} from "../src/tools/audit-donation-hosts";

/** Owner, 2026-11-24: count stored donation links with an IP host or a port; ids, never URLs. */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

let cityId: string;
beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  cityId = city.id;
});

const PROPOSED_AT = new Date("2026-11-20T10:00:00.000Z");
const link = (url: string) => ({ url, provider: "other" as const });

/** A shelter with these stored links, written past every rule, as a row stored before it. */
const insert = async (live: string | null, proposed: string | null): Promise<string> => {
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId } as never,
    donation: live === null ? null : link(live),
    pendingDonation:
      proposed === null
        ? null
        : { link: link(proposed), proposedAt: PROPOSED_AT, proposedBy: null },
  });
  await shelterRepo(db).insert(shelter);
  return shelter.id;
};

const URLS = {
  ipLive: "https://192.0.2.10/jar/TestJar1",
  ipv6Proposed: "https://[2001:db8::1]/jar/TestJar2",
  portLive: "https://send.monobank.ua:8443/jar/TestJar3",
  defaultPortProposed: "https://send.monobank.ua:443/jar/TestJar4",
  clean: "https://send.monobank.ua/jar/TestJar5",
};

describe("donation-links:audit-hosts", () => {
  it("counts live and proposed links by problem, names the shelters, prints no URL", async () => {
    const a = await insert(URLS.ipLive, URLS.ipv6Proposed);
    const b = await insert(URLS.portLive, URLS.clean);
    const c = await insert(URLS.clean, URLS.defaultPortProposed);
    await insert(URLS.clean, null);
    await insert(null, null);

    const before = await db.select().from(shelters);
    const audit = auditDonationHosts(await readStoredDonationLinks(db));
    expect(audit).toEqual({
      checked: { live: 4, proposed: 3 },
      live: { ip_host: [a], port: [b] },
      proposed: { ip_host: [a], port: [c] },
    });

    const printed = formatAudit(audit).join("\n");
    for (const url of Object.values(URLS)) expect(printed).not.toContain(url);
    expect(printed).not.toMatch(/https?:|monobank|192\.0\.2|2001:db8|TestJar/);
    for (const id of [a, b, c]) expect(printed).toContain(id);

    // Read-only: every row is as it was.
    expect(await db.select().from(shelters)).toEqual(before);
  });

  it("reports zeros on a database with no such link", async () => {
    await insert(URLS.clean, URLS.clean);
    const audit = auditDonationHosts(await readStoredDonationLinks(db));
    expect(audit).toEqual({
      checked: { live: 1, proposed: 1 },
      live: { ip_host: [], port: [] },
      proposed: { ip_host: [], port: [] },
    });
    expect(formatAudit(audit)).toEqual([
      "checked   live 1, proposed 1",
      "live      IP host 0",
      "live      port    0",
      "proposed  IP host 0",
      "proposed  port    0",
      "Nothing was changed.",
    ]);
  });
});
