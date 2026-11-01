import { LIKES_STORAGE_KEY } from "../likes/likes-store";

/**
 * Inline `<head>` script: marks `<html data-has-saved>` before first paint when this browser has
 * saved animals, so the header's saved slot is laid out in the server HTML and nothing jumps once
 * the island hydrates. No imports at runtime; any failure (blocked storage, bad JSON) means "none".
 */
export const SAVED_PREPAINT_SCRIPT = `try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(LIKES_STORAGE_KEY)})||"null");if(s&&s.items&&s.items.length)document.documentElement.setAttribute("data-has-saved","")}catch(e){}`;
