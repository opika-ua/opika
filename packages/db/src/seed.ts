/**
 * Seed script for local development.
 *
 * Populates the database with 8 fictional shelters across the Kyiv oblast
 * and 300+ animals with realistic Ukrainian names, ages, sizes, mixed
 * vaccination states, and a shaped freshness distribution.
 *
 * Safety: refuses to run unless DATABASE_URL points at localhost. A
 * non-localhost target requires BOTH --force AND --db-name=<name> (matching
 * the target database's own name, read out of DATABASE_URL itself) —
 * --force alone is deliberately not enough. See assertSafeSeedTarget's own
 * comment for why (docs/build-plan.md, D-9, 2026-09-06).
 *
 * Usage:
 *   pnpm --filter @opika/db db:seed
 *   DATABASE_URL=postgres://... pnpm --filter @opika/db db:seed --force --db-name=opika
 */

import { pathToFileURL } from "node:url";
import {
  type AgeEstimate,
  type Animal,
  type AnimalId,
  type AnimalListingState,
  type AnimalPhoto,
  type AnimalSex,
  type AnimalSpecies,
  animalPublicLocationOf,
  type City,
  type CityId,
  citySlugOf,
  type DocumentReadiness,
  type Edrpou,
  type ExactAddress,
  type LocalizedText,
  type ModeratorId,
  type PublicLocation,
  publicLocationOf,
  type Shelter,
  type ShelterContact,
  type ShelterId,
  type ShelterLegalEntity,
  type ShelterVerification,
  type SizeBucket,
  type SpayNeuterStatus,
  testOnlyLocationPolicy,
  UNKNOWN_DOCUMENT_READINESS,
  type VaccinationStatus,
} from "@opika/domain";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { animalRepo } from "./repos/animal-repo";
import { cityRepo } from "./repos/city-repo";
import { shelterRepo } from "./repos/shelter-repo";
import * as schema from "./schema/index";

// ---------------------------------------------------------------------------
// Safety gate
// ---------------------------------------------------------------------------

// Port matches docker-compose.yml's own OPIKA_DB_PORT (default 5433, mapped to the
// container's internal 5432) — read from the same env var rather than a second hardcoded
// copy, so the two can't drift apart again. They already had: this fallback said 5432,
// which nothing in local dev actually listens on unless OPIKA_DB_PORT was overridden to
// match, and running db:seed without an explicit DATABASE_URL failed with what looked
// like a credentials error rather than the port mismatch it actually was (issue #22).
const DB_PORT = process.env.OPIKA_DB_PORT ?? "5433";
const DATABASE_URL =
  process.env.DATABASE_URL ?? `postgres://opika:opika@localhost:${DB_PORT}/opika`;

const DB_NAME_FLAG_PREFIX = "--db-name=";

/**
 * Refuses to let this script's truncate-and-reseed run against anything but
 * a local database, unless the caller proves — not just asserts with
 * --force — that they know exactly what they're pointing it at.
 *
 * Originally a demo-marker DB column (D-9's first design): every shelter
 * and animal row carries a marker, and the guard refuses to truncate if any
 * row lacks it. Reduced, 2026-09-06 (docs/build-plan.md, Phase D
 * reprioritisation): a real shelter existing in a non-local database is the
 * actual risk this guards against, and the connection string already says
 * where the script is about to point — no migration, no backfill, no
 * column needed to check that. --force alone stays deliberately
 * insufficient for a non-localhost target: it's typed from habit (every
 * `db:seed --force` invocation in this repo's own history is that), so it
 * proves nothing about whether the caller actually looked at the URL. A
 * second flag whose value must be copied from that same URL is: producing
 * it requires reading DATABASE_URL, not just remembering that --force
 * unblocks things.
 *
 * Exported and called only from the CLI-only guard at the bottom of this
 * file (never at module scope) — same reasoning as
 * `onboard-shelter.ts`'s `refuseIfInsideRepo`: importing this module for a
 * test must never have the side effect of running it, exiting the test
 * process included.
 */
