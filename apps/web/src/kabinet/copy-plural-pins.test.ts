import { INVITATION_TTL_MS } from "@opika/db/repos";
import { uk } from "@opika/i18n";
import { describe, expect, it } from "vitest";
import { MAGIC_LINK_TTL_SECONDS } from "./auth";

/**
 * Oleksii's final copy (2026-10-14) types the plural noun after a filled
 * number: «діє {minutes} хвилин» and «діє {hours} години». Ukrainian picks the
 * noun form from the number (1 хвилина, 2–4 хвилини, 5–20 хвилин; 72 години,
 * but 75 годин), so each form is right for one value only, and a TTL change
 * would ship broken grammar with every test still green. His note on row 27:
 * "pin 15 in a test or move to Intl plural rules." These pins are that test.
 * `signIn.sentBody` types the number itself («15 хвилин»), so it is pinned
 * the same way.
 */

const MINUTE_KEYS =
  "kabinet.email.signIn.expiry, kabinet.inviteLanding.sent and kabinet.signIn.sentBody";
const HOUR_KEYS = "kabinet.email.invite.expiry";

describe("the TTLs the copy's plural nouns were written for", () => {
  it("the magic link lives 15 minutes («хвилин»)", () => {
    expect(
      MAGIC_LINK_TTL_SECONDS / 60,
      `MAGIC_LINK_TTL_SECONDS changed: the Ukrainian noun form «хвилин» in ${MINUTE_KEYS} was written for 15 and must be rechecked (and «15» retyped in signIn.sentBody) before this pin moves`,
    ).toBe(15);
  });

  it("an invitation lives 72 hours («години»)", () => {
    expect(
      INVITATION_TTL_MS / 3_600_000,
      `INVITATION_TTL_MS changed: the Ukrainian noun form «години» in ${HOUR_KEYS} was written for 72 and must be rechecked before this pin moves`,
    ).toBe(72);
  });

  /** The forms in the copy, from his answer sheet: what the pins above protect. */
  it("the copy carries the noun forms those values take", () => {
    expect(uk.kabinet.email.signIn.expiry).toContain("{minutes} хвилин.");
    expect(uk.kabinet.inviteLanding.sent).toContain("{minutes} хвилин.");
    expect(uk.kabinet.signIn.sentBody).toContain("15 хвилин");
    expect(uk.kabinet.email.invite.expiry).toContain("{hours} години.");
  });

  /** Why those forms: Ukrainian's plural categories, as `Intl` reports them. */
  it("15 and 72 fall in the plural categories whose nouns the copy uses", () => {
    const rules = new Intl.PluralRules("uk");
    expect(rules.select(15)).toBe("many"); // хвилин
    expect(rules.select(72)).toBe("few"); // години
  });
});
