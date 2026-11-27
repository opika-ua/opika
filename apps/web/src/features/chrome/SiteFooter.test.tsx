import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "./SiteFooter";

const INDEPENDENT = "Opika робить одна людина, незалежно. Це не державний і не міський сервіс.";

function footer() {
  render(<SiteFooter />);
  return screen.getByRole("contentinfo");
}

describe("SiteFooter (A2)", () => {
  it("is one contentinfo landmark: the logo, the sections, then the email, Instagram and the privacy policy", () => {
    const links = within(footer())
      .getAllByRole("link")
      .map((link) => [link.textContent, link.getAttribute("href")]);
    expect(links).toEqual([
      ["Opika", "/"],
      ["Тварини", "/"],
      ["Для притулків", "/prytulkam"],
      ["Про проєкт", "/pro"],
      ["hello@opika.org.ua", "mailto:hello@opika.org.ua"],
      ["Instagram", "https://www.instagram.com/opika.ua/"],
      ["Політика конфіденційності", "/polityka-konfidentsiinosti"],
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

  it("draws its graphics from static files: no inline svg or img, the mascots hidden", () => {
    const el = footer();
    expect(el.querySelectorAll("svg, img")).toHaveLength(0);
    expect(within(el).queryByRole("img")).toBeNull();
    const mascots = el.querySelector(".footer-mascots");
    expect(mascots?.getAttribute("aria-hidden")).toBe("true");
    // The logo link is named by the wordmark alone; the icons add nothing to the contacts' names.
    expect(within(el).getByRole("link", { name: "Opika" }).getAttribute("href")).toBe("/");
    expect(within(el).getByRole("link", { name: "hello@opika.org.ua" })).toBeTruthy();
  });

  it("has no link into /kabinet (those must be full page loads, #509)", () => {
    for (const link of within(footer()).getAllByRole("link")) {
      expect(link.getAttribute("href")?.startsWith("/kabinet")).toBe(false);
    }
  });
});
