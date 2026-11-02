import { beforeEach, describe, expect, it, vi } from "vitest";

const read = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "a=b" }) }));
vi.mock("../../kabinet/runtime", () => ({ kabinetAuth: () => ({}) }));
vi.mock("../../kabinet/kabinet-db", () => ({ kabinetDb: () => ({}) }));
vi.mock("../../kabinet/principal", () => ({ kabinetSessionPersonOf: read }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));
vi.mock("../../kabinet/auth-route", () => ({
  kabinetAuthAvailability: () => ({ kind: "available" }),
}));

const { signedInPerson } = await import("./signed-in-person");

beforeEach(() => read.mockReset());

describe("signedInPerson", () => {
  it("passes what the session read gives, and reads once per call", async () => {
    read.mockResolvedValue({ name: "О", email: "a@b.test" });
    expect(await signedInPerson()).toEqual({ name: "О", email: "a@b.test" });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("no valid session is null, and a failing read is null too, never a throw", async () => {
    read.mockResolvedValueOnce(null);
    expect(await signedInPerson()).toBeNull();
    read.mockRejectedValueOnce(new Error("db down"));
    expect(await signedInPerson()).toBeNull();
  });
});
