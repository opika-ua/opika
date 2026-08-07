import { contract } from "@opika/contracts";
import { isContractProcedure } from "@orpc/contract";
import { type AnyRouter, implement, isLazy, isProcedure, os } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { router } from "./router";

/**
 * Locks the one property the type system cannot enforce (CLAUDE.md,
 * "Obligations the contract cannot express"): every procedure the server
 * actually serves must be built through `implement(contract)`, because that
 * is the only thing that attaches an output schema — and an output schema is
 * the only thing that strips a handler's return value down to the public
 * view. The fields at stake are a shelter's exact address and contact
 * details (`Shelter.exactAddress`, `ShelterContactSnapshot`): a handler
 * assembled on the plain `os` builder with no `.output()` would return
 * whatever the handler function produced, unfiltered.
 *
 * Two independent checks:
 *  1. Structural — walk `contract` and the real `router` in parallel and
 *     assert, for every leaf, that the router's output schema is the exact
 *     same object the contract declares. This is what "goes through
 *     implement(contract)" means at runtime: `implement()` does not restate
 *     the schema, it inherits the contract's own instance.
 *  2. Behavioural — on a throwaway contract, prove the mechanism the
 *     structural check relies on: an `implement(contract)`-built procedure
 *     strips a field the handler adds but the schema doesn't declare, and a
 *     plain-`os` procedure does not. Without this, check 1 is trusting a
 *     claim about the library rather than demonstrating it.
 */

type LeafInfo = {
  readonly path: string;
  readonly node: unknown;
};

/**
 * Walk a contract or router tree and collect every leaf procedure with its
 * dotted path. Works on both trees because `isContractProcedure` and
 * `isProcedure` each recognise only their own kind — a router leaf is never
 * mistaken for a contract leaf and vice versa, so running this once per tree
 * and comparing path sets is exact, not approximate.
 *
 * Exact, however, only over the node kinds it understands. A *lazy* router
 * (`os.lazy(...)`, oRPC's code-splitting primitive) is an object with no own
 * enumerable keys — `Object.entries` on one returns `[]` — so the recursion
 * below walks straight past it and reports zero leaves for the whole subtree
 * behind it. Verified against @orpc/server 1.14.14: splicing
 * `{ admin: os.lazy(async () => ({ default: { leak: os.handler(...) } })) }`
 * into the router leaves every assertion in this file green while
 * `RPCHandler` happily serves `POST /api/rpc/admin/leak` and returns the
 * handler's raw object — exact address and phone number included. That is
 * precisely the bypass these tests exist to make impossible, so a lazy node
 * is a hard error rather than something to walk past: whoever introduces one
 * must first teach this walk to resolve it (`unlazy` from @orpc/server).
 */
function collectLeaves(node: unknown, path: readonly string[] = []): LeafInfo[] {
  if (isContractProcedure(node) || isProcedure(node)) {
    return [{ path: path.join("."), node }];
  }
  if (isLazy(node)) {
    throw new Error(
      `lazy router or procedure at "${path.join(".") || "<root>"}": this walk cannot see ` +
        `through it, so every procedure behind it would be served without ever being ` +
        `checked against the contract. Resolve it with \`unlazy\` before collecting, or ` +
        `do not use a lazy router here.`,
    );
  }
  if (node !== null && typeof node === "object" && !Array.isArray(node)) {
    return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
      collectLeaves(value, [...path, key]),
    );
  }
  return [];
}

function outputSchemaOf(node: unknown): unknown {
  return (node as { readonly "~orpc": { readonly outputSchema: unknown } })["~orpc"].outputSchema;
}

