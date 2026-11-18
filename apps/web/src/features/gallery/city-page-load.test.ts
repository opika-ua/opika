import { ORPCError } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";
import { type CityPageClient, loadCityPage } from "./city-page-load";
import { KYIV_LABEL } from "./test-places";

const KYIV = KYIV_LABEL;

function stub(withPages: () => Promise<unknown>) {
  const resolveTokens = vi.fn(async ({ tokens }: { tokens: string[] }) =>
    tokens.map((token) => ({ token, city: KYIV, via: "slug" as const })),
  );
  return {
    client: { cities: { resolveTokens, withPages: vi.fn(withPages) } } as unknown as CityPageClient,
    resolveTokens,
  };
}

/** The refusals the database-backed test (`app/tvaryny/misto/[slug]/page.test.tsx`) cannot provoke. */
describe("loadCityPage's refusals", () => {
  it("a refusal for rate is its own state, never «not found»", async () => {
    const { client } = stub(async () => {
      throw new ORPCError("RATE_LIMITED");
    });
    expect(await loadCityPage("kyiv", client)).toEqual({ kind: "rate_limited" });
  });

  it("any other failure is thrown to the error boundary", async () => {
    const { client } = stub(async () => {
      throw new Error("connection terminated");
    });
    await expect(loadCityPage("kyiv", client)).rejects.toThrow("connection terminated");
  });

  it("an empty or over-long slug is not found without asking the server", async () => {
    const { client, resolveTokens } = stub(async () => []);
    expect(await loadCityPage("", client)).toEqual({ kind: "not_found" });
    expect(await loadCityPage("x".repeat(500), client)).toEqual({ kind: "not_found" });
    expect(resolveTokens).not.toHaveBeenCalled();
  });
});
