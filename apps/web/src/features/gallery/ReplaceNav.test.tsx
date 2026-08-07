import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReplaceNav } from "./ReplaceNav";
import { mockAppRouter, WithMockRouter } from "./test-router";

describe("ReplaceNav", () => {
  it("intercepts a plain link click and calls router.replace instead of navigating", () => {
    const router = mockAppRouter();
    render(
      <WithMockRouter router={router}>
        <ReplaceNav>
          <a href="/tvaryny?vyd=dog">Собаки</a>
        </ReplaceNav>
      </WithMockRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Собаки" }));

    expect(router.replace).toHaveBeenCalledWith("/tvaryny?vyd=dog", { scroll: false });
  });

  it("does not intercept a modified click (new-tab intent) — ctrl/cmd/shift/middle-click pass through", () => {
    const router = mockAppRouter();
    render(
      <WithMockRouter router={router}>
        <ReplaceNav>
          <a href="/tvaryny?vyd=dog">Собаки</a>
        </ReplaceNav>
      </WithMockRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Собаки" }), { metaKey: true });
    fireEvent.click(screen.getByRole("link", { name: "Собаки" }), { ctrlKey: true });
    fireEvent.click(screen.getByRole("link", { name: "Собаки" }), { button: 1 });

    expect(router.replace).not.toHaveBeenCalled();
  });

  it("leaves a link with a non-_self target alone", () => {
    const router = mockAppRouter();
    render(
      <WithMockRouter router={router}>
        <ReplaceNav>
          <a href="/tvaryny?vyd=dog" target="_blank" rel="noopener">
            Собаки
          </a>
        </ReplaceNav>
      </WithMockRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Собаки" }));

    expect(router.replace).not.toHaveBeenCalled();
  });

  it("does not affect a click that isn't on a link at all", () => {
    const router = mockAppRouter();
    render(
      <WithMockRouter router={router}>
        <ReplaceNav>
          <button type="button">Not a link</button>
        </ReplaceNav>
      </WithMockRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Not a link" }));

    expect(router.replace).not.toHaveBeenCalled();
  });
});
