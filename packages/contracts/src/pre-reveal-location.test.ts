import { describe, expect, it } from "vitest";
import { contract } from "./contract";

/**
 * Oleksii, 2026-10-14 (inbox EM-Q10, answer (a)), verbatim: "Stop sending
 * district and fuzzed coordinates in public responses before a reveal (exact
 * address after a reveal stays, per decision #2). Contract test: the public
 * pre-reveal schema contains no district and no coordinates. Re-adding them
 * needs an explicit decision."
 *
 * This walks every output schema of the adopter contract, at every depth,
 * through every wrapper Zod has. The two reveal outputs are the only
 * exemptions, by name: they are where decision #2 sends the exact address.
 * Every other procedure is checked, including ones added later, because the
 * list below is of exemptions, not of checked procedures.
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
] as const;

/** After a reveal (decision #2): the snapshot carries the exact address on purpose. */
const POST_REVEAL = new Set(["animals.reveal", "reveals.listMine"]);

const DECISION =
  "re-adding a district or coordinates to a pre-reveal response needs an explicit decision " +
  "(Oleksii, 2026-10-14, inbox EM-Q10)";

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

describe("pre-reveal responses carry the city only (EM-Q10)", () => {
  const all = procedures(contract);
  const preReveal = all.filter(([path]) => !POST_REVEAL.has(path));

  it("checks the four location-bearing procedures, and exempts only the two reveal outputs", () => {
    const paths = all.map(([path]) => path);
    for (const exempt of POST_REVEAL) expect(paths, exempt).toContain(exempt);
    expect(preReveal.map(([path]) => path)).toEqual(
      expect.arrayContaining(["feed.list", "gallery.list", "animals.byId", "shelters.byId"]),
    );
  });

  it.each(preReveal.map(([path, procedure]) => [path, procedure] as const))(
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

  it("the walker finds the keys where they do exist: the reveal snapshot", () => {
    const reveal = all.find(([path]) => path === "animals.reveal")?.[1];
    if (reveal === undefined) throw new Error("animals.reveal missing from the contract");
    const found = forbiddenIn(reachableKeys(reveal["~orpc"].outputSchema));
    expect(found).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\.exactAddress$/),
        expect.stringMatching(/\.district$/),
        expect.stringMatching(/\.coordinates$/),
        expect.stringMatching(/\.lat$/),
      ]),
    );
  });

  it("fails loudly on a Zod type it doesn't know rather than skipping it", () => {
    expect(() => reachableKeys({ _zod: { def: { type: "brand_new_wrapper" } } })).toThrow(
      /doesn't know Zod type "brand_new_wrapper"/,
    );
  });
});
