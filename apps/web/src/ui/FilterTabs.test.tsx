import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { FilterTabs } from "./FilterTabs";

const TABS = [
  { id: "a", label: "Усі", count: 3, accessibleName: "Усі · 3" },
  { id: "b", label: "Чернетки", count: 1, accessibleName: "Чернетки · 1" },
  { id: "c", label: "Удома", count: 0, accessibleName: "Удома · 0" },
];

function Harness({ initial = "a" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <FilterTabs
      label="Показати"
      idPrefix="t"
      panelId="p"
      tabs={TABS}
      value={value}
      onChange={setValue}
    />
  );
}

describe("FilterTabs", () => {
  it("has one tab stop: the selected tab", () => {
    render(<Harness />);
    expect(screen.getAllByRole("tab").map((tab) => tab.getAttribute("tabindex"))).toEqual([
      "0",
      "-1",
      "-1",
    ]);
  });

  it("Left, Right, Home and End move and select, wrapping at the ends", async () => {
    render(<Harness />);
    screen.getByRole("tab", { name: "Усі · 3" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Чернетки · 1" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Чернетки · 1" }));
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Удома · 0" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Усі · 3" }).getAttribute("aria-selected")).toBe("true");
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Удома · 0" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Усі · 3" }).getAttribute("aria-selected")).toBe("true");
  });

  it("with none selected (a filter the tabs do not offer) the first tab is still reachable", () => {
    render(<Harness initial="stale" />);
    expect(screen.getAllByRole("tab")[0]?.getAttribute("tabindex")).toBe("0");
  });
});