export function assertSafeSeedTarget(databaseUrl: string, argv: readonly string[]): void {
  const parsed = new URL(databaseUrl);
  // Exact match on the parsed hostname, never a substring test against the
  // whole URL — a substring test is bypassable with zero flags by any
  // connection string that merely *contains* "localhost" somewhere (a
  // password, a database name, a query parameter), which is exactly the
  // "refuses any non-localhost target outright, full stop" guarantee this
  // row exists to provide. Caught by review, confirmed with a real (not
  // reasoned-about) URL before this fix landed.
  const isLocalhost =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "0.0.0.0";
  if (isLocalhost) return;

  const hasForce = argv.includes("--force");
  const providedDbName = argv
    .find((arg) => arg.startsWith(DB_NAME_FLAG_PREFIX))
    ?.slice(DB_NAME_FLAG_PREFIX.length);
  const actualDbName = parsed.pathname.replace(/^\//, "");
  // actualDbName.length > 0 (not just equality) matters on its own: a
  // pathless DATABASE_URL has an empty database name, and without this
  // clause an empty --db-name= would trivially equal it — the override
  // firing with no real name ever having been typed. Implies
  // providedDbName can't be empty either (an empty string only equals a
  // non-empty one if it isn't actually empty), so there's nothing left to
  // check on that side.
  const dbNameMatches =
    providedDbName !== undefined && actualDbName.length > 0 && providedDbName === actualDbName;

  if (hasForce && dbNameMatches) return;

  const reason =
    hasForce && providedDbName !== undefined
      ? "the --db-name you passed does not match the database name in DATABASE_URL"
      : "pass --force AND --db-name=<database name>";
  console.error(
    "ERROR: DATABASE_URL does not point at localhost.\n" +
      "This script truncates every table before inserting — that is unrecoverable against a\n" +
      "database that holds a real shelter.\n" +
      `To override, ${reason}, matching the target's own database name exactly\n` +
      "(read it out of DATABASE_URL yourself).",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Constants and helpers
// ---------------------------------------------------------------------------

/**
 * Anchor for all relative dates. Defaults to the real clock so the shaped
 * freshness distribution (50/30/20) stays correct whenever the seed runs.
 * Override with --now=2026-08-05T12:00:00Z for deterministic test snapshots.
 */
export const NOW = (() => {
  const flag = process.argv.find((a) => a.startsWith("--now="));
  return flag ? new Date(flag.slice("--now=".length)) : new Date();
})();
const DAY_MS = 86_400_000;
const policy = testOnlyLocationPolicy("seed");

/** Deterministic UUID v4 from a numeric index, for reproducible seeds. */
function seededUuid(prefix: string, index: number): string {
  const hex = index.toString(16).padStart(8, "0");
  const base = prefix.padEnd(8, "0").slice(0, 8);
  return `${base}-${hex.slice(0, 4)}-4${hex.slice(4, 7)}-8000-${hex.padStart(12, "0")}`;
}

function cityId(i: number): CityId {
  return seededUuid("c1000000", i) as CityId;
}
function shelterId(i: number): ShelterId {
  return seededUuid("51000000", i) as ShelterId;
}
function animalId(i: number): AnimalId {
  return seededUuid("a0000000", i) as AnimalId;
}
function moderatorId(): ModeratorId {
  return seededUuid("m0d00000", 1) as ModeratorId;
}

/** Pick a random element from an array using a simple seeded approach. */
function pick<T>(arr: readonly T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length]!;
}

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS);
}

// ---------------------------------------------------------------------------
// Photo generation
// ---------------------------------------------------------------------------

/**
 * Nine real, licence-clean placeholder photos (`apps/web/public/seed-photos/`,
 * `SOURCES.md` next to them records each one's source and licence) — every
 * seeded animal cycles through the ones matching its own species, resolved
 * to a URL by `apps/web/src/image-loader.ts` — the app's single `next/image`
 * loader, wired globally by `next.config.ts`'s `images.loaderFile` — which
 * H1's real R2/CDN pipeline replaces without touching any call site.
 *
 * Deliberately mixed aspect ratios (0.75 portrait to 2.09 wide landscape —
 * `SOURCES.md` has the full table), not nine copies of the design's own 4:5:
 * `AnimalCard`'s photo box is a fixed CSS shape, and a source photo that
 * already matches it exactly is the one case that would never exercise the
 * `object-cover` cropping path real shelter uploads will actually need.
 * `width`/`height` below are each photo's true dimensions, not a fabricated
 * uniform value — the whole point is that they disagree with the box.
 *
 * A prior version of this generated 880 individual synthetic JPEGs (a
 * warm-grey pixel, byte-padded to a realistic 300-500KB) into a
 * `seed-photos/` directory Next never served — every card 404'd. A second
 * prior version pointed every animal at one single real file — real, but
 * indistinguishable card to card. Per-animal file-size realism can come
 * back (see git history for `generatePlaceholderPhoto`) if a real
 * requirement calls for it.
 */
const DOG_PHOTOS: AnimalPhoto[] = [
  { storageKey: "seed-photos/dog-1.jpg", width: 1024, height: 768, alt: null },
  { storageKey: "seed-photos/dog-2.jpg", width: 766, height: 1024, alt: null },
  { storageKey: "seed-photos/dog-3.jpg", width: 1023, height: 782, alt: null },
  { storageKey: "seed-photos/dog-4.jpg", width: 1024, height: 768, alt: null },
  { storageKey: "seed-photos/dog-5.jpg", width: 768, height: 1024, alt: null },
];
const CAT_PHOTOS: AnimalPhoto[] = [
  { storageKey: "seed-photos/cat-1.jpg", width: 1024, height: 490, alt: null },
  { storageKey: "seed-photos/cat-2.jpg", width: 1024, height: 740, alt: null },
  { storageKey: "seed-photos/cat-3.jpg", width: 1024, height: 683, alt: null },
  { storageKey: "seed-photos/cat-4.jpg", width: 768, height: 1024, alt: null },
];

/**
 * `animalIndex`, not a random pick — the same animal gets the same photo
 * set on every seed run, so a harness screenshot or a manually-reviewed
 * page doesn't reshuffle out from under whoever's looking at it between
 * runs. Cycling starts at a different offset per animal (`animalIndex`
 * itself, not always 0) so two animals with the same `count` don't render
 * identical photo sequences card-to-card.
 */
function makePhotos(species: AnimalSpecies, animalIndex: number, count: number): AnimalPhoto[] {
  const pool = species === "dog" ? DOG_PHOTOS : CAT_PHOTOS;
  return Array.from({ length: count }, (_, i) => pool[(animalIndex + i) % pool.length]!);
}

// ---------------------------------------------------------------------------
// Cities — Kyiv oblast
// ---------------------------------------------------------------------------

