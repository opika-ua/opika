import { ContactRevealSchema } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { contract } from "./contract";

/**
 * Oleksii, 2026-10-14 (inbox EM-Q10, answer (a)), verbatim: "Stop sending
 * district and fuzzed coordinates in public responses before a reveal (exact
 * address after a reveal stays, per decision #2). Contract test: the public
 * pre-reveal schema contains no district and no coordinates. Re-adding them
 * needs an explicit decision."
 *
 * And after a reveal too, since 2026-10-15 (inbox EM-B6, answer 5, recorded
 * as decision EM-D1), verbatim: "Exact address in the reveal response: (b).
 * Stop sending it, along with district and coordinates. Decision #2 changes:
 * the exact address never leaves the server for adopters; the meeting place
 * is agreed with the shelter (matches the live copy). Record it as my
 * decision; contract test that no reveal or public response contains it."
 *
 * This walks every output schema of the adopter contract, at every depth,
 * through every wrapper Zod has, with no exemptions: `animals.reveal` and
 * `reveals.listMine` are checked like every other procedure, and so is any
 * procedure added later, because nothing here lists which ones to check.
 */
const FORBIDDEN_KEYS = [
  "district",
  "coordinates",
  "lat",
  "lng",
  "latitude",
  "longitude",
  // The fuzzed point's own field names, and the address fields, so the
  // shape can't come back under its old names either.
  "approximate",
  "center",
  "centroid",
  "precisionMetres",
  "exactAddress",
  // The exact address's own lines, so it can't come back flattened into the
  // snapshot under its field names. Not a bare `address`: that is the email
  // contact channel's key (`{ kind: "email", address }`), which a reveal
  // legitimately carries.
  "line1",
  "line2",
  "postalCode",
  "street",
] as const;

const DECISION =
  "re-adding a district, coordinates or the exact address to any adopter-facing response, " +
  "before or after a reveal, needs an explicit decision (Oleksii, 2026-10-14, inbox EM-Q10; " +
  "2026-10-15, inbox EM-B6 / EM-D1)";

type Def = { type: string } & Record<string, unknown>;
type ZodLike = { _zod: { def: Def } };

const LEAVES = new Set([
  "string",
  "number",
  "int",
  "boolean",
  "bigint",
  "date",
  "enum",
  "literal",
  "null",
  "undefined",
  "void",
  "never",
  "any",
  "unknown",
  "nan",
  "symbol",
  "template_literal",
  "custom",
  "file",
  "success",
]);

/**
 * Every object key reachable from `schema`, with its path. A wrapper the
 * walker doesn't know is a failure, never a silent stop: a key behind it
 * would otherwise go unchecked, which is the broken state this test is for.
 */
function reachableKeys(
  schema: unknown,
  path = "$",
  ancestors: ReadonlySet<unknown> = new Set(),
): readonly string[] {
  // Cycle guard on the current branch only: a schema shared by two fields
  // (the city view, the photo) is walked under each, so each path is reported.
  if (ancestors.has(schema)) return [];
  const seen = new Set(ancestors).add(schema);
  const def = (schema as ZodLike)._zod?.def;
  if (def === undefined) throw new Error(`${path}: not a Zod schema`);
  const walk = (child: unknown, childPath: string) => reachableKeys(child, childPath, seen);
  switch (def.type) {
    case "object": {
      const shape = def.shape as Record<string, unknown>;
      return Object.entries(shape).flatMap(([key, child]) => [
        `${path}.${key}`,
        ...walk(child, `${path}.${key}`),
      ]);
    }
    case "array":
      return walk(def.element, `${path}[]`);
    case "nullable":
    case "optional":
    case "readonly":
    case "default":
    case "prefault":
    case "catch":
    case "nonoptional":
      return walk(def.innerType, path);
    case "union":
      return (def.options as unknown[]).flatMap((option, i) => walk(option, `${path}|${i}`));
    case "intersection":
      return [...walk(def.left, path), ...walk(def.right, path)];
    case "pipe":
      return [...walk(def.in, path), ...walk(def.out, path)];
    case "record":
    case "map":
      return walk(def.valueType, `${path}{}`);
    case "set":
      return walk(def.valueType, `${path}{}`);
    case "tuple":
      return [
        ...(def.items as unknown[]).flatMap((item, i) => walk(item, `${path}[${i}]`)),
        ...(def.rest ? walk(def.rest, `${path}[...]`) : []),
      ];
    case "lazy":
      return walk((def.getter as () => unknown)(), path);
    default:
      if (LEAVES.has(def.type)) return [];
      throw new Error(`${path}: the walker doesn't know Zod type "${def.type}"; teach it`);
  }
}

