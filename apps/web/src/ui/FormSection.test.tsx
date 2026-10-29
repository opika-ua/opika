import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormSection, FormSteps } from "./FormSection";

describe("FormSection", () => {
  it("is a named region whose heading carries the title, with every child in the page", () => {
    render(
      <FormSection id="basics" title="Основне" step={1}>
        <input aria-label="Імʼя" />
      </FormSection>,
    );
    const region = screen.getByRole("region", { name: "Основне" });
    expect(region.id).toBe("basics");
    expect(within(region).getByRole("heading", { level: 2, name: "Основне" }).id).toBe(
      "basics-title",
    );
    expect(within(region).getByLabelText("Імʼя")).toBeTruthy();
  });

  it("shows the step number as decoration only: the heading's name stays the title", () => {
    render(
      <FormSection id="photos" title="Фото" step={2}>
        {null}
      </FormSection>,
    );
    expect(screen.getByRole("heading", { name: "Фото" })).toBeTruthy();
    expect(screen.getByText("2").getAttribute("aria-hidden")).toBe("true");
  });

  it("the heading can take programmatic focus without joining the tab order", () => {
    render(
      <FormSection id="publication" title="Публікація">
        {null}
      </FormSection>,
    );
    expect(screen.getByRole("heading", { name: "Публікація" }).getAttribute("tabindex")).toBe("-1");
  });
});

describe("FormSteps", () => {
  it("is a nav named by the page title, with one plain anchor per section in order", () => {
    render(
      <>
        <h1 id="title">Нова тварина</h1>
        <FormSteps
          labelledBy="title"
          steps={[
            { id: "basics", label: "Основне" },
            { id: "photos", label: "Фото" },
            { id: "about", label: "Про тварину" },
          ]}
        />
      </>,
    );
    const nav = screen.getByRole("navigation", { name: "Нова тварина" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "#basics",
      "#photos",
      "#about",
    ]);
    expect(links.map((link) => link.textContent)).toEqual(["1Основне", "2Фото", "3Про тварину"]);
  });
});