const CITY_DATA: { name: LocalizedText; centroid: { lat: number; lng: number } }[] = [
  {
    name: { uk: "Київ", en: { text: "Kyiv", provenance: "human" } },
    centroid: { lat: 50.4501, lng: 30.5234 },
  },
  {
    name: { uk: "Бровари", en: { text: "Brovary", provenance: "human" } },
    centroid: { lat: 50.5114, lng: 30.79 },
  },
  {
    name: { uk: "Ірпінь", en: { text: "Irpin", provenance: "human" } },
    centroid: { lat: 50.5216, lng: 30.251 },
  },
  {
    name: { uk: "Буча", en: { text: "Bucha", provenance: "human" } },
    centroid: { lat: 50.5437, lng: 30.2114 },
  },
  {
    name: { uk: "Вишгород", en: { text: "Vyshhorod", provenance: "human" } },
    centroid: { lat: 50.586, lng: 30.487 },
  },
  {
    name: { uk: "Бориспіль", en: { text: "Boryspil", provenance: "human" } },
    centroid: { lat: 50.3498, lng: 30.9544 },
  },
  {
    name: { uk: "Фастів", en: { text: "Fastiv", provenance: "human" } },
    centroid: { lat: 50.0775, lng: 29.9186 },
  },
  {
    name: { uk: "Біла Церква", en: { text: "Bila Tserkva", provenance: "human" } },
    centroid: { lat: 49.7992, lng: 30.1157 },
  },
];

export function buildCities(): City[] {
  return CITY_DATA.map((c, i) => ({
    id: cityId(i),
    slug: citySlugOf(c.name.uk),
    name: c.name,
    centroid: c.centroid,
  }));
}

// ---------------------------------------------------------------------------
// Shelters — 8 fictional shelters
// ---------------------------------------------------------------------------

interface ShelterDef {
  displayName: string;
  descriptionUk: string;
  descriptionEn: string | null;
  descriptionEnProvenance: "human" | "machine" | null;
  cityIndex: number;
  address: string;
  lat: number;
  lng: number;
  edrpou: string;
  /**
   * Defaults to `"registered_ngo"` (the historical, only value here before
   * D-4, 2026-09-06). Every shelter in the corpus was one legal form —
   * `ShelterLegalEntitySchema`'s other two variants (`legal-entity.ts`)
   * existed at the type level with nothing in the seed data ever
   * constructing them. **Narrowed on review, 2026-09-06:** this did not
   * mean a registered-only assumption could pass untested anywhere —
   * `packages/domain/src/shelters/verification/policy.test.ts` and
   * `packages/db/test/onboard-shelter.test.ts` already exercise
   * `unregistered_initiative` directly, and nothing in `packages/contracts`
   * or `apps/web` reads `legalEntity` at all yet. What was missing is
   * narrower: this generated corpus itself had never constructed anything
   * but `registered_ngo`, which is what this row fixes.
   *
   * Typed against `ShelterLegalEntity["kind"]` itself, not a hand-written
   * copy of its three literals — `buildShelters`'s `switch` below is then
   * exhaustive against the real schema, so a variant added to
   * `ShelterLegalEntitySchema` fails this file's own build until handled,
   * rather than silently compiling because this local type never learned
   * about it (caught on a second review round: the first version *looked*
   * exhaustive but was only exhaustive over this hand-written union).
   */
  legalEntityKind?: ShelterLegalEntity["kind"];
  contactPersonName?: string;
  phone: string;
  telegram: string | null;
  donationUrl: string | null;
  donationProvider: "monobank_jar" | "liqpay" | null;
  freshnessSentenceUk: string | null;
  verificationStatus: "verified" | "pending" | "suspended";
}

