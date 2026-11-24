import type { OrganisationWord } from "@opika/domain";

/** A public string whose noun follows the legal form: «притулок» or «ініціатива» (owner, 2026-11-24). */
export type ByOrganisation = { readonly shelter: string; readonly initiative: string };

export function forOrganisation(texts: ByOrganisation, word: OrganisationWord): string {
  switch (word) {
    case "shelter":
      return texts.shelter;
    case "initiative":
      return texts.initiative;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled word; unreachable at runtime */
    default: {
      const unreachable: never = word;
      return unreachable;
    }
  }
}
