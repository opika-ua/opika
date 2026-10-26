import { INVITATION_TTL_MS } from "@opika/db/repos";
import {
  AGE_DATE_MAX_YEARS_BACK,
  ANIMAL_DESCRIPTION_MAX_CHARACTERS,
  ANIMAL_NAME_MAX_CHARACTERS,
  COAT_COLOUR_CUSTOM_MAX_CHARACTERS,
  DEFAULT_FRESHNESS_POLICY,
  MEDICAL_NOTES_MAX_CHARACTERS,
  TEMPERAMENT_CUSTOM_MAX_CHARACTERS,
} from "@opika/domain";
import { uk } from "@opika/i18n";
import { describe, expect, it } from "vitest";
import { nameTooLongMessage } from "../features/kabinet/operator/display-name";
import { throttledMessage } from "../features/kabinet/password/password-copy";
import { MAGIC_LINK_TTL_SECONDS } from "./auth";
import { SIGN_IN_DELAY } from "./password-limits";
import { RESET_PASSWORD_TTL_SECONDS } from "./password-mail";

/**
 * Oleksii's final copy (2026-10-14) types the plural noun after a filled
 * number: «діє {minutes} хвилин» and «діє {hours} години». Ukrainian picks the
 * noun form from the number (1 хвилина, 2–4 хвилини, 5–20 хвилин; 72 години,
 * but 75 годин), so each form is right for one value only, and a TTL change
 * would ship broken grammar with every test still green. His note on row 27:
 * "pin 15 in a test or move to Intl plural rules." These pins are that test.
 * `signIn.sentBody` types the number itself («15 хвилин»), so it is pinned
 * the same way, as is R-UI's `operator.create.whatHappens.step2` («72 години»).
 */

const MINUTE_KEYS = "kabinet.email.signIn.expiry and kabinet.signIn.sentBody";
const HOUR_KEYS = "kabinet.email.invite.expiry and kabinet.operator.create.whatHappens.step2";

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
    expect(uk.kabinet.signIn.sentBody).toContain("15 хвилин");
    expect(uk.kabinet.email.invite.expiry).toContain("{hours} години.");
    expect(uk.kabinet.operator.create.whatHappens.step2).toContain("72 години");
  });

  /** Why those forms: Ukrainian's plural categories, as `Intl` reports them. */
  it("15 and 72 fall in the plural categories whose nouns the copy uses", () => {
    const rules = new Intl.PluralRules("uk");
    expect(rules.select(15)).toBe("many"); // хвилин
    expect(rules.select(72)).toBe("few"); // години
  });
});

/**
 * K3's copy (Oleksii, 2026-10-17) types a plural noun after a filled number
 * the same way: «{count} з {max} символів» and «Опис довший за {max}
 * символів.» (1,500), «Імʼя довше за {max} символів.» (60), and «понад
 * {years} років тому» (30; his note, verbatim: "pin the plural for 30").
 * Each noun form is right for its value only.
 */
describe("the caps K3's plural nouns were written for", () => {
  it("the description cap is 1,500 («символів»)", () => {
    expect(
      ANIMAL_DESCRIPTION_MAX_CHARACTERS,
      "ANIMAL_DESCRIPTION_MAX_CHARACTERS changed: «символів» in kabinet.animalForm.description.counter and validation.descriptionTooLong was written for 1500 and must be rechecked before this pin moves",
    ).toBe(1500);
  });

  it("the name cap is 60 («символів»)", () => {
    expect(
      ANIMAL_NAME_MAX_CHARACTERS,
      "ANIMAL_NAME_MAX_CHARACTERS changed: «символів» in kabinet.animalForm.validation.nameTooLong was written for 60 and must be rechecked before this pin moves",
    ).toBe(60);
  });

  it("the age-date floor is 30 years («років»)", () => {
    expect(
      AGE_DATE_MAX_YEARS_BACK,
      "AGE_DATE_MAX_YEARS_BACK changed: «років» in kabinet.animalForm.validation.dateTooOld was written for 30 and must be rechecked before this pin moves",
    ).toBe(30);
  });

  it("the copy carries the noun forms those values take", () => {
    const t = uk.kabinet.animalForm;
    expect(t.description.counter).toContain("{max} символів");
    expect(t.validation.descriptionTooLong).toContain("{max} символів.");
    expect(t.validation.nameTooLong).toContain("{max} символів.");
    expect(t.validation.dateTooOld).toContain("{years} років тому.");
  });

  it("1,500, 60 and 30 fall in the plural category «символів» and «років» take", () => {
    const rules = new Intl.PluralRules("uk");
    expect(rules.select(1500)).toBe("many");
    expect(rules.select(60)).toBe("many");
    expect(rules.select(30)).toBe("many");
  });
});

