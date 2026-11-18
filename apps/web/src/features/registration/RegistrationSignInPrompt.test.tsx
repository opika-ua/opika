import { uk } from "@opika/i18n";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RegistrationSignInPrompt } from "./RegistrationSignInPrompt";

afterEach(() => vi.unstubAllEnvs());

describe("the sign-in page's way to registration", () => {
  it("links to the form on /prytulkam while self-registration is on", () => {
    vi.stubEnv("SELF_REGISTRATION_ENABLED", "1");
    render(<RegistrationSignInPrompt />);
    expect(
      screen.getByRole("link", { name: uk.registration.signInPrompt }).getAttribute("href"),
    ).toBe("/prytulkam#reyestratsiia");
  });

  it("is not there while it's off", () => {
    vi.stubEnv("SELF_REGISTRATION_ENABLED", "");
    const { container } = render(<RegistrationSignInPrompt />);
    expect(container.innerHTML).toBe("");
  });
});
