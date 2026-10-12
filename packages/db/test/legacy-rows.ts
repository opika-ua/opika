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
