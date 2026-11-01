import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContentPageLayout } from "./ContentPageLayout";

describe("ContentPageLayout", () => {
  it("holds the title and the content in the one main landmark, outside the header", () => {
    render(
      <ContentPageLayout kabinetSignedIn={false} current="about" title="Заголовок">
        <p>Вміст</p>
      </ContentPageLayout>,
    );

    const main = screen.getByRole("main");
    expect(within(main).getByRole("heading", { level: 1, name: "Заголовок" })).toBeTruthy();
    expect(within(main).getByText("Вміст")).toBeTruthy();
    expect(within(main).queryByRole("banner")).toBeNull();
  });
});