const SHELTER_DEFS: ShelterDef[] = [
  {
    displayName: "Притулок «Добрі лапи»",
    descriptionUk:
      "Один з найбільших притулків Києва, працює з 2015 року. Спеціалізуємося на реабілітації травмованих тварин.",
    descriptionEn:
      "One of Kyiv's largest shelters, operating since 2015. We specialize in rehabilitating injured animals.",
    descriptionEnProvenance: "human",
    cityIndex: 0, // Київ
    address: "вул. Богатирська, 18",
    lat: 50.5102,
    lng: 30.487,
    edrpou: "40123456",
    phone: "+380501234567",
    telegram: "dobri_lapy",
    donationUrl: "https://send.monobank.ua/jar/dobrilapy",
    donationProvider: "monobank_jar",
    freshnessSentenceUk:
      "Ми оновлювали цю картку 12 серпня. Напишіть — скажемо, чи тварина ще з нами.",
    verificationStatus: "verified",
  },
  {
    displayName: "Притулок «Хвостатий дім»",
    descriptionUk:
      "Домашній притулок для кішок та собак середнього розміру. Утримуємо до 80 тварин одночасно.",
    descriptionEn:
      "A home shelter for cats and medium-sized dogs. We house up to 80 animals at a time.",
    descriptionEnProvenance: "machine",
    cityIndex: 0, // Київ
    address: "вул. Академіка Заболотного, 52",
    lat: 50.3735,
    lng: 30.4668,
    edrpou: "40234567",
    phone: "+380672345678",
    telegram: "khvostatyi_dim",
    donationUrl: "https://send.monobank.ua/jar/khvostatyidim",
    donationProvider: "monobank_jar",
    freshnessSentenceUk: "Ми заходили сюди 3 вересня. Напишіть — уточнимо, чи тварина ще чекає.",
    verificationStatus: "verified",
  },
  {
    /**
     * D-4, 2026-09-06 — the corpus's one `unregistered_initiative` shelter
     * (`ShelterLegalEntitySchema`'s third variant, `legal-entity.ts`):
     * "a large share of shelter activity in the target oblast is
     * unincorporated volunteer groups" per that schema's own comment, and
     * CLAUDE.md decision #6 explicitly says such a group can reach
     * `verified` — a claim nothing in this corpus ever exercised before
     * this row, since every prior shelter here was `registered_ngo`.
     * `edrpou` stays on the def below for shape-consistency across
     * `ShelterDef`, but `buildShelters` doesn't read it for this shelter —
     * the domain type has no `edrpou` field on this variant at all.
     */
    displayName: "Притулок «Вірний друг»",
    descriptionUk:
      "Ми рятуємо тварин після обстрілів та допомагаємо їм знайти нові родини. Працюємо з волонтерами з усієї області.",
    descriptionEn: null,
    descriptionEnProvenance: null,
    cityIndex: 2, // Ірпінь
    address: "вул. Героїв Ірпеня, 7",
    lat: 50.518,
    lng: 30.243,
    edrpou: "40345678",
    legalEntityKind: "unregistered_initiative",
    contactPersonName: "Олена Ковальчук",
    phone: "+380633456789",
    telegram: null,
    donationUrl: null,
    donationProvider: null,
    freshnessSentenceUk: null,
    verificationStatus: "verified",
  },
  {
    displayName: "Притулок «Мурчик»",
    descriptionUk:
      "Притулок для кішок в Бучі. Всі наші вихованці стерилізовані та вакциновані. Шукаємо люблячі родини.",
    descriptionEn:
      "Cat shelter in Bucha. All our residents are spayed/neutered and vaccinated. Looking for loving families.",
    descriptionEnProvenance: "human",
    cityIndex: 3, // Буча
    address: "вул. Шевченка, 24",
    lat: 50.54,
    lng: 30.208,
    edrpou: "40456789",
    phone: "+380504567890",
    telegram: "murchyk_bucha",
    donationUrl: "https://www.liqpay.ua/uk/checkout/murchyk",
    donationProvider: "liqpay",
    freshnessSentenceUk: "Ми перевіряли 20 липня, чи тварина ще в нас. Просто напишіть.",
    verificationStatus: "verified",
  },
  {
    displayName: "Притулок «Надія»",
    descriptionUk:
      "Притулок для великих порід собак. Маємо власну територію з вигулом та тренувальним майданчиком.",
    descriptionEn:
      "Shelter for large dog breeds. We have our own territory with a walking area and training ground.",
    descriptionEnProvenance: "machine",
    cityIndex: 1, // Бровари
    address: "вул. Київська, 116",
    lat: 50.506,
    lng: 30.785,
    edrpou: "40567890",
    phone: "+380505678901",
    telegram: "nadiya_brovary",
    donationUrl: null,
    donationProvider: null,
    freshnessSentenceUk: null,
    verificationStatus: "verified",
  },
  {
    /**
     * Deliberately the longest shelter name in the corpus — critique finding
     * C1, the shelter half. Every other name here is a short «Притулок «X»»
     * of roughly 18-24 characters, so the card's shelter line and the detail
     * page's shelter block had never been rendered against a name a
     * registered organisation would plausibly actually have. 44 characters,
     * and the legal-entity prefix is the realistic part: a registered NGO's
     * own name is rarely short.
     *
     * Verified, and in a city with animals, on purpose — a long name on the
     * suspended or pending shelter would never reach the gallery at all and
     * would test nothing.
     */
    displayName: "Благодійна організація «Прихисток на Лісовій»",
    descriptionUk:
      "Маленький сімейний притулок. Утримуємо до 30 кішок і 15 собак. Кожна тварина отримує індивідуальну увагу.",
    descriptionEn: null,
    descriptionEnProvenance: null,
    cityIndex: 5, // Бориспіль
    address: "вул. Головатого, 3",
    lat: 50.351,
    lng: 30.95,
    edrpou: "40678901",
    phone: "+380676789012",
    telegram: null,
    donationUrl: "https://send.monobank.ua/jar/lapusyk",
    donationProvider: "monobank_jar",
    freshnessSentenceUk: "Картку оновлено 5 червня. Напишіть — скажемо, чи тварина ще шукає дім.",
    verificationStatus: "verified",
  },
  {
    // PENDING shelter — exercises the verified-shelter invariant
    displayName: "Притулок «Новий початок»",
    descriptionUk: "Новий притулок у Фастові. Подали документи на верифікацію, очікуємо перевірку.",
    descriptionEn:
      "New shelter in Fastiv. We have submitted documents for verification, awaiting review.",
    descriptionEnProvenance: "machine",
    cityIndex: 6, // Фастів
    address: "вул. Соборна, 45",
    lat: 50.078,
    lng: 29.92,
    edrpou: "40789012",
    phone: "+380507890123",
    telegram: null,
    donationUrl: null,
    donationProvider: null,
    freshnessSentenceUk: null,
    verificationStatus: "pending",
  },
  {
    // SUSPENDED shelter — exercises the verified-shelter invariant
    displayName: "Притулок «Зоряний»",
    descriptionUk: "Призупинено через скарги на умови утримання тварин. Проводиться перевірка.",
    descriptionEn: null,
    descriptionEnProvenance: null,
    cityIndex: 7, // Біла Церква
    address: "вул. Ярослава Мудрого, 12",
    lat: 49.8,
    lng: 30.117,
    edrpou: "40890123",
    phone: "+380508901234",
    telegram: null,
    donationUrl: null,
    donationProvider: null,
    freshnessSentenceUk: null,
    verificationStatus: "suspended",
  },
];

