import type { CityView } from "@opika/contracts";
import type { CityId } from "@opika/domain";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { readStoredFilters } from "../filters/filter-state";
import { HomeScreen } from "./HomeScreen";

const BROVARY: CityView = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as CityId,
  name: { uk: "Бровари", en: null },
  centroid: { lat: 50.51, lng: 30.79 },
};
const IRPIN: CityView = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as CityId,
  name: { uk: "Ірпінь", en: null },
  centroid: { lat: 50.52, lng: 30.25 },
};

describe("HomeScreen", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("renders the wordmark, promise, and every fetched city as a chip", () => {
    render(<HomeScreen cities={[BROVARY, IRPIN]} />);

    expect(screen.getByText("Opika")).toBeTruthy();
    expect(screen.getByText(/Тварини з перевірених притулків/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Бровари" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ірпінь" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Уся Київщина" })).toBeTruthy();
  });

  it("starts with no city selected — the honest default, not the mockup's illustrative one", () => {
    render(<HomeScreen cities={[BROVARY, IRPIN]} />);

    expect(screen.getByRole("button", { name: "Бровари" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(screen.getByRole("button", { name: "Уся Київщина" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("selecting a city marks it pressed and persists the real CityId", async () => {
    const user = userEvent.setup();
    render(<HomeScreen cities={[BROVARY, IRPIN]} />);

    await user.click(screen.getByRole("button", { name: "Бровари" }));

    expect(screen.getByRole("button", { name: "Бровари" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Уся Київщина" }).getAttribute("aria-pressed")).toBe(
      "false",
    );

    const stored = readStoredFilters(window.sessionStorage);
    expect(stored.cities).toEqual({ kind: "oneOf", values: [BROVARY.id] });
  });

  it("selecting a second city replaces the first, not adds to it", async () => {
    const user = userEvent.setup();
    render(<HomeScreen cities={[BROVARY, IRPIN]} />);

    await user.click(screen.getByRole("button", { name: "Бровари" }));
    await user.click(screen.getByRole("button", { name: "Ірпінь" }));

    expect(screen.getByRole("button", { name: "Бровари" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(screen.getByRole("button", { name: "Ірпінь" }).getAttribute("aria-pressed")).toBe(
      "true",
    );

    const stored = readStoredFilters(window.sessionStorage);
    expect(stored.cities).toEqual({ kind: "oneOf", values: [IRPIN.id] });
  });

  it("the CTA links to the gallery, unfiltered, before any city is picked", () => {
    render(<HomeScreen cities={[BROVARY]} />);

    const cta = screen.getByRole("link", { name: "Дивитися тварин" });
    expect(cta.getAttribute("href")).toBe("/tvaryny");
  });

  it("selecting a city changes the CTA's real destination, not just the chip state", async () => {
    const user = userEvent.setup();
    render(<HomeScreen cities={[BROVARY, IRPIN]} />);

    await user.click(screen.getByRole("button", { name: "Бровари" }));

    const cta = screen.getByRole("link", { name: "Дивитися тварин" });
    const href = cta.getAttribute("href") ?? "";
    expect(href.startsWith("/tvaryny")).toBe(true);
    expect(href).toContain(BROVARY.id);
  });

  it("renders no language toggle at all — deferred until H3 wires real English, not re-skinned here", () => {
    render(<HomeScreen cities={[BROVARY]} />);

    expect(screen.queryByText("Українська")).toBeNull();
    expect(screen.queryByText("English")).toBeNull();
  });
});
