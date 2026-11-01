import { uk } from "@opika/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RateLimitedScreen } from "./RateLimitedScreen";

describe("RateLimitedScreen", () => {
  it("names the limit as the page heading and links back to the gallery", () => {
    render(<RateLimitedScreen />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(uk.detail.rateLimited);
    const link = screen.getByRole("link", { name: uk.detail.notFound.action });
    expect(link.getAttribute("href")).toBe("/tvaryny");
  });
});
