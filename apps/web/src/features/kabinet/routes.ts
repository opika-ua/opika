/**
 * The operator's list (R-UI S1): where `/kabinet` sends the operator (RU-T1)
 * and the root of every operator page. Its own module, free of server code,
 * so the home decision (`home.ts`) and the operator's client components read
 * one literal.
 */
export const OPERATOR_HOME = "/kabinet/prytulky";

/** S2, «Новий притулок» (R-UI 2): the shell's nav, S1's button and its empty state link here. */
export const NEW_SHELTER_PATH = `${OPERATOR_HOME}/novyi`;

/**
 * Where sign-in and every invite, magic-link and reset email link end up. It has no screen of its
 * own since kabinet UX round 2: the page settles the session and sends a shelter on to the animal
 * list (Тварини is the landing; what Головна showed moved to the top of that list).
 */
export const SHELTER_HOME = "/kabinet";

/** The public gallery, for the header's «Переглянути сайт» (opened in a new tab). */
export const PUBLIC_GALLERY_PATH = "/tvaryny";

/** Притулок (renamed from «Профіль притулку»): K4's profile editor, moved off `SHELTER_HOME`. */
export const SHELTER_PROFILE_PATH = "/kabinet/prytulok";

/** K2, the shelter's animal list (PR 5): the nav's «Тварини» and K3's back link go here. */
export const ANIMAL_LIST_PATH = "/kabinet/tvaryny";

/** K3's create page: K2's «Додати тварину» and its empty state link here. */
export const NEW_ANIMAL_PATH = `${ANIMAL_LIST_PATH}/nova`;

/** The public page of one animal (the ⋯ menu's «Переглянути на сайті», a new tab). */
export const publicAnimalPath = (animalId: string): string => `/tvaryny/${animalId}`;

/** K3's page for one animal: K2's «Редагувати». */
export const animalPath = (animalId: string): string => `${ANIMAL_LIST_PATH}/${animalId}`;

/**
 * Who K2 is for (K2 sheet P1, accepted in his K2 answers, §13): a shelter
 * whose writes the served policy opens (every shelter's own admins, since
 * PR 6), and the operator's support view of any shelter, read-only (S5).
 * Before PR 6 every other shelter kept the kabinet it had: no «Тварини» in its
 * nav and a 404 at `/kabinet/tvaryny`, since a list that pointed at buttons
 * it doesn't have (the strip's caption, the empty state) would describe a
 * product that shelter can't use. The one rule for the page, the nav and
 * K3's back link, so the three can't disagree.
 */
export const animalListShownTo = (
  viewer: "admin" | "support",
  writes: { readonly kind: "open" | "read_only" },
): boolean => viewer === "support" || writes.kind === "open";

/** K1, the sign-in page (and, with `?zaproshennia=`, the invite landing). */
export const SIGN_IN_PAGE_PATH = "/kabinet/vkhid";

/** «Забули пароль?» (PW-1, §4.2): K1's link, the reset page's invalid-link link and «Змінити пароль»'s note point here. */
export const FORGOT_PATH = `${SIGN_IN_PAGE_PATH}/zabuly`;
