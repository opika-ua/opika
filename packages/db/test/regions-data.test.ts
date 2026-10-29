import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REGION_BY_SLUG, REGIONS } from "../src/geography/regions-data";
import { uuidV5 } from "../src/geography/uuid-v5";
import { executeRows } from "../src/raw-rows";
import { setupTestDatabase } from "../src/test-utils/index";

describe("regions constant", () => {
  it("holds the 27 first-level units: 24 oblasts, Crimea, Kyiv and Sevastopol", () => {
    expect(REGIONS).toHaveLength(27);
    expect(REGIONS.filter((r) => r.kind === "oblast")).toHaveLength(24);
    expect(REGIONS.filter((r) => r.kind === "autonomous_republic").map((r) => r.slug)).toEqual([
      "krym",
    ]);
    expect(REGIONS.filter((r) => r.kind === "special_status_city").map((r) => r.slug)).toEqual([
      "kyiv",
      "sevastopol",
    ]);
  });

  it("has unique ids, codes and slugs, and every id is the UUIDv5 of its code", () => {
    for (const key of ["id", "code", "slug"] as const) {
      expect(new Set(REGIONS.map((r) => r[key])).size).toBe(27);
    }
    for (const region of REGIONS) {
      expect(region.id, region.slug).toBe(uuidV5(region.code));
    }
  });

  it("has symmetric neighbours that exist and never include the region itself", () => {
    for (const region of REGIONS) {
      expect(region.neighbours.length, region.slug).toBeGreaterThan(0);
      for (const neighbour of region.neighbours) {
        expect(neighbour, region.slug).not.toBe(region.slug);
        const other = REGION_BY_SLUG.get(neighbour);
        expect(other, `${region.slug} lists unknown ${neighbour}`).toBeDefined();
        expect(other?.neighbours, `${neighbour} must list ${region.slug}`).toContain(region.slug);
      }
      expect(new Set(region.neighbours).size).toBe(region.neighbours.length);
    }
  });
});

describe("uuidV5", () => {
  it("matches the RFC 9562 test vector (DNS namespace, www.example.com)", () => {
    expect(uuidV5("www.example.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(
      "2ed6657d-e927-568b-95e1-2665a8aea6a2",
    );
  });
});

describe("regions table (migration 0020) equals the constant", () => {
  let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
  let cleanup: () => Promise<void>;
  beforeAll(async () => {
    ({ db, cleanup } = await setupTestDatabase());
  });
  afterAll(async () => cleanup?.());

  it("has the same rows, field for field", async () => {
    const rows = await executeRows<{
      id: string;
      code: string;
      kind: string;
      slug: string;
      name_uk: string;
      name_uk_short: string;
      name_uk_label: string;
      name_en: string;
    }>(db, sql`SELECT * FROM regions ORDER BY code`);
    const expected = [...REGIONS]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((r) => ({
        id: r.id,
        code: r.code,
        kind: r.kind,
        slug: r.slug,
        name_uk: r.name.uk,
        name_uk_short: r.name.ukShort,
        name_uk_label: r.name.ukLabel,
        name_en: r.name.en,
      }));
    expect(rows).toEqual(expected);
  });
});
