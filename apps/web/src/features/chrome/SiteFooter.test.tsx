import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteFooter } from "./SiteFooter";

const INDEPENDENT = "Opika робить одна людина, незалежно. Це не державний і не міський сервіс.";

afterEach(() => {
  vi.unstubAllEnvs();
});

function footer() {
  render(<SiteFooter />);
  return within(screen.getByRole("contentinfo"));
}

describe("SiteFooter", () => {
  it("is one contentinfo landmark linking to the site's pages, the email and Instagram", () => {
    vi.stubEnv("SELF_REGISTRATION_ENABLED", "1");
    const f = footer();
    const hrefs = f
      .getAllByRole("link")
      .map((link) => [link.textContent, link.getAttribute("href")]);
    expect(hrefs).toEqual([
      ["Тварини", "/tvaryny"],
      ["Для притулків", "/prytulkam"],
      ["Про проєкт", "/pro"],
      ["Правила", "/prytulkam#pravyla"],
      ["hello@opika.org.ua", "mailto:hello@opika.org.ua"],
      ["Instagram", "https://www.instagram.com/opika.ua/"],
    ]);
    expect(f.getByText(INDEPENDENT)).toBeTruthy();
  });

  it("leaves «Правила» out while self-registration is off: /prytulkam has no rules section then", () => {
    vi.stubEnv("SELF_REGISTRATION_ENABLED", "");
    const f = footer();
    expect(f.queryByRole("link", { name: "Правила" })).toBeNull();
    expect(f.getByRole("link", { name: "Про проєкт" }).getAttribute("href")).toBe("/pro");
  });

  it("opens Instagram in a new tab without handing it the opener", () => {
    const link = footer().getByRole("link", { name: "Instagram" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener");
  });

  it("has no link into /kabinet (those must be full page loads, #509)", () => {
    vi.stubEnv("SELF_REGISTRATION_ENABLED", "1");
    for (const link of footer().getAllByRole("link")) {
      expect(link.getAttribute("href")?.startsWith("/kabinet")).toBe(false);
    }
  });
});
