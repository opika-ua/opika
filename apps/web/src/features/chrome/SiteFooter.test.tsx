import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SiteFooter } from "./SiteFooter";

const pathname = vi.hoisted(() => ({ current: "/tvaryny" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

const CREDIT =
  "Перелік населених пунктів: Кодифікатор адміністративно-територіальних одиниць (Мінрозвитку), Creative Commons Attribution.";

describe("SiteFooter", () => {
  beforeEach(() => {
    pathname.current = "/tvaryny";
  });

  it("carries the codifier attribution and nothing else on a public page", () => {
    render(<SiteFooter />);
    const footer = screen.getByRole("contentinfo");
    expect(footer.textContent).toBe(CREDIT);
    expect(footer.querySelector("a")).toBeNull();
  });

  it("is absent in the cabinet", () => {
    for (const path of ["/kabinet", "/kabinet/tvaryny/nova"]) {
      pathname.current = path;
      const { unmount } = render(<SiteFooter />);
      expect(screen.queryByRole("contentinfo")).toBeNull();
      unmount();
    }
  });
});
