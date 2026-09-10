import type { ContactRevealView } from "@opika/contracts";
import type { AnimalId } from "@opika/domain";
import { safe } from "@orpc/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { revealBrowserClient } from "../../api/browser-client";

export type RevealState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "open"; reveal: ContactRevealView };

/**
 * The reveal state machine plus its dialog-specific side effects (focus
 * management, Esc, page-scroll lock, Tab trap) — extracted from
 * `RevealFlow.tsx` (2026-09-10) so the deck's gesture-parity reveal can
 * share it rather than duplicate it. No behaviour change for the detail
 * page: `RevealFlow.test.tsx`'s existing assertions (call order, focus,
 * Escape, Tab-wrap) are unchanged by this extraction.
 *
 * `triggerRef` is owned by the caller, not this hook: the detail page's
 * trigger is a real `<button>` that gets focus back on close; the deck's
 * "trigger" is a drag gesture or the action-row button, both of which the
 * caller is better placed to know how to refocus than a shared hook would
 * be. `close()` calls `triggerRef.current?.focus()` unconditionally — a
 * `null` ref (nothing to refocus) is a no-op, not an error.
 */
export function useRevealFlow(triggerRef: React.RefObject<HTMLElement | null>) {
  const [state, setState] = useState<RevealState>({ kind: "idle" });
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const isOpen = state.kind === "open" || state.kind === "error";

  const close = useCallback(() => {
    setState({ kind: "idle" });
    triggerRef.current?.focus();
  }, [triggerRef]);

  const reveal = useCallback(async (animalId: AnimalId) => {
    setState({ kind: "loading" });
    const [bootstrapError] = await safe(revealBrowserClient.session.bootstrap({}));
    if (bootstrapError) {
      setState({ kind: "error" });
      return;
    }
    const [revealError, result] = await safe(revealBrowserClient.animals.reveal({ animalId }));
    if (revealError || !result) {
      setState({ kind: "error" });
      return;
    }
    setState({ kind: "open", reveal: result });
  }, []);

  // Focus the dialog's own heading on open — the entrance the mock's own
  // caption describes ("Фокус переходить на заголовок"). Runs once per
  // open, not per keystroke inside the dialog: `isOpen` alone as the
  // dependency, matching E5's own "frozen at mount" reasoning for exactly
  // this class of effect.
  useEffect(() => {
    if (isOpen) headingRef.current?.focus();
  }, [isOpen]);

  // Esc closes; page behind the dialog does not scroll while it's open;
  // Tab is trapped inside the dialog's own focusable elements.
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      // Indexed against the focusable list rather than compared to first/last
      // directly, because the element focus actually starts on is neither:
      // the dialog's heading carries tabindex="-1" and so is not in this
      // list at all. Comparing only to `first` left Shift+Tab from the
      // heading falling through to the trigger button behind the overlay —
      // the trap held forwards and leaked backwards. `-1` also covers the
      // error state, where focus can still be outside the dialog.
      const active = document.activeElement;
      const index =
        active instanceof HTMLElement ? Array.prototype.indexOf.call(focusable, active) : -1;
      if (event.shiftKey ? index <= 0 : index === -1 || index === focusable.length - 1) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, close]);

  return { state, isOpen, reveal, close, headingRef, dialogRef };
}
