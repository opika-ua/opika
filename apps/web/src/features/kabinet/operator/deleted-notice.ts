/**
 * «Притулок «{name}» видалено.» on the shelters list after a deletion (owner, 2026-11-20). The
 * name travels in this tab's session storage, read once, never in the URL: a link can't make the
 * list claim a deletion. Storage may be off (a private window): then the list just says nothing.
 */
const KEY = "opika.operator.deletedShelter";

export function rememberDeletedShelter(name: string): void {
  try {
    window.sessionStorage.setItem(KEY, name);
  } catch {
    // No storage: the list stays silent.
  }
}

/** The name, once: reading it clears it, so a reload doesn't repeat the line. */
export function takeDeletedShelter(): string | null {
  try {
    const name = window.sessionStorage.getItem(KEY);
    if (name !== null) window.sessionStorage.removeItem(KEY);
    return name;
  } catch {
    return null;
  }
}
