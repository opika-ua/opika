import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MobileNavMenu } from "./MobileNavMenu";

/**
 * Same reasoning as `FilterSheet.test.tsx`'s own top comment: content inside
 * a closed `<dialog>` is correctly excluded from the accessibility tree by
 * default - real accessibility behaviour `getByRole` respects, not a test
 * artefact - so queries against the drawer's own content need `{ hidden:
 * true }` unless the dialog has actually been opened first.
 */
function renderMenu() {
  return render(
    <MobileNavMenu>
      <a href="/prytulkam">Для притулків</a>
      <a href="/pro">Про проєкт</a>
    </MobileNavMenu>,
  );
}

describe("MobileNavMenu", () => {
  it("the toggle has an accessible name and points at the dialog it opens", () => {
    renderMenu();
    const trigger = screen.getByRole("link", { name: "Меню" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.getAttribute("aria-controls")).toBe("site-nav-menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("is closed on mount - its content exists but isn't in the accessibility tree", () => {
    renderMenu();
    const dialog = screen.getByTestId("nav-menu-sheet") as HTMLDialogElement;
    expect(dialog.open).toBe(false);
    expect(screen.queryByRole("link", { name: "Для притулків" })).toBeNull();
    expect(screen.getByRole("link", { name: "Для притулків", hidden: true })).toBeTruthy();
  });

  it("clicking the toggle opens the dialog, locks body scroll and flips aria-expanded", () => {
    renderMenu();
    const dialog = screen.getByTestId("nav-menu-sheet") as HTMLDialogElement;

    fireEvent.click(screen.getByRole("link", { name: "Меню" }));

    expect(dialog.open).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByRole("link", { name: "Меню" }).getAttribute("aria-expanded")).toBe("true");
    // The real nav content is reachable once open - the whole point of the drawer.
    expect(screen.getByRole("link", { name: "Для притулків" }).getAttribute("href")).toBe(
      "/prytulkam",
    );
    expect(screen.getByRole("link", { name: "Про проєкт" }).getAttribute("href")).toBe("/pro");
  });

  it("the ✕ closes an open dialog, releases the scroll lock, and returns focus to the toggle", () => {
    renderMenu();
    const dialog = screen.getByTestId("nav-menu-sheet") as HTMLDialogElement;
    dialog.showModal();

    const prevented = fireEvent.click(screen.getByRole("link", { name: "Закрити" }));

    expect(dialog.open).toBe(false);
    expect(document.body.style.overflow).toBe("");
    expect(prevented, "an open dialog closes in place, without navigating the fragment").toBe(
      false,
    );
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Меню" }));
  });

  it("the ✕ falls through to its own href when the dialog was revealed by :target, not showModal()", () => {
    // Same gap `FilterSheet.test.tsx` already covers for its own sheet:
    // `dialog.close()` is a no-op on a dialog with no `open` attribute - the
    // state a pre-hydration click, or a shared URL already carrying
    // #site-nav-menu, leaves the drawer in. Swallowing the click there would
    // leave it with no way to close at all.
    renderMenu();
    const dialog = screen.getByTestId("nav-menu-sheet") as HTMLDialogElement;
    expect(dialog.open).toBe(false);

    const notPrevented = fireEvent.click(
      screen.getByRole("link", { name: "Закрити", hidden: true }),
    );
    expect(notPrevented, "the anchor's own href='#' must still run").toBe(true);
  });
});