describe("every served procedure goes through implement(contract)", () => {
  const contractLeaves = collectLeaves(contract);
  const routerLeaves = collectLeaves(router);

  // A canary against the check below passing vacuously. If `collectLeaves`
  // ever stopped recognising procedures (an @orpc major bump renaming
  // `isContractProcedure`, say), both trees would walk to zero leaves and
  // every assertion that follows would pass on an empty set.
  //
  // The list is spelled out rather than counted so that adding a procedure is
  // a deliberate edit here, made while looking at what is being served, rather
  // than a number quietly incremented. `gallery.*` joined it in Phase E0.
  it("finds exactly the ten contracted procedures", () => {
    expect(contractLeaves.map((l) => l.path).sort()).toEqual([
      "animals.byId",
      "animals.reveal",
      "cities.list",
      "feed.list",
      "gallery.list",
      "gallery.relaxationCounts",
      "reveals.listMine",
      "session.bootstrap",
      "shelters.byId",
      "swipes.record",
    ]);
  });

  it("wires exactly the contracted paths — nothing missing, nothing extra", () => {
    const contractPaths = contractLeaves.map((l) => l.path).sort();
    const routerPaths = routerLeaves.map((l) => l.path).sort();

    // Missing: a contract procedure with no router counterpart — an endpoint
    // documented in the contract but never actually served.
    // Extra: a router leaf with no contract counterpart — an ad-hoc
    // procedure spliced into the router object outside `impl`, which is
    // exactly the shape a bypass would take, since `impl.<path>` is typed
    // against `contract` and cannot reference a path the contract lacks.
    expect(routerPaths).toEqual(contractPaths);
  });

  it.each(collectLeaves(contract).map((l) => l.path))(
    "%s: the served output schema is the contract's own schema instance",
    (path) => {
      const contractLeaf = contractLeaves.find((l) => l.path === path);
      const routerLeaf = routerLeaves.find((l) => l.path === path);
      expect(contractLeaf, `no contract leaf at ${path}`).toBeDefined();
      expect(
        routerLeaf,
        `router has no procedure at ${path} — see the previous test`,
      ).toBeDefined();

      const contractSchema = outputSchemaOf(contractLeaf?.node);
      const routerSchema = outputSchemaOf(routerLeaf?.node);

      expect(contractSchema, `${path}: contract declares no output schema`).toBeDefined();

      // Reference equality, not deep equality. `implement(contract)` hands the
      // router the contract's own Zod schema object; a handler re-declaring
      // an output schema that merely *looks* the same would defeat the point
      // of a shared contract just as thoroughly as omitting `.output()`
      // entirely — the two schemas could drift the next time either changes.
      expect(
        routerSchema,
        `${path}: the router's output schema is not the contract's schema instance. ` +
          `This is what "bypassed implement(contract)" looks like at runtime: either ` +
          `no schema (built on the plain \`os\` builder) or a hand-rolled one that isn't ` +
          `wired back to the contract, and both mean the stripping this test exists to ` +
          `guarantee does not happen.`,
      ).toBe(contractSchema);
    },
  );
});

describe("collectLeaves refuses to walk past what it cannot see", () => {
  /**
   * The guard added to `collectLeaves` for lazy routers, exercised — a throw
   * branch nothing reaches is the same as no guard at all. Without it this
   * subtree contributes zero paths, so "nothing extra" above passes while
   * `RPCHandler` serves `admin.leak` and returns its handler's object
   * verbatim, output schema and all.
   */
  it("throws on a lazy router instead of silently reporting an empty subtree", () => {
    const spliced = {
      admin: os.lazy(async () => ({ default: { leak: os.handler(() => ({})) } })),
    };

    expect(() => collectLeaves(spliced)).toThrow(/lazy router or procedure at "admin"/);
  });

  it("still throws when the lazy node is the root", () => {
    expect(() => collectLeaves(os.lazy(async () => ({ default: {} })))).toThrow(/<root>/);
  });
});

describe("what an implement(contract) bypass actually leaks (mechanism check)", () => {
  /**
   * Not the real API — a two-procedure throwaway contract, exercised through
   * a real `RPCHandler` exactly like the app's own route handler
   * (`app/api/rpc/[...rpc]/route.ts`). This is the thing the structural
   * checks above are trusting: that an attached output schema strips extra
   * fields, and that a missing one does not. Proved once here rather than
   * asserted eight times against the real handlers, where a stray extra
   * field would be a fixture-writing exercise, not a sharper test.
   */
  const PublicSchema = z.object({ id: z.string() });
  type Payload = { readonly id: string; readonly secret: string };
  const LEAK: Payload = { id: "abc", secret: "exact-address-and-contact-details" };

  async function callAndParse(handlerRouter: AnyRouter): Promise<unknown> {
    const rpcHandler = new RPCHandler(handlerRouter);
    const request = new Request("http://localhost/api/rpc/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json: {} }),
    });
    const result = await rpcHandler.handle(request, { prefix: "/api/rpc" });
    if (!result.matched) throw new Error("request did not match — test is misconfigured");
    return JSON.parse(await result.response.text());
  }

  it("implement(contract) strips a field the handler returns but the schema doesn't declare", async () => {
    const testContract = { get: os.output(PublicSchema) };
    const impl = implement(testContract);
    const testRouter = impl.router({
      get: impl.get.handler(() => LEAK),
    });

    const body = (await callAndParse(testRouter)) as { json: Record<string, unknown> };

    expect(body.json.id).toBe("abc");
    expect(
      body.json.secret,
      "implement(contract) should have stripped a field absent from the output schema",
    ).toBeUndefined();
  });

  it("the plain os builder with no .output() leaks the field implement(contract) would strip", async () => {
    const testRouter = { get: os.handler(() => LEAK) };

    const body = (await callAndParse(testRouter)) as { json: Record<string, unknown> };

    // This is the failure mode, demonstrated rather than described: the same
    // handler, wired without a contract behind it, sends `secret` over the
    // wire. It is why the structural tests above check for a schema at all,
    // not just that a procedure exists at each path.
    expect(body.json.secret).toBe(LEAK.secret);
  });
});
