import { uk } from "@opika/i18n";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two link pages as Next calls them, with the real `kabinetEntry` wired in: only the link's
 * decision and the session read underneath are stand-ins.
 */
const outcome = vi.hoisted(() => vi.fn());
const read = vi.hoisted(() => vi.fn());
const cookiePresent = vi.hoisted(() => ({ value: false }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ cookie: "a=b" }),
  cookies: async () => ({ has: () => cookiePresent.value }),
}));
vi.mock("../../../kabinet/registration/email-link-runtime", () => ({
  servedRegistrationLinkOutcome: outcome,
}));
vi.mock("../../../kabinet/registration/email-link-action", () => ({
  submitConfirmEmailLink: vi.fn(),
  submitNotMeLink: vi.fn(),
}));
vi.mock("../../../kabinet/principal", () => ({ kabinetSessionPersonOf: read }));
vi.mock("../../../kabinet/runtime", () => ({ kabinetAuth: () => ({}) }));
vi.mock("../../../kabinet/kabinet-db", () => ({ kabinetDb: () => ({}) }));
vi.mock("../../../kabinet/auth-route", () => ({
  kabinetAuthAvailability: () => ({ kind: "available" }),
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));

const { default: ConfirmEmailLinkPage } = await import("./pidtverdyty/page");
const { default: NotMeLinkPage } = await import("./ne-ya/page");

const searchParams = Promise.resolve({ token: "t" });
const confirmed = { kind: "page", state: { kind: "confirmed" }, status: 200 };

beforeEach(() => {
  outcome.mockReset();
  read.mockReset();
  cookiePresent.value = false;
});

describe("the confirm page's confirmed card, through the page", () => {
  it("signed in to the kabinet: «Перейти в кабінет»", async () => {
    outcome.mockResolvedValue(confirmed);
    read.mockResolvedValue({ name: "Олена", email: "olena@example.org" });
    render(await ConfirmEmailLinkPage({ searchParams }));
    expect(screen.getByRole("link", { name: "Перейти в кабінет" }).getAttribute("href")).toBe(
      "/kabinet",
    );
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("signed out, or a session read that fails: «Увійти в кабінет»", async () => {
    outcome.mockResolvedValue(confirmed);
    read.mockResolvedValueOnce(null);
    const { unmount } = render(await ConfirmEmailLinkPage({ searchParams }));
    expect(screen.getByRole("link", { name: "Увійти в кабінет" })).toBeDefined();
    unmount();
    read.mockRejectedValueOnce(new Error("db down"));
    render(await ConfirmEmailLinkPage({ searchParams }));
    expect(screen.getByRole("link", { name: "Увійти в кабінет" })).toBeDefined();
  });
});

describe("the session is read only on a served confirm link", () => {
  it("an unserved link answers 404 without reading the session", async () => {
    outcome.mockResolvedValue({ kind: "not_found" });
    await expect(ConfirmEmailLinkPage({ searchParams })).rejects.toBeDefined();
    await expect(NotMeLinkPage({ searchParams })).rejects.toBeDefined();
    expect(read).not.toHaveBeenCalled();
  });

  it("«Це не я» never reads it", async () => {
    outcome.mockResolvedValue({ kind: "page", state: { kind: "expired" }, status: 400 });
    render(await NotMeLinkPage({ searchParams }));
    expect(screen.getByRole("alert")).toBeDefined();
    expect(read).not.toHaveBeenCalled();
  });
});

// Option A (owner, 2026-11-20): the public header, «Кабінет притулку» marked as the current section.
describe("the public header on both link pages", () => {
  it("has the site nav, with the kabinet entry current; the session cookie picks where it leads", async () => {
    outcome.mockResolvedValue({ kind: "page", state: { kind: "expired" }, status: 400 });
    const { unmount } = render(await NotMeLinkPage({ searchParams }));
    const nav = screen.getByRole("navigation", { name: "Opika" });
    expect(within(nav).getByRole("link", { name: uk.nav.animals }).getAttribute("href")).toBe("/");
    expect(within(nav).getByRole("link", { name: uk.nav.forShelters }).getAttribute("href")).toBe(
      "/prytulkam",
    );
    expect(within(nav).getByRole("link", { name: uk.nav.about }).getAttribute("href")).toBe("/pro");
    const entry = screen.getByTestId("nav-kabinet");
    expect(entry.getAttribute("aria-current")).toBe("true");
    expect(entry.getAttribute("href")).toBe("/kabinet/vkhid");
    unmount();

    cookiePresent.value = true;
    outcome.mockResolvedValue(confirmed);
    read.mockResolvedValue(null);
    render(await ConfirmEmailLinkPage({ searchParams }));
    expect(screen.getByTestId("nav-kabinet").getAttribute("href")).toBe("/kabinet");
  });
});
