import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { ShelterHistoryEntrySchema } from "./history";

/**
 * Every field name anywhere inside a history entry, collected by walking the
 * Zod schema itself. HS-Q6: the history table must never carry adopter,
 * reveal or swipe data. The table's columns are pinned in
 * `packages/db/test/shelter-history.test.ts`; this pins what can go inside
 * its `entry` column.
 */
const fieldNames = (schema: z.ZodType, seen = new Set<z.ZodType>()): Set<string> => {
  const names = new Set<string>();
  if (seen.has(schema)) return names;
  seen.add(schema);
  const def = (schema as unknown as { _zod: { def: Record<string, unknown> } })._zod.def;
  const children: z.ZodType[] = [];
  if (def.type === "object") {
    for (const [key, child] of Object.entries(def.shape as Record<string, z.ZodType>)) {
      names.add(key);
      children.push(child);
    }
  }
  for (const key of ["options", "items"]) {
    if (Array.isArray(def[key])) children.push(...(def[key] as z.ZodType[]));
  }
  for (const key of ["innerType", "element", "in", "out", "valueType", "left", "right"]) {
    if (def[key]) children.push(def[key] as z.ZodType);
  }
  for (const child of children) for (const name of fieldNames(child, seen)) names.add(name);
  return names;
};

describe("a shelter history entry", () => {
  const names = fieldNames(ShelterHistoryEntrySchema);

  it("walks the real union (sanity: finds fields it must find)", () => {
    expect(names).toContain("reviewerId");
    expect(names).toContain("previousLive");
    expect(names).toContain("moderatorId");
    expect(names).toContain("e164");
  });

  it("can carry no adopter, reveal, swipe or view data at any depth", () => {
    // Per camelCase word, by stem, so inflections are caught too (`revealedBy`,
    // `viewedAt`, `swipedAt`), while `reviewerId` splits into "reviewer" and
    // "id" and matches nothing.
    const words = (name: string) => name.split(/(?=[A-Z])/).map((w) => w.toLowerCase());
    const STEMS = ["adopter", "reveal", "swip", "view", "seen"];
    const leaking = [...names].filter((name) =>
      words(name).some((w) => STEMS.some((stem) => w.startsWith(stem))),
    );
    expect(leaking).toEqual([]);
  });
});