const forbiddenIn = (keys: readonly string[]) =>
  keys.filter((key) =>
    (FORBIDDEN_KEYS as readonly string[]).includes(key.slice(key.lastIndexOf(".") + 1)),
  );

type Procedure = { readonly "~orpc": { readonly outputSchema: unknown } };

const procedures = (node: object, prefix = ""): readonly [string, Procedure][] =>
  Object.entries(node).flatMap(([key, value]) => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    return value !== null && Object.getPrototypeOf(value) === Object.prototype
      ? procedures(value as object, path)
      : [[path, value as Procedure] as const];
  });

describe("adopter-facing responses carry the city only, before and after a reveal (EM-Q10, EM-D1)", () => {
  const all = procedures(contract);

  it("checks every location-bearing procedure, the two reveal outputs included, with no exemption", () => {
    expect(all.map(([path]) => path)).toEqual(
      expect.arrayContaining([
        "feed.list",
        "gallery.list",
        "animals.byId",
        "shelters.byId",
        "animals.reveal",
        "reveals.listMine",
      ]),
    );
  });

  it.each(all.map(([path, procedure]) => [path, procedure] as const))(
    "%s: no district, coordinates or address key at any depth",
    (_path, procedure) => {
      const keys = reachableKeys(procedure["~orpc"].outputSchema);
      expect(forbiddenIn(keys), DECISION).toEqual([]);
    },
  );

  it("the location they do carry is reached by the walk (so an empty result means something)", () => {
    const feed = all.find(([path]) => path === "feed.list")?.[1];
    if (feed === undefined) throw new Error("feed.list missing from the contract");
    const keys = reachableKeys(feed["~orpc"].outputSchema);
    expect(keys).toEqual(
      expect.arrayContaining([
        "$.items[].publicLocation.cityId",
        "$.items[].shelter.publicLocation.cityId",
      ]),
    );
  });

  it("the reveal's own fields are reached by the walk: both contact sources and the city", () => {
    for (const [path, prefix] of [
      ["animals.reveal", "$"],
      ["reveals.listMine", "$.items[]"],
    ] as const) {
      const procedure = all.find(([candidate]) => candidate === path)?.[1];
      if (procedure === undefined) throw new Error(`${path} missing from the contract`);
      expect(reachableKeys(procedure["~orpc"].outputSchema), path).toEqual(
        expect.arrayContaining([
          // `shelterContact` is a union on `source` (current | first_reveal, K4-B5).
          `${prefix}.shelterContact|0.contact.primary|1.address`,
          `${prefix}.shelterContact|1.contact.primary|1.address`,
          `${prefix}.shelterAtFirstReveal.publicLocation.cityId`,
        ]),
      );
    }
  });

  /**
   * The stored snapshot still holds the exact address (the operator's record),
   * so the walker is proved on it: every forbidden name it should catch there,
   * it does. An empty result above therefore means the view left them out.
   */
  it("the walker finds the keys where they do exist: the stored (domain) reveal snapshot", () => {
    const found = forbiddenIn(reachableKeys(ContactRevealSchema));
    expect(found).toEqual(
      expect.arrayContaining([
        "$.shelterSnapshot.exactAddress",
        "$.shelterSnapshot.exactAddress.line1",
        "$.shelterSnapshot.exactAddress.line2",
        "$.shelterSnapshot.exactAddress.postalCode",
        "$.shelterSnapshot.exactAddress.district",
        "$.shelterSnapshot.exactAddress.coordinates",
        expect.stringMatching(/\.lat$/),
        expect.stringMatching(/\.lng$/),
        expect.stringMatching(/^\$\.shelterSnapshot\.publicLocation\|\d\.district$/),
      ]),
    );
  });

  it("fails loudly on a Zod type it doesn't know rather than skipping it", () => {
    expect(() => reachableKeys({ _zod: { def: { type: "brand_new_wrapper" } } })).toThrow(
      /doesn't know Zod type "brand_new_wrapper"/,
    );
  });
});
