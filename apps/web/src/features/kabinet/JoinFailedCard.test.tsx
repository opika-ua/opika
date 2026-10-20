import { uk } from "@opika/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JoinFailedCard } from "./JoinFailedCard";

/**
 * `/kabinet` when the automatic invitation accept failed (IN-Q12): a clear
 * message, announced, and a retry. Elements are found by their catalogue
 * keys; the heading and the message are also checked against Oleksii's final Ukrainian (2026-10-14),
 * transcribed, since the person stays signed in and nothing may read as if
 * they weren't.
 */
describe("JoinFailedCard", () => {
  it("says it in his words: signed in, nothing half-saved, it retries itself", () => {
    render(<JoinFailedCard />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Ви увійшли, але приєднати вас до притулку не вдалося",
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "Нічого не збережено наполовину. Спробуйте ще раз — а якщо не вийде, спроба повториться автоматично під час наступного входу.",
    );
    expect(screen.getByRole("link", { name: "Спробувати ще раз" })).toBeDefined();
  });

  it("announces the failure and offers a retry that reloads /kabinet", () => {
    render(<JoinFailedCard />);
    expect(screen.getByRole("alert").textContent).toBe(uk.kabinet.confirm.joinFailed);
    const retry = screen.getByRole("link", { name: uk.kabinet.confirm.joinRetry });
    expect(retry.getAttribute("href")).toBe("/kabinet");
    // Its own heading key (IN-T12 item 7), not the sign-in page's.
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      uk.kabinet.confirm.joinFailedTitle,
    );
  });
});
