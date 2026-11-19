import { notFound } from "next/navigation";

/**
 * Every address no route owns lands here, so its 404 is this segment's `not-found.tsx` with the
 * full site header. The root `not-found.tsx` stays minimal: Next serialises it into every page.
 */
export default function UnknownAddress(): never {
  notFound();
}
