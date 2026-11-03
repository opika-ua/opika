import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoadErrorScreen } from "./LoadErrorScreen";

describe("LoadErrorScreen", () => {
  it("shows the error inside the site header, not on a bare page", () => {
    const onRetry = vi.fn();
    render(
      <LoadErrorScreen
        eyebrow="Помилка"
        title="Не вдалося завантажити"
        body="Спробуйте ще раз"
        retryLabel="Ще раз"
        onRetry={onRetry}
        escapeLabel="Усі тварини"
        testIdPrefix="x"
        escapeTestId="x-escape"
      />,
    );
    expect(screen.getByRole("banner")).toBeTruthy();
    const main = screen.getByRole("main");
    expect(
      within(main).getByRole("heading", { level: 1, name: "Не вдалося завантажити" }),
    ).toBeTruthy();
    expect(within(main).getByRole("button", { name: "Ще раз" })).toBeTruthy();
  });
});
