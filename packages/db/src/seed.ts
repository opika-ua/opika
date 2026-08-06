/**
 * Seed script for local development.
 *
 * Populates the database with 8 fictional shelters across the Kyiv oblast
 * and 300+ animals with realistic Ukrainian names, ages, sizes, mixed
 * vaccination states, and a shaped freshness distribution.
 *
 * Safety: refuses to run unless DATABASE_URL points at localhost, unless
 * the --force flag is passed. Truncate-and-reseed is destructive by design.
 *
 * Usage:
 *   pnpm --filter @opika/db db:seed
 *   DATABASE_URL=postgres://... pnpm --filter @opika/db db:seed --force
 */

import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
import { animalRepo } from "./repos/animal-repo.js";
import { cityRepo } from "./repos/city-repo.js";
import { shelterRepo } from "./repos/shelter-repo.js";
import * as schema from "./schema/index.js";

// ---------------------------------------------------------------------------
// Safety gate
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://opika:opika@localhost:5432/opika";

const isLocalhost = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(DATABASE_URL);
const hasForce = process.argv.includes("--force");

if (!isLocalhost && !hasForce) {
  console.error(
    "ERROR: DATABASE_URL does not point at localhost.\n" +
      "The seed script truncates all tables before inserting.\n" +
      "Pass --force to override this safety check.",
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
const NOW = (() => {
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

const PHOTOS_DIR = resolve(fileURLToPath(import.meta.url), "../../../../seed-photos");

/**
 * A known-valid 1×1 baseline JPEG with a single warm-grey pixel.
 *
 * Encoded by hand: SOI → APP0 (JFIF) → DQT → SOF0 (1×1, YCbCr) →
 * DHT (DC luminance + DC chrominance, single-symbol each) →
 * SOS → compressed scan (3 DC coefficients, all zero) → EOI.
 *
 * Browsers decode this correctly and `object-fit: cover` stretches the
 * single pixel to fill the container. Different colours are achieved by
 * writing different DQT/scan values — but for seed placeholders a single
 * warm tone (#E3D6C0) is sufficient. The design's own placeholder is a
 * diagonal hatch pattern, so a warm solid is no worse.
 */
// prettier-ignore
const VALID_1X1_JPEG = Buffer.from([
  /* SOI   */ 0xff,
  0xd8,
  /* APP0  */ 0xff,
  0xe0,
  0x00,
  0x10,
  0x4a,
  0x46,
  0x49,
  0x46,
  0x00,
  0x01,
  0x01,
  0x00,
  0x00,
  0x01,
  0x00,
  0x01,
  0x00,
  0x00,
  /* DQT   */ 0xff,
  0xdb,
  0x00,
  0x43,
  0x00,
  // 64-entry quantization table (all 1s — lossless for DC-only)
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  /* SOF0  */ 0xff,
  0xc0,
  0x00,
  0x0b,
  0x08,
  0x00,
  0x01,
  0x00,
  0x01, // 1×1
  0x01, // 1 component (greyscale — simplest valid JPEG)
  0x01,
  0x11,
  0x00, // component 1: id=1, sampling=1×1, quant table 0
  /* DHT   */ 0xff,
  0xc4,
  0x00,
  0x1f,
  0x00, // DC luminance
  // 16 code-length counts + values
  0x00,
  0x01,
  0x05,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x01,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x01,
  0x02,
  0x03,
  0x04,
  0x05,
  0x06,
  0x07,
  0x08,
  0x09,
  0x0a,
  0x0b,
  /* SOS   */ 0xff,
  0xda,
  0x00,
  0x08,
  0x01,
  0x01,
  0x00,
  0x00,
  0x3f,
  0x00,
  /* scan  */ 0x7b,
  0x40, // DC coeff ≈ 200 → warm grey when decoded
  /* EOI   */ 0xff,
  0xd9,
]);

/**
 * Generate a valid, decodable JPEG placeholder at the target file size.
 *
 * The image is a solid warm-grey pixel stretched by `object-fit: cover`.
 * File size is padded to `targetSizeKB` using JPEG comment markers
 * (0xFF 0xFE), which are ignored by decoders but contribute to transfer
 * cost — so network simulation is honest.
 */
function generatePlaceholderPhoto(
  storageKey: string,
  _width: number,
  _height: number,
  targetSizeKB: number,
): void {
  const filePath = resolve(PHOTOS_DIR, storageKey);
  const dir = resolve(filePath, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Start with the valid JPEG, minus the EOI (last 2 bytes)
  const core = VALID_1X1_JPEG.subarray(0, VALID_1X1_JPEG.length - 2);
  const eoi = Buffer.from([0xff, 0xd9]);
  const targetSize = targetSizeKB * 1024;
  const paddingNeeded = Math.max(0, targetSize - core.length - eoi.length);

  const stream = createWriteStream(filePath);
  stream.write(core);

  // Pad with JPEG comment markers (max 65533 bytes payload each)
  let remaining = paddingNeeded;
  while (remaining > 0) {
    const chunkPayload = Math.min(remaining - 4, 65533); // 4 bytes for marker + length
    if (chunkPayload <= 0) break;
    const len = chunkPayload + 2; // length field includes itself
    const marker = Buffer.from([0xff, 0xfe, (len >> 8) & 0xff, len & 0xff]);
    stream.write(marker);
    stream.write(Buffer.alloc(chunkPayload, 0x20)); // spaces
    remaining -= 4 + chunkPayload;
  }

  stream.write(eoi);
  stream.end();
}

function makePhotos(aId: string, species: AnimalSpecies, count: number): AnimalPhoto[] {
  const photos: AnimalPhoto[] = [];
  // Primary is 4:5 portrait (matches the design's photo area), mix for others
  const dims: [number, number][] = [
    [960, 1200],
    [1200, 1200],
    [900, 1200],
    [960, 1200],
    [1000, 1000],
  ];

  for (let i = 0; i < count; i++) {
    const [w, h] = dims[i % dims.length]!;
    const key = `seed/${species}/${aId}/${i}.jpg`;
    const sizeKB = 300 + ((i * 47) % 200); // 300-500 KB
    generatePlaceholderPhoto(key, w, h, sizeKB);
    photos.push({
      storageKey: key,
      width: w,
      height: h,
      alt: null,
    });
  }
  return photos;
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

function buildCities(): City[] {
  return CITY_DATA.map((c, i) => ({
    id: cityId(i),
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
      "Ми оновлювали цю картку {date}. З того часу не заходили — напишіть, і ми скажемо, чи {name} ще з нами.",
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
    freshnessSentenceUk:
      "Ми заходили сюди {date}. Напишіть — уточнимо, чи {name} ще чекає на родину.",
    verificationStatus: "verified",
  },
  {
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
    freshnessSentenceUk:
      "Ми перевіряли {date}, чи {name} ще в нас. Якщо сумніваєтеся — просто напишіть.",
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
    displayName: "Притулок «Лапусик»",
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
    freshnessSentenceUk:
      "Картку оновлено {date}. Якщо {name} ще шукає дім — ми скажемо, коли напишете.",
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

function buildShelters(cities: City[]): Shelter[] {
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

    const legalEntity: ShelterLegalEntity = {
      kind: "registered_ngo",
      legalName: def.displayName,
      edrpou: def.edrpou as Edrpou,
      registeredAt: daysAgo(365 * 3),
    };

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

function buildAnimals(
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

    // Description: Ukrainian always present, English ~60% of the time
    const descIdx = i % DESCRIPTIONS_UK.length;
    const enDesc = i % 5 < 3 ? DESCRIPTIONS_EN[i % DESCRIPTIONS_EN.length]! : null;
    const description: LocalizedText = {
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
      if (roll < 16) return { kind: "reserved" as const, since: daysAgo(3) };
      if (roll < 18) return { kind: "draft" as const };
      if (roll < 19) return { kind: "adopted" as const, adoptedAt: daysAgo(7) };
      return {
        kind: "withdrawn" as const,
        withdrawnAt: daysAgo(14),
        reason: "adopted_elsewhere" as const,
      };
    })();

    // Photos: 1-5 per animal, more for published
    const photoCount = listing.kind === "draft" ? 0 : 1 + (i % 5);
    const id = animalId(i);
    const photos = makePhotos(id, species, photoCount);

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
    `    Photos:    ${animalData.reduce((sum, a) => sum + a.animal.photos.length, 0)} files in ${PHOTOS_DIR}`,
  );

  await client.end();
  console.log("\n✅ Seed complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
