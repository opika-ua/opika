import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OpenAnchoredDetails } from "./OpenAnchoredDetails";

function Page() {
  return (
    <>
      <OpenAnchoredDetails />
      <a href="#pravyla">rules</a>
      <details id="perevirka">
        <summary>q1</summary>
        <p>a1</p>
      </details>
      <details id="pravyla">
        <summary>q2</summary>
        <p>a2</p>
      </details>
    </>
  );
}

const opened = (container: HTMLElement, id: string) =>
  container.querySelector<HTMLDetailsElement>(`details#${id}`)?.open;

afterEach(() => window.history.replaceState(null, "", "/"));

describe("anchors into /prytulkam's questions", () => {
  it("a page loaded with the hash opens that question only", () => {
    window.history.replaceState(null, "", "/prytulkam#perevirka");
    const { container } = render(<Page />);
    expect(opened(container, "perevirka")).toBe(true);
    expect(opened(container, "pravyla")).toBe(false);
  });

  it("a same-page link (the consent line, a jump link) opens its question", () => {
    window.history.replaceState(null, "", "/prytulkam");
    const { container, getByText } = render(<Page />);
    expect(opened(container, "pravyla")).toBe(false);
    fireEvent.click(getByText("rules"));
    expect(opened(container, "pravyla")).toBe(true);
  });

  it("a hash change opens the named question", () => {
    window.history.replaceState(null, "", "/prytulkam");
    const { container } = render(<Page />);
    act(() => {
      window.history.replaceState(null, "", "/prytulkam#perevirka");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(opened(container, "perevirka")).toBe(true);
  });
});
