import { z } from "zod";

export const LocaleSchema = z.enum(["uk", "en"]);
export type Locale = z.infer<typeof LocaleSchema>;

/** BCP 47 tags, used when calling `Intl`. */
export const INTL_LOCALE: Record<Locale, string> = {
  uk: "uk-UA",
  en: "en-GB",
};
