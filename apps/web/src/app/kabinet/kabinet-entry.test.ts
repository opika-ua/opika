import { describe, expect, it, vi } from "vitest";

/**
 * The confirmed card's session read goes through the real principal read to Better Auth with
 * `disableRefresh`: showing a page is not a visit (the DB-backed pin is `auth.test.ts`).
 */
const getSession = vi.hoisted(() => vi.fn(async (_options: unknown) => null));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "a=b" }) }));
vi.mock("../../kabinet/runtime", () => ({ kabinetAuth: () => ({ api: { getSession } }) }));
vi.mock("../../kabinet/kabinet-db", () => ({ kabinetDb: () => ({}) }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));
vi.mock("../../kabinet/auth-route", () => ({
  kabinetAuthAvailability: () => ({ kind: "available" }),
}));

const { kabinetEntry } = await import("./signed-in-person");

describe("kabinetEntry's session read", () => {
  it("never asks Better Auth to refresh the session", async () => {
    expect(await kabinetEntry()).toBe("sign_in");
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(getSession.mock.calls[0]?.[0]).toMatchObject({ query: { disableRefresh: true } });
  });
});
