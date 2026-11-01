/**
 * Who the page is rendered for, as far as the UI can tell from the kabinet cookie's presence
 * (`kabinet-signed-in.ts`). A hint for chrome only, never an access decision: server handlers
 * keep their own checks. Derived here once so no component carries a bare boolean.
 */
export type Audience = "visitor" | "shelter";

export const audienceOf = (kabinetSignedIn: boolean): Audience =>
  kabinetSignedIn ? "shelter" : "visitor";
