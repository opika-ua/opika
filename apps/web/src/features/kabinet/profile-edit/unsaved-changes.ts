import { uk } from "@opika/i18n";
import { useEffect } from "react";

/**
 * Which K4 sections hold unsaved edits (answer 1: "unsavedLeave applies per
 * section"). Module state, not React context: the leave points are the
 * browser's own (closing or reloading the tab) and «Вийти», which sits in the
 * header outside the editor's tree. Page-local by nature, and only ever read
 * in the browser.
 */
const dirtySections = new Set<string>();

function onBeforeUnload(event: BeforeUnloadEvent) {
  // Browsers show their own wording for this prompt and ignore any text.
  event.preventDefault();
}

/** Keeps `section`'s entry in step with `dirty`, and the browser's leave prompt on while any is. */
export function useUnsavedChanges(section: string, dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    dirtySections.add(section);
    if (dirtySections.size === 1) window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      dirtySections.delete(section);
      if (dirtySections.size === 0) window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [section, dirty]);
}

/**
 * Whether an in-page leave («Вийти») may go ahead: yes with nothing unsaved,
 * otherwise only if the person confirms his question (`actions.unsavedLeave`).
 */
export function confirmLeave(
  // Called on `window`, never detached, so no browser refuses it as an illegal invocation.
  confirm: (message: string) => boolean = (message) => window.confirm(message),
): boolean {
  if (dirtySections.size === 0) return true;
  return confirm(uk.kabinet.profileEdit.actions.unsavedLeave);
}
