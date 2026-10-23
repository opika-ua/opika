import type { ReactNode } from "react";

/**
 * Renders the `@preview` slot beside the routes under `/tvaryny`: the
 * gallery's animal overlay (designer round 1, §2, decision DR1-D5) is an
 * intercepting route in that slot, drawn over whatever `children` already
 * shows. On any route that wasn't reached by a client navigation from the
 * gallery, the slot is `@preview/default.tsx`, which renders nothing.
 */
export default function AnimalsLayout({
  children,
  preview,
}: {
  children: ReactNode;
  preview: ReactNode;
}) {
  return (
    <>
      {children}
      {preview}
    </>
  );
}
