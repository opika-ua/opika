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
 * The profile page's area: the namespace's top-level strings, which belong
 * to no other screen. A screen with lines of its own would keep them in a
 * group, rendered on that screen, and groups are not shown here (K3's one
 * group, `testShelterOnly.animalForm`, emptied when K2 moved its line out,
 * P10). Empty: every K4, K3 and K2 string is final.
 */
export function AllowlistedShelterArea({
  // The live namespace; a test passes its own to see the area render.
  copy = uk.kabinet.testShelterOnly,
}: {
  copy?: Readonly<Record<string, unknown>>;
}) {
  const lines = Object.entries(copy).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  if (lines.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" data-testid="allowlisted-shelter-area">
      {lines.map(([key, text]) => (
        <p key={key}>{text}</p>
      ))}
    </section>
  );
}
