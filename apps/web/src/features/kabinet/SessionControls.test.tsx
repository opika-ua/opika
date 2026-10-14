import { uk } from "@opika/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SIGNED_OUT_DESTINATION, SignOutButton } from "./SignOutButton";
import { AFTER_SUPPORT_DESTINATION, SupportBanner } from "./SupportBanner";

/** The two session controls on `/kabinet`: sign-out (admin) and leaving support mode (S5). */

describe("SignOutButton", () => {
  it("signs out, then goes to the sign-in page", async () => {
    const signOut = vi.fn(async () => {});
    const navigate = vi.fn();
    render(<SignOutButton signOut={signOut} navigate={navigate} />);
    await userEvent.click(screen.getByRole("button", { name: uk.kabinet.profile.signOut }));
    expect(signOut).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(SIGNED_OUT_DESTINATION);
  });

  it("stays put and says so when sign-out fails, never landing on sign-in with the session live", async () => {
    const navigate = vi.fn();
    render(
      <SignOutButton
        signOut={async () => {
          throw new Error("offline");
        }}
        navigate={navigate}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: uk.kabinet.profile.signOut }));
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(uk.kabinet.profile.signOutFailed);
  });
});

describe("SupportBanner", () => {
  const exitButton = () => screen.getByRole("button", { name: uk.kabinet.support.exit });

  it("leaves support mode, then goes to the front door", async () => {
    const navigate = vi.fn();
    render(<SupportBanner shelterName="Домівка" exit={async () => true} navigate={navigate} />);
    await userEvent.click(exitButton());
    expect(navigate).toHaveBeenCalledWith(AFTER_SUPPORT_DESTINATION);
  });

  it("stays put and says so when leaving fails, never pretending it left", async () => {
    const navigate = vi.fn();
    render(<SupportBanner shelterName="Домівка" exit={async () => false} navigate={navigate} />);
    await userEvent.click(exitButton());
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(uk.kabinet.support.exitFailed);
  });

  /**
   * EM-Q2 (Oleksii, verbatim: "the banner addresses the operator; no name
   * hard-coded"): the title names the shelter being viewed, filled in, and
   * neither the placeholder nor an operator's name is left in it.
   */
  it("names the shelter in its title, filled, with no operator name typed in", () => {
    render(<SupportBanner shelterName="Домівка" exit={async () => true} navigate={vi.fn()} />);
    const banner = screen.getByRole("region");
    const title = banner.getAttribute("aria-label") ?? "";
    expect(title).toContain("«Домівка»");
    expect(title).not.toContain("{shelter}");
    expect(banner.textContent).toContain(title);
    expect(uk.kabinet.support.title).not.toContain("Олексій");
    // Oleksii's final title (2026-10-14, row 69), transcribed, filled.
    expect(title).toBe(
      "Ви переглядаєте кабінет притулку «Домівка» — лише перегляд, змінити нічого не можна.",
    );
  });

  /** Row 70 (2026-10-14): no {shelter} on purpose; nothing of a placeholder may be left in the line. */
  it("renders the second line as his exact text, no placeholder left behind", () => {
    render(<SupportBanner shelterName="Домівка" exit={async () => true} navigate={vi.fn()} />);
    const banner = screen.getByRole("region");
    expect(screen.getByText("Так кабінет бачить адміністратор притулку.")).toBeDefined();
    expect(banner.textContent).not.toMatch(/[{}]/);
  });

  it("treats a thrown request as a failure too", async () => {
    const navigate = vi.fn();
    render(
      <SupportBanner
        shelterName="Домівка"
        exit={async () => {
          throw new Error("offline");
        }}
        navigate={navigate}
      />,
    );
    await userEvent.click(exitButton());
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeDefined();
  });
});
