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
  it("prints a shelter name carrying $& and $1 literally (review finding 2)", () => {
    render(<SupportBanner shelterName="Лапа $& $1" exit={async () => true} navigate={vi.fn()} />);
    expect(screen.getByRole("region").getAttribute("aria-label")).toBe(
      "Ви переглядаєте кабінет притулку «Лапа $& $1» — лише перегляд, змінити нічого не можна.",
    );
  });

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

describe("SignOutButton with unsaved K4 edits (answer 1)", () => {
  it("asks his question first, and stays when the answer is no", async () => {
    const signOut = vi.fn(async () => {});
    const confirm = vi.fn(() => false);
    render(<SignOutButton signOut={signOut} navigate={vi.fn()} confirmLeave={confirm} />);
    await userEvent.click(screen.getByRole("button", { name: uk.kabinet.profile.signOut }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe("confirmLeave", () => {
  it("asks nothing with no section dirty, and his question with one dirty", async () => {
    const { confirmLeave, useUnsavedChanges } = await import("./profile-edit/unsaved-changes");
    const ask = vi.fn(() => true);
    expect(confirmLeave(ask)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
    function Dirty() {
      useUnsavedChanges("test", true);
      return null;
    }
    const { unmount } = render(<Dirty />);
    confirmLeave(ask);
    // Transcribed from his K4 file: actions.unsavedLeave.
    expect(ask).toHaveBeenCalledWith("Зміни не збережено. Все одно вийти?");
    unmount();
    ask.mockClear();
    expect(confirmLeave(ask)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });
});
