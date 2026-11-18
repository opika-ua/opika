import { uk } from "@opika/i18n";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RegistrationSection } from "./RegistrationSection";

describe("the registration section on /prytulkam", () => {
  it("is the #reyestratsiia region, named by its heading, which can take focus", () => {
    const { container } = render(<RegistrationSection />);
    const section = container.querySelector("section#reyestratsiia");
    expect(section).not.toBeNull();
    const heading = screen.getByRole("heading", { level: 2, name: uk.registration.title });
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

  it("offers help by Telegram and email under the form", () => {
    render(<RegistrationSection />);
    const help = screen.getByText(
      (_text, element) =>
        element?.tagName === "P" &&
        (element.textContent ?? "").startsWith("Хочете, щоб я допоміг?"),
    );
    expect(within(help).getByRole("link", { name: "@oleshaz" }).getAttribute("href")).toBe(
      "https://t.me/oleshaz",
    );
    expect(
      within(help).getByRole("link", { name: "hello@opika.org.ua" }).getAttribute("href"),
    ).toBe("mailto:hello@opika.org.ua");
  });
});
