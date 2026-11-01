import { KABINET_SESSION_LIMITS } from "@opika/db/repos";
import { uk } from "@opika/i18n";
import { describe, expect, it } from "vitest";
import { KABINET_SESSION } from "./auth";

/**
 * /pro's session sentence is a public claim (Oleksii's PW-1 copy, `docs/shelter-passwords-copy-uk.md`
 * §G, verbatim): «Вхід у кабінет притулку діє 30 днів від останнього відвідування і не довше 90
 * днів, після чого треба увійти знову.» His note: "Bake 30/90 into the sentence only if the code
 * has one source for them; otherwise interpolate {idleDays}/{maxDays} from the same constants the
 * session config uses, and pin the test." The one source is `KABINET_SESSION_LIMITS` (`@opika/db`),
 * which the hooks, the second line and the clean-up all read; this test ties the sentence to it,
 * so neither changes alone. The sentence is transcribed, never read from the catalogue.
 */
const SENTENCE =
  "Вхід у кабінет притулку діє 30 днів від останнього відвідування і не довше 90 днів, після чого треба увійти знову.";
const DAY = 24 * 60 * 60 * 1000;

describe("/pro's session sentence and the session limits are one fact", () => {
  it("the sentence is on /pro, word for word", () => {
    expect(uk.about.data).toContain(SENTENCE);
  });

  it("a shelter admin's session: 30 days since the last visit, 90 days at most", () => {
    expect(
      KABINET_SESSION_LIMITS.shelterAdmin,
      "the limits changed: «30 днів» and «90 днів» in about.data must be rewritten with them",
    ).toEqual({ idleMs: 30 * DAY, absoluteMs: 90 * DAY });
  });

  it("Better Auth's own expiry never cuts a session short of those limits", () => {
    expect(KABINET_SESSION.expiresInSeconds * 1000).toBeGreaterThanOrEqual(
      KABINET_SESSION_LIMITS.shelterAdmin.absoluteMs,
    );
  });

  it("30 and 90 both take «днів»", () => {
    const rules = new Intl.PluralRules("uk");
    expect(rules.select(30)).toBe("many");
    expect(rules.select(90)).toBe("many");
  });
});
