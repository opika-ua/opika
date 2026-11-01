import { beforeEach, describe, expect, it, vi } from "vitest";

const pageUserId = vi.fn();
vi.mock("../kabinet/runtime", () => ({ kabinetPageUserId: pageUserId }));

const { hasKabinetCookie, kabinetSessionCheckFor } = await import("./kabinet-session-check");

const headersWith = (cookie: string) => new Headers({ cookie });
const NOW = new Date("2026-09-09T12:00:00Z");

beforeEach(() => {
  pageUserId.mockReset();
});

describe("hasKabinetCookie", () => {
  it("covers the production and the development cookie names", () => {
    expect(hasKabinetCookie("a=1; __Host-kabinet.session_token=x")).toBe(true);
    expect(hasKabinetCookie("kabinet.session_token=x; a=1")).toBe(true);
  });

  it("ignores other cookies, values that merely contain the name, and no header", () => {
    expect(hasKabinetCookie(null)).toBe(false);
    expect(hasKabinetCookie("__Host-opika_session=x; a=kabinet.session_token")).toBe(false);
    expect(hasKabinetCookie("kabinet.dont_remember=true")).toBe(false);
  });
});

describe("kabinetSessionCheckFor", () => {
  it("is absent, and never looks anything up, without the cookie", () => {
    expect(kabinetSessionCheckFor(headersWith("a=1"), NOW)).toBeUndefined();
    expect(pageUserId).not.toHaveBeenCalled();
  });

  it("is true only for a session the server validates", async () => {
    const check = kabinetSessionCheckFor(headersWith("kabinet.session_token=x"), NOW);
    pageUserId.mockResolvedValueOnce("user-1");
    expect(await check?.()).toBe(true);
    pageUserId.mockResolvedValueOnce(null);
    expect(await check?.()).toBe(false);
  });

  it("is false when the lookup throws", async () => {
    pageUserId.mockImplementation(async () => {
      throw new Error("boom");
    });
    const check = kabinetSessionCheckFor(headersWith("kabinet.session_token=x"), NOW);
    expect(await check?.()).toBe(false);
  });
});
