import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OperatorShell } from "./OperatorShell";

/**
 * The operator's nav (R-UI 1's shell; «Новий притулок» joins it with S2 in
 * R-UI 2): where each item leads and which one is the current page. Labels
 * typed from his Ukrainian (`rui-copy-uk.md` §1.1).
 */

const nav = (current: "shelters" | "new_shelter" | null) => {
  render(
    <OperatorShell operatorName="Олексій" current={current}>
      <p>page</p>
    </OperatorShell>,
  );
  return within(screen.getByRole("navigation"));
};

describe("the operator's nav", () => {
  it("leads to the list and to the create page", () => {
    const links = nav(null).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Притулки", "/kabinet/prytulky"],
      ["Новий притулок", "/kabinet/prytulky/novyi"],
    ]);
  });

  it.each([
    ["shelters", "Притулки"],
    ["new_shelter", "Новий притулок"],
  ] as const)("marks %s as the current page, and only it", (current, label) => {
    const links = nav(current).getAllByRole("link");
    expect(
      links
        .filter((link) => link.getAttribute("aria-current") === "page")
        .map((l) => l.textContent),
    ).toEqual([label]);
  });

  it("marks nothing on a page outside the nav (S4)", () => {
    expect(
      nav(null)
        .getAllByRole("link")
        .filter((link) => link.hasAttribute("aria-current")),
    ).toEqual([]);
  });
});
