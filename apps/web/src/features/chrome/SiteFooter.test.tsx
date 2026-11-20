import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "./SiteFooter";

const INDEPENDENT = "Opika робить одна людина, незалежно. Це не державний і не міський сервіс.";

function footer() {
  render(<SiteFooter />);
  return screen.getByRole("contentinfo");
}

describe("SiteFooter (A2)", () => {
  it("is one contentinfo landmark: the sections, then the email and Instagram", () => {
    const links = within(footer())
      .getAllByRole("link")
      .map((link) => [link.textContent, link.getAttribute("href")]);
    expect(links).toEqual([
      ["Тварини", "/tvaryny"],
      ["Для притулків", "/prytulkam"],
      ["Про проєкт", "/pro"],
      ["hello@opika.org.ua", "mailto:hello@opika.org.ua"],
      ["Instagram", "https://www.instagram.com/opika.ua/"],
    ]);
    expect(screen.getAllByRole("contentinfo")).toHaveLength(1);
  });

  it("carries the independence line once", () => {
    expect(within(footer()).getAllByText(INDEPENDENT)).toHaveLength(1);
  });

  it("opens Instagram in a new tab without handing it the opener", () => {
    const link = within(footer()).getByRole("link", { name: "Instagram" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener");
  });

  it("keeps the mascots, the logo and the icons out of the accessibility tree", () => {
    const el = footer();
    const mascots = [...el.querySelectorAll("[data-mascot]")];
    expect(mascots.map((m) => m.getAttribute("data-mascot"))).toEqual(["cat-sit", "dog-sit"]);
    for (const mascot of mascots) expect(mascot.getAttribute("aria-hidden")).toBe("true");
    const icons = within(el)
      .getAllByRole("link")
      .flatMap((link) => [...link.querySelectorAll("svg")]);
    expect(icons).toHaveLength(2);
    for (const icon of icons) expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect(el.querySelector("img")?.getAttribute("aria-hidden")).toBe("true");
    expect(within(el).queryByRole("img")).toBeNull();
  });

  it("has no link into /kabinet (those must be full page loads, #509)", () => {
    for (const link of within(footer()).getAllByRole("link")) {
      expect(link.getAttribute("href")?.startsWith("/kabinet")).toBe(false);
    }
  });
});
