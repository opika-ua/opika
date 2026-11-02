import { useEffect, useState } from "react";

export type SignedInPerson = { name: string | null; email: string | null };

/**
 * Who is signed in, read from Better Auth's own session endpoint after the page loads (the header
 * and «Акаунт і пароль» show it; no page has to carry it). `null` until the answer arrives, and
 * stays `null` if there is none.
 */
export function useSignedInPerson(): SignedInPerson | null {
  const [person, setPerson] = useState<SignedInPerson | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/get-session", { credentials: "same-origin", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { user?: { name?: unknown; email?: unknown } } | null) => {
        const user = body?.user;
        if (user === undefined) return;
        setPerson({
          name: typeof user.name === "string" && user.name.trim() !== "" ? user.name : null,
          email: typeof user.email === "string" ? user.email : null,
        });
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return person;
}

/** The person's one line: the name, else the address. */
export const personLineOf = (person: SignedInPerson | null): string | null =>
  person === null ? null : (person.name ?? person.email);
