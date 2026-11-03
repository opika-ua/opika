import { StandardRPCJsonSerializer } from "@orpc/client/standard";
import { afterEach, describe, expect, it, vi } from "vitest";
import { savedBrowserClient } from "../../api/browser-client";

/**
 * The browser client takes the contract as a type only, so nothing validates a response on the
 * client. A Date still arrives as a Date because the RPC link's own serializer revives it from the
 * wire's type metadata; this runs the real client against a fake fetch to pin that.
 */
describe("the browser client revives dates from the RPC wire without a schema", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns a Date for a Date field, and leaves other values alone", async () => {
    const confirmedAt = new Date("2026-10-20T08:30:00.000Z");
    const [json, meta] = new StandardRPCJsonSerializer().serialize([
      { freshness: { kind: "fresh", confirmedAt, ageDays: 3 }, extra: undefined },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ json, meta }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    const result = (await savedBrowserClient.animals.cardsByIds({
      ids: [],
    } as never)) as unknown as {
      freshness: { kind: string; confirmedAt: unknown; ageDays: number };
    }[];

    const freshness = result[0]?.freshness;
    expect(freshness?.confirmedAt).toBeInstanceOf(Date);
    expect(freshness?.confirmedAt).toEqual(confirmedAt);
    expect(freshness?.ageDays).toBe(3);
  });
});
