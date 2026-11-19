import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssistanceLine } from "./AssistanceLine";
import { AuthCardFooter } from "./AuthCardFooter";

describe("AuthCardFooter", () => {
  it("reads as one sentence with a plain link to the other auth action", () => {
    render(<AuthCardFooter text="Уже маєте кабінет?" linkLabel="Увійти" href="/kabinet/vkhid" />);
    const link = screen.getByRole("link", { name: "Увійти" });
    // A plain anchor: a full page load into /kabinet (#509), not a client navigation.
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/kabinet/vkhid");
    expect(link.parentElement?.textContent).toBe("Уже маєте кабінет? Увійти");
  });
});

describe("AssistanceLine", () => {
  it("has a decorative icon and a named link to the contact", () => {
    const { container } = render(
      <AssistanceLine
        text="Потрібна допомога?"
        linkLabel="Напишіть мені"
        href="mailto:x@example.org"
      />,
    );
    expect(screen.getByRole("link", { name: "Напишіть мені" }).getAttribute("href")).toBe(
      "mailto:x@example.org",
    );
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.textContent).toBe("Потрібна допомога? Напишіть мені");
  });
});
