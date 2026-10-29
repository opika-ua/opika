import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { kabinetSessionCookiePresent } from "../../features/chrome/kabinet-signed-in";
import { SavedPageScreen } from "../../features/likes/SavedPageScreen";

/**
 * S8, the saved page. No mock frame exists for it
 * (`docs/designer-round-1.md` §4), so every choice below is the builder's,
 * recorded under "Decisions taken" in the PR.
 *
 * `noindex`: the page's entire content is one browser's `localStorage` -
 * there is nothing here for a crawler to find, server-rendered or not, and
 * indexing an always-empty shell would be actively misleading. The deck
 * (`/tvaryny/gortaty`) is the existing precedent for a real, linked route
 * that stays out of search for a reason specific to what it shows.
 */
export const metadata: Metadata = {
  title: uk.likes.title,
  robots: { index: false, follow: false },
};

/**
 * `force-dynamic` for the same reason every other route here that reads
 * live data sets it (`../tvaryny/gortaty/page.tsx`'s own comment): a
 * build-time prerender would bake in a snapshot rather than a live read.
 * Nothing about this page is actually time-sensitive in the way the gallery
 * is, since its real content never leaves the client - kept for consistency
 * with the rest of the app's server shells, not because this one page would
 * otherwise go stale.
 */
export const dynamic = "force-dynamic";

/**
 * A Server Component shell around `SavedPageScreen` (Client Component), for `metadata` and the
 * kabinet nav. City names come with the cards themselves (`animals.cardsByIds` carries a label per
 * city), so this page reads no city lookup at all.
 */
export default async function SavedPage() {
  const kabinetSignedIn = await kabinetSessionCookiePresent();

  return <SavedPageScreen kabinetSignedIn={kabinetSignedIn} />;
}