function buildVerification(def: ShelterDef): ShelterVerification {
  const evidence = { items: [], submittedAt: daysAgo(120) };
  const mod = moderatorId();

  switch (def.verificationStatus) {
    case "verified":
      return {
        status: "verified",
        verifiedAt: daysAgo(90),
        verifiedBy: mod,
        evidence,
      };
    case "pending":
      return {
        status: "pending",
        submittedAt: daysAgo(5),
        evidence,
      };
    case "suspended":
      return {
        status: "suspended",
        suspendedAt: daysAgo(10),
        suspendedBy: mod,
        reason: { code: "complaint_upheld", note: "Перевірка умов утримання" },
        priorState: {
          status: "verified",
          verifiedAt: daysAgo(90),
          verifiedBy: mod,
        },
        evidence,
      };
  }
}

export function buildShelters(cities: City[]): Shelter[] {
  return SHELTER_DEFS.map((def, i) => {
    const id = shelterId(i);
    const city = cities[def.cityIndex]!;

    const exactAddress: ExactAddress = {
      line1: def.address,
      line2: null,
      postalCode: null,
      cityId: city.id,
      district: null,
      coordinates: { lat: def.lat, lng: def.lng },
    };

    const contact: ShelterContact = {
      primary: { kind: "phone", e164: def.phone },
      additional: def.telegram ? [{ kind: "telegram", handle: def.telegram }] : [],
    };

    const description: LocalizedText = {
      uk: def.descriptionUk,
      en:
        def.descriptionEn && def.descriptionEnProvenance
          ? { text: def.descriptionEn, provenance: def.descriptionEnProvenance }
          : null,
    };

    // Exhaustive switch, not a ternary chain — same reasoning as
    // buildVerification's own switch below: a fourth variant added to
    // ShelterLegalEntitySchema should fail to compile here, not silently
    // seed as registered_ngo with nothing red (caught on review).
    const legalEntityKind = def.legalEntityKind ?? "registered_ngo";
    let legalEntity: ShelterLegalEntity;
    switch (legalEntityKind) {
      case "unregistered_initiative":
        legalEntity = {
          kind: "unregistered_initiative",
          contactPersonName: def.contactPersonName ?? def.displayName,
        };
        break;
      case "sole_proprietor":
        legalEntity = {
          kind: "sole_proprietor",
          legalName: def.displayName,
          edrpou: def.edrpou as Edrpou,
        };
        break;
      case "registered_ngo":
        legalEntity = {
          kind: "registered_ngo",
          legalName: def.displayName,
          edrpou: def.edrpou as Edrpou,
          registeredAt: daysAgo(365 * 3),
        };
        break;
      default: {
        const unreachable: never = legalEntityKind;
        throw new Error(`Unhandled legal entity kind: ${unreachable}`);
      }
    }

    return {
      id,
      displayName: def.displayName,
      description,
      legalEntity,
      publicLocation: publicLocationOf(id, exactAddress, policy),
      exactAddress,
      contact,
      donation:
        def.donationUrl && def.donationProvider
          ? { url: def.donationUrl, provider: def.donationProvider }
          : null,
      freshnessSentence: def.freshnessSentenceUk ? { uk: def.freshnessSentenceUk, en: null } : null,
      verification: buildVerification(def),
      createdAt: daysAgo(120),
      lastUpdatedAt: daysAgo(1),
    };
  });
}

// ---------------------------------------------------------------------------
// Animals — 300+ with realistic distributions
// ---------------------------------------------------------------------------

const DOG_NAMES = [
  "Сірко",
  "Рекс",
  "Бровко",
  "Мухтар",
  "Барсик",
  "Дружок",
  "Лорд",
  "Граф",
  "Тузик",
  "Бім",
  "Джек",
  "Рей",
  "Чарлі",
  "Макс",
  "Оскар",
  "Буч",
  "Каштан",
  "Вовчик",
  "Цезар",
  "Амур",
  "Байкал",
  "Грізлі",
  "Тайсон",
  "Лакі",
  "Боня",
  "Стіч",
  "Арчі",
  "Зевс",
  "Альф",
  "Гром",
  /**
   * Deliberately the longest name in the corpus, and the only reason it is
   * here — critique finding C1. Every other name in these pools is six
   * characters or fewer, so `AnimalCard`'s `truncate` (the design's own
   * "animal names truncate to one line with ellipsis") had never once been
   * exercised anywhere near its limit: the safety net existed and was
   * untested at any realistic width.
   *
   * A real shelter's names are not drawn from a curated six-character pool.
   * 30 characters is not absurd for a rescue's own naming, and it overflows
   * the card's name line at every breakpoint, which is exactly the point:
   * the harness now carries this permanently instead of a one-off manual
   * check nobody repeats.
   */
  "Бартоломеус-Максиміліан Третій",
];

const DOG_NAMES_F = [
  "Ласка",
  "Жулька",
  "Альма",
  "Найда",
  "Белка",
  "Стрілка",
  "Мілка",
  "Герда",
  "Дайна",
  "Луна",
  "Ніка",
  "Айза",
  "Несі",
  "Рада",
  "Зірка",
  "Веста",
  "Джесі",
  "Ліра",
  "Кнопка",
  "Тіна",
];

const CAT_NAMES = [
  "Мурчик",
  "Барсик",
  "Рижик",
  "Пушок",
  "Кузя",
  "Васька",
  "Тигр",
  "Маркіз",
  "Лео",
  "Фелікс",
  "Сніжок",
  "Димко",
  "Персик",
  "Том",
  "Сема",
  "Котя",
  "Бенджі",
  "Мишко",
  "Мурзик",
  "Прохор",
];