/**
 * The pet card's three texts reuse the description's counter, «{count} з
 * {max} символів», with their own caps: 40, 30 and 1,500. «символів» is
 * right for each of those, not for every cap (41 would take «символу»).
 */
describe("the caps the pet card fields' counters were written for", () => {
  it.each([
    ["TEMPERAMENT_CUSTOM_MAX_CHARACTERS", TEMPERAMENT_CUSTOM_MAX_CHARACTERS, 40],
    ["COAT_COLOUR_CUSTOM_MAX_CHARACTERS", COAT_COLOUR_CUSTOM_MAX_CHARACTERS, 30],
    ["MEDICAL_NOTES_MAX_CHARACTERS", MEDICAL_NOTES_MAX_CHARACTERS, 1500],
  ] as const)("%s is %i («символів»)", (name, cap, written) => {
    expect(
      cap,
      `${name} changed: «символів» in kabinet.animalForm.description.counter, which this field's counter reuses, was written for ${written} and must be rechecked before this pin moves`,
    ).toBe(written);
    expect(new Intl.PluralRules("uk").select(cap)).toBe("many");
  });
});

/**
 * K2's strip (Oleksii, 2026-10-18) types «днів» after `{days}`: «{cards} ви не
 * підтверджували понад {days} днів.», `{days}` filled with the freshness
 * policy's `agingMaxDays` (his note, verbatim: "{days} pinned to agingMaxDays
 * (30)"). «днів» is right for 30, not for 31 («день») or 32 («дні»). The
 * `{cards}` forms are picked by `pluralizeUk`, so they need no pin.
 */
describe("the stale cut-off K2's plural noun was written for", () => {
  it("a card goes stale after 30 days («днів»)", () => {
    expect(
      DEFAULT_FRESHNESS_POLICY.agingMaxDays,
      "agingMaxDays changed: «днів» in kabinet.animalList.stale.count was written for 30 and must be rechecked before this pin moves",
    ).toBe(30);
  });

  it("the copy carries the noun form that value takes", () => {
    expect(uk.kabinet.animalList.stale.count).toContain("понад {days} днів.");
    expect(new Intl.PluralRules("uk").select(30)).toBe("many");
  });
});

/**
 * RUI4-F2 (Oleksii, 2026-10-18), verbatim: "Error copy: «Назва довша за {max} символів.» (plural
 * pin for 100)." The sentence the operator's two name fields show, filled from the shared cap, is
 * pinned whole against his literal for 100: «символів» is right for 100, not for every number.
 */
describe("the cap RUI4-F2's plural noun was written for", () => {
  it("the shelter name's sentence reads «Назва довша за 100 символів.»", () => {
    expect(
      nameTooLongMessage(),
      "SHELTER_DISPLAY_NAME_MAX_CHARACTERS changed: «символів» in kabinet.operator.create.errors.nameTooLong was written for 100 and must be rechecked before this pin moves",
    ).toBe("Назва довша за 100 символів.");
  });

  it("100 falls in the plural category «символів» takes", () => {
    expect(new Intl.PluralRules("uk").select(100)).toBe("many");
  });
});

/**
 * PW-1 (`docs/shelter-passwords-copy-uk.md`): his wording avoids plurals by design («хв.»), and
 * his note asks to keep the `{minutes}` pins anyway: «Забагато спроб входу. Спробуйте ще раз
 * через {minutes} хв.» (§9 answer 5, "plural pin for minutes") for every wait the delay can
 * give, and the reset link's hour in `forgot.sent` and the reset email. Each rendered sentence is
 * pinned whole against his literal.
 */
describe("the password copy's {minutes} (PW-1)", () => {
  it.each([1, 2, 3, 4, 5, 8, 11, 15, 21])("the delay's sentence for %i minutes", (minutes) => {
    expect(throttledMessage(minutes)).toBe(
      `Забагато спроб входу. Спробуйте ще раз через ${minutes} хв.`,
    );
  });

  it("every wait the delay gives is one of those, and a reset link lives an hour", () => {
    expect(SIGN_IN_DELAY.delaysMinutes).toEqual([1, 2, 4, 8, 15]);
    expect(
      RESET_PASSWORD_TTL_SECONDS / 60,
      "RESET_PASSWORD_TTL_SECONDS changed: forgot.sent and email.reset.expiry say «{minutes} хв.», recheck them",
    ).toBe(60);
    expect(uk.kabinet.forgot.sent.endsWith("Воно діє {minutes} хв.")).toBe(true);
    expect(uk.kabinet.email.reset.expiry).toBe("Посилання спрацює один раз і діє {minutes} хв.");
  });
});
