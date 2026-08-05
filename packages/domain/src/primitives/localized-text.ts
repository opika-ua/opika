import { z } from "zod";
import { type Locale, LocaleSchema } from "./locale.js";

/**
 * `machine` exists because English ships as machine translation plus review.
 * The UI has to decide whether to show an "auto-translated" notice, and that
 * is a property of the text itself rather than of the request that fetched it.
 */
export const TextProvenanceSchema = z.enum(["human", "machine"]);
export type TextProvenance = z.infer<typeof TextProvenanceSchema>;

export const TranslatedTextSchema = z.object({
  text: z.string().min(1),
  provenance: TextProvenanceSchema,
});
export type TranslatedText = z.infer<typeof TranslatedTextSchema>;

/**
 * Ukrainian is required: it is the language the content is authored in, and a
 * record with no readable text is not a record worth storing. English is
 * nullable rather than optional so the absence survives a JSON round trip.
 */
export const LocalizedTextSchema = z.object({
  uk: z.string().min(1),
  en: TranslatedTextSchema.nullable(),
});
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

/** Falls back to Ukrainian rather than to an empty string. */
export const textIn = (value: LocalizedText, locale: Locale): string =>
  locale === "en" && value.en !== null ? value.en.text : value.uk;

/** True when the rendered text is machine output and should be marked as such. */
export const isMachineTranslated = (value: LocalizedText, locale: Locale): boolean =>
  locale === "en" && value.en !== null && value.en.provenance === "machine";

export { LocaleSchema };
