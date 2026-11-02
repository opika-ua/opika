import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { metadata, renderForSheltersPage } from "./page";

describe("«Для притулків»", () => {
  it("states it is run by one person, independent of any state or city service", () => {
    render(renderForSheltersPage(false));
    expect(
      screen.getByText("Opika робить одна людина, незалежно. Це не державний і не міський сервіс."),
    ).toBeTruthy();
  });

  /** PW-2, his scope item 1, verbatim: "«Для притулків» page: add «Увійти в кабінет» → /kabinet/vkhid." */
  it("links «Увійти в кабінет» to the kabinet's sign-in page", () => {
    render(renderForSheltersPage(false));
    const link = screen.getByRole("link", { name: "Увійти в кабінет" });
    expect(link.getAttribute("href")).toBe("/kabinet/vkhid");
  });

  it("sets its own canonical (PR B, the SEO review of page titles)", () => {
    expect(metadata.alternates?.canonical).toBe("/prytulkam");
  });
});