const CAT_NAMES_F = [
  "Мурка",
  "Масяня",
  "Мася",
  "Сніжинка",
  "Ласунка",
  "Кіцька",
  "Мілка",
  "Зоря",
  "Нюша",
  "Багіра",
  "Соня",
  "Пуся",
  "Клео",
  "Мілашка",
  "Муся",
];

const DESCRIPTIONS_UK = [
  "Дуже дружелюбна тварина, любить дітей та інших тварин. Привчена до вигулу.",
  "Спокійний та ласкавий характер. Ідеально підходить для квартирного утримання.",
  "Активна і грайлива, потребує простору для руху. Чудовий компаньйон для прогулянок.",
  "Врятована з вулиці, пройшла повну реабілітацію. Шукає люблячу родину.",
  "Привчена до лотка. Не потребує особливого догляду. Дуже чистоплотна.",
  "Молода та енергійна тварина. Добре ладнає з іншими тваринами в будинку.",
  "Тиха і спокійна натура. Не любить гучних звуків. Ідеальна для людей похилого віку.",
  "Грайлива та допитлива. Любить досліджувати нові місця. Потребує уваги та ігор.",
  "Була знайдена після обстрілу. Повністю відновилася. Дуже вдячна за увагу.",
  "Чудовий охоронець. Насторожено ставиться до незнайомців, але відданий своїй родині.",
  "Контактна тварина, швидко звикає до нових людей. Любить ласку та обійми.",
  "Знайдена в передмісті без ошийника. Пройшла ветеринарний огляд, здорова.",
  "Має досвід життя в родині. Привчена до режиму прогулянок двічі на день.",
  "Врятована волонтерами. Тепер шукає постійний дім, де її будуть любити.",
  "Веселої натури, обожнює грати з м'ячиком. Добре ладнає з дітьми старше 7 років.",
];

const DESCRIPTIONS_EN: { text: string; provenance: "human" | "machine" }[] = [
  {
    text: "Very friendly animal, loves children and other pets. Trained for outdoor walks.",
    provenance: "human",
  },
  {
    text: "Calm and affectionate temperament. Perfectly suited for apartment living.",
    provenance: "machine",
  },
  {
    text: "Active and playful, needs space to move. A wonderful companion for walks.",
    provenance: "machine",
  },
  {
    text: "Rescued from the street, fully rehabilitated. Looking for a loving family.",
    provenance: "human",
  },
  { text: "Litter trained. Does not require special care. Very clean.", provenance: "machine" },
  {
    text: "Young and energetic animal. Gets along well with other pets in the house.",
    provenance: "machine",
  },
  {
    text: "Quiet and calm nature. Does not like loud noises. Ideal for elderly people.",
    provenance: "human",
  },
];

/**
 * D-4 hostile-corpus indices, 2026-09-06 (docs/build-plan.md, Phase D) —
 * deliberate single instances, not statistical presence, so each is
 * findable by a query rather than by luck. Same idiom as the long
 * shelter/animal names above (Phase T's C1): a hostile shape gets exactly
 * one guaranteed occurrence, not a hope that the bulk RNG produces one.
 *
 * Both fall in `roll < 14` (`i % 20 < 14`, see `listing` below) — published,
 * not draft, because a draft's own 0-photo case was already covered before
 * this row; the point here is that *published* animals need to survive
 * having 0 or 6 photos too, which nothing in the corpus had ever produced.
 *
 * `SIX_PHOTO_INDEX`'s animal is a dog (`i % 3 !== 0`) and `DOG_PHOTOS` has
 * only 5 entries, so `makePhotos` cycles and one photo repeats — this card
 * is a duplicate-photo case as well as a six-photo one, not by separate
 * design. Real shelters upload duplicates too, so left as-is rather than
 * padding the pool to manufacture six genuinely distinct images.
 */
const ZERO_PHOTO_PUBLISHED_INDEX = 40;
const SIX_PHOTO_INDEX = 41;
const MINIMAL_DESCRIPTION_INDEX = 42;

/**
 * Shaped freshness distribution:
 *   50% fresh  (0-7 days ago)
 *   30% aging  (8-30 days ago)
 *   20% stale  (31-90 days ago)
 */
function lastUpdatedDaysAgo(index: number, total: number): number {
  const position = index / total;
  if (position < 0.5) {
    // Fresh: 0-7 days, linear spread
    return Math.round((index / (total * 0.5)) * 7);
  }
  if (position < 0.8) {
    // Aging: 8-30 days
    const agingIndex = (index - total * 0.5) / (total * 0.3);
    return 8 + Math.round(agingIndex * 22);
  }
  // Stale: 31-90 days
  const staleIndex = (index - total * 0.8) / (total * 0.2);
  return 31 + Math.round(staleIndex * 59);
}

