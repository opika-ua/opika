import { notFound } from "next/navigation";
import type { KabinetAuth } from "../../kabinet/auth";
import { type KabinetAuthAvailability, kabinetAuthAvailability } from "../../kabinet/auth-route";
import { kabinetAuth } from "../../kabinet/runtime";

/**
 * The auth instance for a `/kabinet` page, or that page's own 404. The
 * segment's layout answers 404 too, but the App Router renders a layout and
 * its page concurrently, so the layout cannot stop the page from running:
 * without this, every production hit would call `kabinetAuth()`, which
 * throws while sign-in is unavailable, and log a server error behind the
 * 404 (review of #93, 2146c34 note 1).
 */
export function kabinetAuthOrNotFound(): KabinetAuth {
  kabinetAvailabilityOrNotFound();
  return kabinetAuth();
}

/** This environment's sign-in configuration (sender, invitation sender, base URL), or the page's own 404. */
export function kabinetAvailabilityOrNotFound(): Extract<
  KabinetAuthAvailability,
  { kind: "available" }
> {
  const availability = kabinetAuthAvailability(process.env);
  if (availability.kind === "unavailable") notFound();
  return availability;
}

/**
 * An operator page's prerequisites (`/kabinet/prytulky/**`, R-UI), or its
 * own 404, checked before auth or the database is touched: sign-in available,
 * as for every kabinet page, and `LOCATION_HMAC_SECRET` set. Without the key
 * the registry API answers 503 to every call (RG-Q10), so its pages answer
 * 404 rather than half-work (RU-T5), read with the route's own test (set and
 * not blank, `app/api/kabinet/[...rpc]/route.ts`).
 */
export function operatorPagesOrNotFound(): {
  auth: KabinetAuth;
  availability: Extract<KabinetAuthAvailability, { kind: "available" }>;
} {
  const availability = kabinetAvailabilityOrNotFound();
  if (!process.env.LOCATION_HMAC_SECRET) notFound();
  return { auth: kabinetAuth(), availability };
}
