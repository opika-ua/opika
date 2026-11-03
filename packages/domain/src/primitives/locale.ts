import { z } from "zod";
import { INTL_LOCALE, LOCALES, type Locale } from "../core";

export { INTL_LOCALE, type Locale };

export const LocaleSchema = z.enum(LOCALES);
