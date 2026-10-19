import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PHOTO_PROCESSING_BUDGET_MS } from "./photo-uploads";

/**
 * Oleksii, 2026-10-19, verbatim: "Add a check that the upload route's Vercel
 * maxDuration is above the 10 s processing budget, so the budget always fires
 * first." Uploads (`shelter.photos.add`) go through the kabinet RPC route.
 * Read from the source, not imported: Next reads route segment config
 * statically, so the literal in the file is what Vercel gets, and importing
 * the route would load Better Auth and the database.
 */
const ROUTE = resolve(fileURLToPath(import.meta.url), "../../app/api/kabinet/[...rpc]/route.ts");

describe("the kabinet route's maxDuration, which photo uploads run under", () => {
  const declarations = [
    ...readFileSync(ROUTE, "utf8").matchAll(/^export const maxDuration = (\d+);$/gm),
  ];

  it("is declared once, as a literal number of seconds", () => {
    expect(declarations).toHaveLength(1);
  });

  it("is above the processing budget, so the budget always fires first", () => {
    expect(Number(declarations[0]?.[1]) * 1000).toBeGreaterThan(PHOTO_PROCESSING_BUDGET_MS);
  });
});
