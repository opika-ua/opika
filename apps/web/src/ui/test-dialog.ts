import { onTestFinished, vi } from "vitest";

/**
 * Esc as a browser sends it (keydown, `cancel`, close) a microtask after the next `showModal()`:
 * after the opening commit, before its passive effects, a moment a test otherwise hits by luck.
 * Returns a getter for `waitFor`: the dialog it pressed Esc in; throws until then.
 */
export function pressEscapeWhenShown(): () => HTMLDialogElement {
  let pressedIn: HTMLDialogElement | null = null;
  const showModal = HTMLDialogElement.prototype.showModal;
  const spy = vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    showModal.call(this);
    spy.mockRestore();
    queueMicrotask(() => {
      const key = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
      const unhandled = (document.activeElement ?? this).dispatchEvent(key);
      if (unhandled && this.dispatchEvent(new Event("cancel", { cancelable: true }))) this.close();
      pressedIn = this;
    });
  });
  onTestFinished(() => spy.mockRestore());
  return () => {
    if (pressedIn === null) throw new Error("no modal dialog has been shown yet");
    return pressedIn;
  };
}
