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

  it("the CTA links to /discovery, the only real destination today", () => {
    render(<HomeScreen cities={[BROVARY]} />);

    const cta = screen.getByRole("link", { name: "Дивитися тварин" });
    expect(cta.getAttribute("href")).toBe("/discovery");
  });

  it("shows the language label without a non-functional English option", () => {
    render(<HomeScreen cities={[BROVARY]} />);

    expect(screen.getByText("Українська")).toBeTruthy();
    expect(screen.queryByText("English")).toBeNull();
    expect(screen.queryByRole("button", { name: /English/ })).toBeNull();
  });
});
