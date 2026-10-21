import { fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModalDialog } from "./ModalDialog";

/**
 * `ModalDialog` on its own, since its trap moved into `useModalFocus`
 * (designer round 1, DR1-D6), which the preview drawer shares. Its callers'
 * tests (`ReasonDialog`, `PauseControl`, the K2 list dialogs) cover what
 * goes inside; this covers the frame.
 */

function renderDialog(onClose = vi.fn()) {
  render(
    <ModalDialog
      title="Призупинити прийом?"
      body="Тварин не буде видно."
      closeLabel="Закрити"
      onClose={onClose}
    >
      <button type="button">Скасувати</button>
      <button type="button">Призупинити</button>
      {/* Last, where a trap that counted it would wrap to it and lose focus. */}
      <button type="button" disabled>
        Неактивна
      </button>
    </ModalDialog>,
  );
  return { onClose, dialog: within(screen.getByRole("dialog", { name: "Призупинити прийом?" })) };
}

afterEach(() => {
  document.body.style.overflow = "";
});

describe("ModalDialog", () => {
  it("is a modal dialog named by its title, described by its body, with focus on the title", () => {
    const { dialog } = renderDialog();
    const node = screen.getByRole("dialog", { name: "Призупинити прийом?" });
    expect(node.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("dialog", { description: "Тварин не буде видно." })).toBe(node);
    expect(document.activeElement).toBe(
      dialog.getByRole("heading", { name: "Призупинити прийом?" }),
    );
  });

  it("closes on Escape and on ✕", () => {
    const { onClose, dialog } = renderDialog();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(dialog.getByRole("button", { name: "Закрити" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("cycles Tab inside, skipping a disabled last control, and wraps Shift+Tab from the title", () => {
    const { dialog } = renderDialog();
    const close = dialog.getByRole("button", { name: "Закрити" });
    const lastEnabled = dialog.getByRole("button", { name: "Призупинити" });

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(lastEnabled);
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(close);
  });

  it("stops the page behind from scrolling while open, and restores it after", () => {
    document.body.style.overflow = "auto";
    const { unmount } = render(
      <ModalDialog title="Т" body="Б" closeLabel="Закрити" onClose={() => {}}>
        {null}
      </ModalDialog>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("has the scroll lock applied the moment the dialog node appears, even when it mounts after an await", async () => {
    let resolve: () => void = () => {};
    const loaded = new Promise<void>((r) => {
      resolve = r;
    });
    function AfterLoad() {
      const [ready, setReady] = useState(false);
      useEffect(() => {
        void loaded.then(() => setReady(true));
      }, []);
      return ready ? (
        <ModalDialog title="Т" body="Б" closeLabel="Закрити" onClose={() => {}}>
          {null}
        </ModalDialog>
      ) : null;
    }

    let overflowAtFirstSight: string | null = null;
    const observer = new MutationObserver(() => {
      if (overflowAtFirstSight === null && document.querySelector('[role="dialog"]')) {
        overflowAtFirstSight = document.body.style.overflow;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    render(<AfterLoad />);
    // Not inside `act`: `act` flushes passive effects before it returns,
    // which would hide the very window this test exists to catch.
    resolve();
    await screen.findByRole("dialog");
    observer.disconnect();

    expect(overflowAtFirstSight).toBe("hidden");
  });
});
