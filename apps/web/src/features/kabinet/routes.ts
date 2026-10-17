/**
 * The operator's list (R-UI S1): where `/kabinet` sends the operator (RU-T1)
 * and the root of every operator page. Its own module, free of server code,
 * so the home decision (`home.ts`) and the operator's client components read
 * one literal.
 */
export const OPERATOR_HOME = "/kabinet/prytulky";

/** S2, «Новий притулок» (R-UI 2): the shell's nav, S1's button and its empty state link here. */
export const NEW_SHELTER_PATH = `${OPERATOR_HOME}/novyi`;
