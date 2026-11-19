import { uk } from "@opika/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderForSheltersPage } from "../../app/prytulkam/page";

describe("/prytulkam and the self-registration flag", () => {
  it("with the flag off: no registration section, no form, no password field", () => {
    const { container } = render(renderForSheltersPage(false, { selfRegistration: false }));
    expect(container.querySelector("#reyestratsiia")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(screen.queryByRole("heading", { name: uk.registration.title })).toBeNull();
  });

  it("with it on: the section and its form are there", () => {
    const { container } = render(renderForSheltersPage(false, { selfRegistration: true }));
    expect(container.querySelector("section#reyestratsiia form")).not.toBeNull();
    expect(screen.getByRole("heading", { name: uk.registration.steps.one })).toBeTruthy();
  });
});
