import { DEFAULT_SEEN_SET_POLICY } from "@opika/domain";
import { uk } from "@opika/i18n";
import { describe, expect, it } from "vitest";

/**
 * Audit 2026-10-22 #12: the deck's end state says «Не зараз» comes back «через 30 днів». The
 * number is typed in the sentence, so this fails the day the policy moves under it
 * (`DEFAULT_SEEN_SET_POLICY.reshowAfterDays`, the same fact `/prytulkam` ¶3 describes) and the
 * plural form «днів» is the one Ukrainian wants for 30.
 */
describe("the deck's end state and the seen-set policy", () => {
  it("says the number of days the policy actually holds a «Не зараз» for", () => {
    expect(DEFAULT_SEEN_SET_POLICY.reshowAfterDays).toBe(30);
    expect(uk.exhausted.body).toContain("знову через 30 днів");
  });
});
