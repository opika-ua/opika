import type { AnimalSex } from "./animal";

/**
 * The grammatical gender a word describing an animal takes (follow-up Q9, K3-F1: sex-aware age
 * words on the card). A female animal takes the feminine; a male one, and one whose sex is
 * «Не записано», keep the generic masculine the card has always used: picking a gender for an
 * unknown sex would state something nobody recorded.
 */
export type GrammaticalGender = "masculine" | "feminine";

export const grammaticalGenderOf = (sex: AnimalSex): GrammaticalGender => {
  switch (sex) {
    case "female":
      return "feminine";
    case "male":
    case "unknown":
      return "masculine";
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled sex; unreachable at runtime */
    default: {
      const unreachable: never = sex;
      return unreachable;
    }
  }
};
