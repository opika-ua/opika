import type postgres from "postgres";

/**
 * A shelter row in the shape every migration from 0000 up to (not including)
 * 0007 accepts, written with raw SQL.
 *
 * The migration-backfill tests stop the schema *before* the migration they
 * test. `shelterRepo.insert` writes the *current* schema, so as soon as a later
 * migration adds a shelters column (0007's `pending_donation`), a repo insert
 * into an earlier schema fails with "column does not exist". That's not a
 * backfill failure, just the fixture being newer than the schema. Raw SQL with
 * the columns these earlier schemas share keeps each backfill test about its
 * own migration.
 *
 * Every JSON value is sent as `${JSON.stringify(x)}::text::jsonb`, never
 * `::jsonb` alone. postgres.js serializes a parameter it knows to be jsonb with
 * `JSON.stringify` a *second* time, storing a JSON string scalar instead of an
 * object, unless a Drizzle client happens to have been created on the same
 * connection, which quietly replaces that serializer. The backfill tests used
 * to pass only because of that coupling. Sending text and letting Postgres
 * parse it is correct whatever the client's serializers are.
 */
export async function insertLegacyShelter(
  client: postgres.Sql,
  shelter: {
    id: string;
    cityId: string;
    status?: string;
    verification?: unknown;
  },
): Promise<void> {
  const at = "2026-06-01T12:00:00.000Z";
  const status = shelter.status ?? "verified";
  const verification = shelter.verification ?? {
    status: "verified",
    verifiedAt: at,
    verifiedBy: "aaaaaaaa-0000-4000-8000-000000000001",
    evidence: { items: [], submittedAt: at },
  };
  const location = {
    precision: "fuzzed_address",
    cityId: shelter.cityId,
    district: null,
    approximate: { center: { lat: 50.45, lng: 30.52 }, precisionMetres: 1000 },
  };
  const address = {
    line1: "вул. Тестова 1",
    line2: null,
    postalCode: null,
    cityId: shelter.cityId,
    district: null,
    coordinates: { lat: 50.45, lng: 30.52 },
  };
  await client`
    INSERT INTO shelters (
      id, display_name, description_uk, legal_entity, public_location, exact_address,
      contact, donation, verification_status, verification, city_id, exact_lat, exact_lng,
      created_at, last_updated_at
    ) VALUES (
      ${shelter.id}, ${"Притулок"}, ${"Опис"},
      ${JSON.stringify({ kind: "unregistered_initiative", contactPersonName: "Олена" })}::text::jsonb,
      ${JSON.stringify(location)}::text::jsonb, ${JSON.stringify(address)}::text::jsonb,
      ${JSON.stringify({ primary: { kind: "phone", e164: "+380501234567" }, additional: [] })}::text::jsonb,
      ${null}::text::jsonb, ${status}, ${JSON.stringify(verification)}::text::jsonb, ${shelter.cityId},
      ${"50.45"}, ${"30.52"}, ${at}::timestamptz, ${at}::timestamptz
    )`;
}

/**
 * An animal row with only the columns every migration from 0004 on accepts,
 * written with raw SQL for the same reason as `insertLegacyShelter`. The
 * listing goes in exactly as given, so a test can hand it an old shape.
 */
export async function insertLegacyAnimal(
  client: postgres.Sql,
  animal: { id: string; shelterId: string; cityId: string; listing: unknown; listingKind: string },
): Promise<void> {
  const at = "2026-06-01T12:00:00.000Z";
  const declared = JSON.stringify({ source: "shelter_declared", state: "unknown", declaredAt: at });
  await client`
    INSERT INTO animals (
      id, shelter_id, name, species, sex, size, age, age_anchor_at, description_uk,
      photos, vaccination, spay_neuter, document_readiness, listing, listing_kind,
      city_id, created_at, last_updated_at
    ) VALUES (
      ${animal.id}, ${animal.shelterId}, ${"Тест"}, ${"dog"}, ${"unknown"}, ${"medium"},
      ${JSON.stringify({ kind: "birth_date", date: at, precision: "year" })}::text::jsonb,
      ${at}::timestamptz, ${"Опис"}, ${"[]"}::text::jsonb, ${declared}::text::jsonb,
      ${declared}::text::jsonb, ${JSON.stringify({ kind: "unknown" })}::text::jsonb,
      ${JSON.stringify(animal.listing)}::text::jsonb, ${animal.listingKind},
      ${animal.cityId}, ${at}::timestamptz, ${at}::timestamptz
    )`;
}

/**
 * A city row in the shape every migration before 0020 accepts. `cityRepo.insert` writes the
 * current schema (region, kind and search keys), which an earlier schema does not have.
 */
export async function insertLegacyCity(
  client: postgres.Sql,
  city: { id: string; slug: string; name: { uk: string; en: { text: string } } },
): Promise<void> {
  await client`
    INSERT INTO cities (id, slug, name_uk, name_en_text, name_en_provenance, centroid_lat, centroid_lng)
    VALUES (${city.id}, ${city.slug}, ${city.name.uk}, ${city.name.en.text}, 'human', ${50.45}, ${30.52})`;
}
