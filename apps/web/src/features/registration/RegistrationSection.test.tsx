import { uk } from "@opika/i18n";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RegistrationSection } from "./RegistrationSection";

describe("the registration section on /prytulkam", () => {
  it("is the #reyestratsiia region, named by its heading, which can take focus", () => {
    const { container } = render(<RegistrationSection />);
    const section = container.querySelector("section#reyestratsiia");
    expect(section).not.toBeNull();
    // No card title: the first step's label names the region (Update 2).
    const heading = screen.getByRole("heading", { level: 2, name: uk.registration.steps.one });
    expect(section?.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(heading.getAttribute("tabindex")).toBe("-1");
  });

  it("renders a signed render time into the form, and the seven fields in order", () => {
    const { container } = render(<RegistrationSection />);
    const stamp = container.querySelector<HTMLInputElement>('input[name="formStamp"]');
    expect(stamp?.value).toMatch(/^\d{13}\.[A-Za-z0-9_-]{43}$/);
    const labels = [...container.querySelectorAll("form label")].map((label) => label.textContent);
    expect(labels).toEqual([
      uk.registration.name.label,
      uk.registration.city.label,
      uk.registration.link.label,
      uk.registration.contact.label,
      uk.registration.email.label,
      uk.registration.password.label,
      uk.registration.passwordRepeat.label,
    ]);
  });

  it("switches to sign-in inside the card, a full load into the kabinet", () => {
    render(<RegistrationSection />);
    const footer = screen.getByText(
      (_text, element) =>
        element?.tagName === "P" && (element.textContent ?? "").startsWith(uk.registration.footer.text),
    );
    const link = within(footer).getByRole("link", { name: uk.registration.footer.link });
    expect(link.getAttribute("href")).toBe("/kabinet/vkhid");
    expect(footer.closest("section")?.querySelector("form")?.contains(footer)).toBe(false);
  });

  it("offers help by email under the card", () => {
    render(<RegistrationSection />);
    const help = screen.getByText(
      (_text, element) =>
        element?.tagName === "P" &&
        (element.textContent ?? "").startsWith(uk.registration.assistance.text),
    );
    expect(
      within(help).getByRole("link", { name: uk.registration.assistance.link }).getAttribute("href"),
    ).toBe("mailto:hello@opika.org.ua");
  });
});
