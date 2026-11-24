import { randomUUID } from "node:crypto";
import {
  type CityId,
  earlyListingOf,
  lifecycleOf,
  type ModeratorId,
  publishGateOf,
  type Shelter,
  type ShelterAdminId,
  transition,
} from "@opika/domain";
import { sql } from "drizzle-orm";
import type { Database } from "../src/client";
import { executeRows } from "../src/raw-rows";
import { applicationsRepo } from "../src/repos/applications-repo";
import { cityRepo } from "../src/repos/city-repo";
import { registrationFactsRepo } from "../src/repos/registration-facts-repo";
import { selfRegistrationRepo } from "../src/repos/self-registration-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { makeCity, makeShelter } from "../src/test-utils/index";
import { outcomeOf } from "./neon-smoke-verified-data";

type Outcome = { name: string; ok: boolean; detail: string };

const NOW = new Date();
const DAY_MS = 24 * 60 * 60 * 1000;
const MOD = "11111111-1111-4111-8111-111111111111" as ModeratorId;

/**
 * Migration 0030 on Neon's driver: `shelters.contact` nullable for a self-registered shelter only
 * (`shelters_contact_check`), a registration with no contact, and the publish gate's read path
 * (`shelterStageOf`'s two reads, then `publishGateOf`) before and after the queue's accept.
 * Fresh fixtures; rows stay on the child branch.
 */
export async function runContactsSmoke(db: Database): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });

  const [column] = await executeRows<{ nullable: string }>(
    db,
    sql`SELECT is_nullable AS nullable FROM information_schema.columns
        WHERE table_name = 'shelters' AND column_name = 'contact'`,
  );
  check("0030: shelters.contact is nullable", column?.nullable === "YES", `${column?.nullable}`);

  const [constraint] = await executeRows<{ definition: string }>(
    db,
    sql`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
        WHERE conname = 'shelters_contact_check'`,
  );
  check(
    "0030: shelters_contact_check allows no contact for self_registration only",
    constraint !== undefined &&
      /contact IS NOT NULL/.test(constraint.definition) &&
      /'self_registration'/.test(constraint.definition),
    constraint?.definition ?? "missing",
  );

  const city = makeCity({ id: randomUUID() as CityId, slug: `smoke-${randomUUID()}` as never });
  await cityRepo(db).insertMissing([city]);
  const located = { precision: "city" as const, cityId: city.id, district: null };
  const applicationOf = (): Shelter => ({
    ...makeShelter({
      displayName: `Смоук без контакту ${randomUUID().slice(0, 6)}`,
      publicLocation: located,
      contact: null,
      verification: {
        status: "application",
        appliedAt: NOW,
        evidence: { items: [], submittedAt: NOW },
      },
    }),
    premises: { kind: "not_recorded" },
    legalEntity: null,
  });

  const bare = applicationOf();
  const inserted = await outcomeOf(() => shelterRepo(db).insert(bare));
  const readBack = await shelterRepo(db).findById(bare.id);
  check(
    "0030: a self-registered shelter with no contact is accepted, and reads back with none",
    inserted === "accepted" && readBack !== null && readBack.contact === null,
    `${inserted}, contact ${readBack === null ? "row missing" : JSON.stringify(readBack.contact)}`,
  );

  const operatorBare = makeShelter({
    displayName: `Смоук оператор ${randomUUID().slice(0, 6)}`,
    publicLocation: located,
    contact: null,
  });
  const refused = await outcomeOf(() => shelterRepo(db).insert(operatorBare));
  check(
    "0030: an operator-created shelter with no contact is refused by shelters_contact_check",
    refused === "shelters_contact_check",
    refused,
  );

  // The registration write itself (one batch), with the contact field left empty.
  const userId = randomUUID();
  const seed = randomUUID();
  const registered = applicationOf();
  await selfRegistrationRepo(db).register({
    userId,
    email: `smoke-${seed}@example.org`,
    accountId: randomUUID(),
    passwordHash: "smoke-hash",
    organizationId: randomUUID(),
    memberId: randomUUID(),
    shelter: registered,
    history: {
      id: randomUUID(),
      entry: { kind: "shelter_registered", at: NOW, shelterAdminId: userId as ShelterAdminId },
    },
    tokens: [
      {
        tokenHash: `smoke-contacts-confirm-${seed}`,
        purpose: "confirm_email",
        expiresAt: new Date(NOW.getTime() + 14 * DAY_MS),
      },
      {
        tokenHash: `smoke-contacts-notme-${seed}`,
        purpose: "not_me",
        expiresAt: new Date(NOW.getTime() + 14 * DAY_MS),
      },
    ],
    now: NOW,
  });
  const stored = await shelterRepo(db).findById(registered.id);
  const summary = await selfRegistrationRepo(db).summaryOf(userId);
  check(
    "registration with no contact: stored as null, the operator's summary reads null",
    stored !== null && stored.contact === null && summary !== null && summary.contact === null,
    `shelter ${stored === null ? "missing" : JSON.stringify(stored.contact)}, summary ${
      summary === null ? "missing" : JSON.stringify(summary.contact)
    }`,
  );

  // The publish gate reads the shelter and its registration facts (`shelterStageOf`).
  const gateOf = async (id: Shelter["id"]): Promise<string> => {
    const shelter = await shelterRepo(db).findById(id);
    const facts = await registrationFactsRepo(db).of(id);
    if (shelter === null || facts === null) return "missing";
    const email = facts.source === "self_registration" ? facts.email : "confirmed";
    const lifecycle = lifecycleOf(
      shelter.verification,
      earlyListingOf(shelter.earlyListingSince),
      email,
      NOW,
    );
    const gate = publishGateOf(lifecycle, shelter.contact);
    return gate.kind === "open" ? "open" : gate.why;
  };
  const asApplication = await gateOf(bare.id);
  check(
    "publish gate read path: an application without a contact is held as an application",
    asApplication === "application",
    asApplication,
  );

  // Accepted the way the operator's queue does it: one `decide` statement, early listing on.
  const event = { type: "accept_application", at: NOW, moderatorId: MOD } as const;
  const moved = transition(bare.verification, event);
  const accepted =
    moved.kind === "ok"
      ? await applicationsRepo(db).decide({
          shelterId: bare.id,
          expectedVersion: bare.version,
          decision: { kind: "accept", verification: moved.next, earlyListingSince: NOW },
          entries: [
            {
              id: randomUUID(),
              entry: { kind: "verification", event, from: "application", to: moved.next.status },
            },
            {
              id: randomUUID(),
              entry: {
                kind: "early_listing_allowed",
                at: NOW,
                moderatorId: MOD,
                period: 1,
                note: null,
              },
            },
          ],
          now: NOW,
        })
      : moved.kind;
  const afterAccept = await gateOf(bare.id);
  check(
    "publish gate read path: once accepted, still blocked for want of a contact",
    accepted === "ok" && afterAccept === "no_contact",
    `${accepted}, ${afterAccept}`,
  );

  const withContact = makeShelter({
    displayName: `Смоук з контактом ${randomUUID().slice(0, 6)}`,
    publicLocation: located,
  });
  await shelterRepo(db).insert(withContact);
  const open = await gateOf(withContact.id);
  check(
    "publish gate read path: an operator shelter with a contact is open",
    open === "open",
    open,
  );

  return out;
}
