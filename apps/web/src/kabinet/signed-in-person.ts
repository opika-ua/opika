/** The only part of the session that reaches a page: strings, never ids, tokens or timestamps. */
export type SignedInPerson = { name: string | null; email: string | null };

/** Picks `name` and `email` and nothing else, so an extra session field cannot ride along. */
export function personOf(user: { name?: unknown; email?: unknown }): SignedInPerson {
  return {
    name: typeof user.name === "string" && user.name.trim() !== "" ? user.name : null,
    email: typeof user.email === "string" && user.email !== "" ? user.email : null,
  };
}

/** The person's one line: the name, else the address; none when both are missing. */
export const personLineOf = (person: SignedInPerson | null): string | null =>
  person === null ? null : (person.name ?? person.email);
