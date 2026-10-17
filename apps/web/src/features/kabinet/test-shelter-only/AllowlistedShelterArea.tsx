import { uk } from "@opika/i18n";

/**
 * The only place that may read `uk.kabinet.testShelterOnly` (CG-Q1, Oleksii,
 * verbatim: "Only one folder can read that namespace (source-scan test), and
 * it mounts only when the server allows the signed-in shelter to write
 * through the allowlist."). That namespace is the one place a string may
 * still be `[COPY PENDING]` without switching production sign-in off, so
 * whatever reads it must be seen by his test shelter and nobody else.
 *
 * `ShelterProfile` mounts this only when the page's access decision is an
 * allowlist write grant (`editing.grantedBy === "allowlist"`) and the viewer
 * is the shelter's own admin, never a support view; the operator never
 * reaches a shelter page outside support. `test-shelter-only.test.ts` scans
 * the source so nothing outside this folder names the namespace.
 *
 * Empty in PR 2: every K4 string is final, so there is nothing to show yet.
 * A later K PR whose copy isn't final puts its screen here, behind the
 * allowlist, and moves it out once the copy is final.
 */
export function AllowlistedShelterArea({
  // The live namespace; a test passes its own to see the area render.
  copy = uk.kabinet.testShelterOnly as Readonly<Record<string, string>>,
}: {
  copy?: Readonly<Record<string, string>>;
}) {
  const pending = Object.entries(copy);
  if (pending.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" data-testid="allowlisted-shelter-area">
      {pending.map(([key, text]) => (
        <p key={key}>{text}</p>
      ))}
    </section>
  );
}