export function buildAnimals(
  shelters: Shelter[],
  cities: City[],
  count: number,
): { animal: Animal; cityId: CityId }[] {
  const verifiedShelters = shelters.filter((s) => s.verification.status === "verified");
  const nonVerifiedShelters = shelters.filter((s) => s.verification.status !== "verified");

  const results: { animal: Animal; cityId: CityId }[] = [];

  // 85% of animals for verified shelters, 15% for non-verified
  // (non-verified animals exist but won't appear in the feed)
  const verifiedCount = Math.floor(count * 0.85);

  for (let i = 0; i < count; i++) {
    const isForNonVerified = i >= verifiedCount;
    const shelterPool = isForNonVerified ? nonVerifiedShelters : verifiedShelters;
    const shelter = shelterPool[i % shelterPool.length]!;
    const shelterCityIdx = SHELTER_DEFS.findIndex(
      (d) => shelterId(SHELTER_DEFS.indexOf(d)) === shelter.id,
    );
    const shelterDef = SHELTER_DEFS[shelterCityIdx]!;
    const shelterCity = cities[shelterDef.cityIndex]!;

    const species: AnimalSpecies = i % 3 === 0 ? "cat" : "dog";
    const sex: AnimalSex = i % 5 === 0 ? "unknown" : i % 2 === 0 ? "male" : "female";

    // Pick name based on species and sex
    let name: string;
    if (species === "dog") {
      name = sex === "female" ? pick(DOG_NAMES_F, i * 7 + 3) : pick(DOG_NAMES, i * 13 + 1);
    } else {
      name = sex === "female" ? pick(CAT_NAMES_F, i * 11 + 5) : pick(CAT_NAMES, i * 17 + 2);
    }

    // Size distribution: cats mostly small, dogs mixed
    let size: SizeBucket;
    if (species === "cat") {
      size = i % 10 === 0 ? "medium" : "small";
    } else {
      const sizeRoll = i % 6;
      size = sizeRoll < 2 ? "small" : sizeRoll < 4 ? "medium" : "large";
    }

    // Age: mix of birth_date and declared_bucket
    const age: AgeEstimate =
      i % 3 === 0
        ? {
            kind: "declared_bucket",
            bucket: pick(["baby", "young", "adult", "senior"] as const, i * 23),
            declaredAt: daysAgo(Math.floor((i * 37) % 60)),
          }
        : {
            kind: "birth_date",
            date: new Date(NOW.getTime() - (0.3 + ((i * 41) % 100) / 10) * 365.25 * DAY_MS),
            precision: pick(["day", "month", "year"] as const, i * 31),
          };

    // Description: Ukrainian always present (LocalizedTextSchema requires a
    // non-empty string — an actually-empty description is not a
    // constructable Animal, so D-4's "no description" hostile case is this:
    // one animal (i === MINIMAL_DESCRIPTION_INDEX) with the shortest honest
    // non-answer a shelter volunteer might actually type, rather than one
    // of the real prose descriptions everything else in the corpus uses.
    // English present ~60% of the time otherwise.
    const descIdx = i % DESCRIPTIONS_UK.length;
    const enDesc = i % 5 < 3 ? DESCRIPTIONS_EN[i % DESCRIPTIONS_EN.length]! : null;
    const description: LocalizedText =
      i === MINIMAL_DESCRIPTION_INDEX
        ? { uk: "Опис відсутній.", en: null }
        : {
            uk: DESCRIPTIONS_UK[descIdx]!,
            en: enDesc,
          };

    // Vaccination: mixed states
    const vaccination: VaccinationStatus = (() => {
      const roll = i % 10;
      if (roll < 5)
        return {
          source: "shelter_declared" as const,
          state: "confirmed" as const,
          declaredAt: daysAgo(30),
        };
      if (roll < 7)
        return {
          source: "shelter_declared" as const,
          state: "in_progress" as const,
          declaredAt: daysAgo(14),
        };
      return {
        source: "shelter_declared" as const,
        state: "unknown" as const,
        declaredAt: daysAgo(60),
      };
    })();

    // Spay/neuter: mixed states
    const spayNeuter: SpayNeuterStatus = (() => {
      const roll = i % 10;
      if (roll < 4)
        return {
          source: "shelter_declared" as const,
          state: "confirmed" as const,
          declaredAt: daysAgo(30),
        };
      if (roll < 6)
        return {
          source: "shelter_declared" as const,
          state: "in_progress" as const,
          declaredAt: daysAgo(14),
        };
      return {
        source: "shelter_declared" as const,
        state: "unknown" as const,
        declaredAt: daysAgo(60),
      };
    })();

    // Document readiness: mostly unknown, some tracked
    const documentReadiness: DocumentReadiness =
      i % 8 === 0
        ? {
            kind: "tracked",
            microchip: {
              kind: "present",
              issuedAt: daysAgo(90),
              expiresAt: null,
              reference: `UA${100000 + i}`,
            },
            rabiesVaccination: {
              kind: "present",
              issuedAt: daysAgo(60),
              expiresAt: daysAgo(-305),
              reference: null,
            },
            rabiesTitration: { kind: "unknown" },
            vetCertificate: { kind: "unknown" },
          }
        : UNKNOWN_DOCUMENT_READINESS;

    // Listing state distribution:
    //   ~70% published, ~10% reserved, ~10% draft, ~5% adopted, ~5% withdrawn
    const listing: AnimalListingState = (() => {
      const roll = i % 20;
      if (roll < 14)
        return { kind: "published" as const, publishedAt: daysAgo(lastUpdatedDaysAgo(i, count)) };
      if (roll < 16)
        return {
          kind: "reserved" as const,
          since: daysAgo(3),
          // Staggered by the same distribution as `createdAt` below, not a
          // constant. A constant would give every reserved animal an identical
          // wait anchor, recreating in fresh seed data exactly the flat
          // "longest waiting" ordering the wait_anchor_at backfill exists to
          // remove from the old data — and it would look plausible, because
          // the rows would still sort.
          publishedAt: daysAgo(lastUpdatedDaysAgo(i, count) + 7),
        };
      if (roll < 18) return { kind: "draft" as const };
      if (roll < 19) return { kind: "adopted" as const, adoptedAt: daysAgo(7) };
      return {
        kind: "withdrawn" as const,
        withdrawnAt: daysAgo(14),
        reason: "adopted_elsewhere" as const,
      };
    })();

    // Photos: 1-5 per animal, more for published
    const photoCount =
      listing.kind === "draft"
        ? 0
        : i === ZERO_PHOTO_PUBLISHED_INDEX
          ? 0
          : i === SIX_PHOTO_INDEX
            ? 6
            : 1 + (i % 5);
    const id = animalId(i);
    const photos = makePhotos(species, i, photoCount);

    // Foster: ~10% of animals are fostered in a different city
    const isFostered = i % 10 === 3;
    let publicLocation: PublicLocation | null = null;
    let effectiveCityId = shelterCity.id;

    if (isFostered) {
      // Pick a different city from the shelter's city
      const otherCities = cities.filter((c) => c.id !== shelterCity.id);
      const fosterCity = otherCities[i % otherCities.length]!;
      publicLocation = animalPublicLocationOf(
        fosterCity.id,
        null, // district unknown for foster
      );
      effectiveCityId = fosterCity.id;
    }

    // Freshness: shaped distribution
    const updatedDaysAgo = lastUpdatedDaysAgo(i, count);
    const lastUpdatedAt = daysAgo(updatedDaysAgo);

    const animal: Animal = {
      id,
      shelterId: shelter.id,
      name,
      species,
      sex,
      size,
      age,
      description,
      photos,
      vaccination,
      spayNeuter,
      documentReadiness,
      listing,
      publicLocation,
      createdAt: daysAgo(updatedDaysAgo + 7), // created a week before last update
      lastUpdatedAt,
    };

    results.push({ animal, cityId: effectiveCityId });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("🐾 Seeding database...");
  console.log(`  DATABASE_URL: ${DATABASE_URL.replace(/:[^:@]+@/, ":***@")}`);

  const client = postgres(DATABASE_URL, { max: 1 });
  const db = drizzle(client, { schema });

  // Truncate all tables
  console.log("  Truncating existing data...");
  await db.execute(sql`TRUNCATE reveals, swipes, animals, adopters, shelters, cities CASCADE`);

  // Build data
  const citiesList = buildCities();
  const sheltersList = buildShelters(citiesList);
  const animalData = buildAnimals(sheltersList, citiesList, 320);

  // Insert cities
  console.log(`  Inserting ${citiesList.length} cities...`);
  const citiesR = cityRepo(db);
  await citiesR.insertMany(citiesList);

  // Insert shelters
  console.log(`  Inserting ${sheltersList.length} shelters...`);
  const sheltersR = shelterRepo(db);
  for (const shelter of sheltersList) {
    await sheltersR.insert(shelter);
  }

  // Insert animals
  console.log(`  Inserting ${animalData.length} animals...`);
  const animalsR = animalRepo(db);
  // Insert in batches of 50 to avoid hitting parameter limits
  const batchSize = 50;
  for (let i = 0; i < animalData.length; i += batchSize) {
    const batch = animalData.slice(i, i + batchSize);
    await animalsR.insertMany(batch);
  }

  // Summary stats
  const verifiedShelterCount = sheltersList.filter(
    (s) => s.verification.status === "verified",
  ).length;
  const pendingShelterCount = sheltersList.filter(
    (s) => s.verification.status === "pending",
  ).length;
  const suspendedShelterCount = sheltersList.filter(
    (s) => s.verification.status === "suspended",
  ).length;

  const publishedCount = animalData.filter((a) => a.animal.listing.kind === "published").length;
  const reservedCount = animalData.filter((a) => a.animal.listing.kind === "reserved").length;
  const draftCount = animalData.filter((a) => a.animal.listing.kind === "draft").length;
  const adoptedCount = animalData.filter((a) => a.animal.listing.kind === "adopted").length;
  const withdrawnCount = animalData.filter((a) => a.animal.listing.kind === "withdrawn").length;
  const fosteredCount = animalData.filter((a) => a.animal.publicLocation !== null).length;

  const dogCount = animalData.filter((a) => a.animal.species === "dog").length;
  const catCount = animalData.filter((a) => a.animal.species === "cat").length;

  console.log("\n  Summary:");
  console.log(`    Cities:    ${citiesList.length}`);
  console.log(
    `    Shelters:  ${sheltersList.length} (${verifiedShelterCount} verified, ${pendingShelterCount} pending, ${suspendedShelterCount} suspended)`,
  );
  console.log(`    Animals:   ${animalData.length} (${dogCount} dogs, ${catCount} cats)`);
  console.log(
    `    Listings:  ${publishedCount} published, ${reservedCount} reserved, ${draftCount} draft, ${adoptedCount} adopted, ${withdrawnCount} withdrawn`,
  );
  console.log(`    Fostered:  ${fosteredCount} (in a different city from their shelter)`);
  console.log(
    `    Photos:    ${animalData.reduce((sum, a) => sum + a.animal.photos.length, 0)} photo ` +
      `references, cycling ${DOG_PHOTOS.length} dog + ${CAT_PHOTOS.length} cat photos from ` +
      `apps/web/public/seed-photos/ (SOURCES.md has each one's licence)`,
  );

  await client.end();
  console.log("\n✅ Seed complete.");
}

// Only run the CLI when this file is executed directly (`tsx src/seed.ts`),
// not when its exports are imported for testing — importing a module must
// never have the side effect of running its whole script (same convention
// as onboard-shelter.ts's own CLI guard, see that file's comment for the
// Windows argv[1]/pathToFileURL reasoning).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertSafeSeedTarget(DATABASE_URL, process.argv);
  main().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
