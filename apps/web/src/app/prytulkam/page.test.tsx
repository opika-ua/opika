import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ForSheltersPage from "./page";

describe("«Для притулків»", () => {
  /** PW-2, his scope item 1, verbatim: "«Для притулків» page: add «Увійти в кабінет» → /kabinet/vkhid." */
  it("links «Увійти в кабінет» to the kabinet's sign-in page", () => {
    render(<ForSheltersPage />);
    const link = screen.getByRole("link", { name: "Увійти в кабінет" });
    expect(link.getAttribute("href")).toBe("/kabinet/vkhid");
  });
});
