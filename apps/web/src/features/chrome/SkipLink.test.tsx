import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ContentPageLayout } from "./ContentPageLayout";
import { SkipLink } from "./SkipLink";

describe("SkipLink", () => {
  it("is the first Tab stop and points at the one main landmark", async () => {
    render(
      <>
        <SkipLink />
        <ContentPageLayout kabinetSignedIn={false} title="Заголовок">
          <p>Вміст</p>
        </ContentPageLayout>
      </>,
    );

    await userEvent.tab();
    const link = screen.getByRole("link", { name: "Перейти до вмісту" });
    expect(document.activeElement).toBe(link);

    const target = link.getAttribute("href")?.slice(1);
    const main = screen.getByRole("main");
    expect(main.id).toBe(target);
    // Focusable by script, which is what lets Enter move focus there in a browser.
    expect(main.tabIndex).toBe(-1);
  });
});
