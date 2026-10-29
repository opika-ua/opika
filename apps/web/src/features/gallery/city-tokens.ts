import type { CityLabelView } from "@opika/contracts";

/** `cities.resolveTokens`' answer for one `misto` token. */
export type CityTokenResolution = {
  readonly token: string;
  readonly city: CityLabelView | null;
  readonly via: "slug" | "alias" | "id" | null;
};
