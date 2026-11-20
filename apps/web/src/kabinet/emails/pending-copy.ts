import { COPY_PENDING } from "@opika/i18n";

/**
 * The kit's new strings, waiting for the owner (branded-emails plan §3; copy table in the kit PR).
 * Held here rather than in `packages/i18n`: the catalogue must hold nothing pending (Q-B, Oleksii
 * 2026-10-19), and the production sender refuses any mail carrying the marker (IN-Q5), so none of
 * these can reach a shelter. Once approved they move to `uk.emailLayout` and this file goes.
 */
export const PENDING_EMAIL_COPY = {
  fallbackLink: `${COPY_PENDING} Кнопка не працює? Скопіюйте посилання:`,
  reason: {
    registrant: `${COPY_PENDING} Лист надіслано, бо цю адресу вказали під час реєстрації притулку.`,
    shelterAdmin: `${COPY_PENDING} Лист надіслано, бо цю адресу додано до кабінету притулку.`,
    operator: `${COPY_PENDING} Службовий лист для оператора {site}.`,
  },
  switchOffPrompt: `${COPY_PENDING} Не хочете таких листів?`,
  switchOffAction: `${COPY_PENDING} Вимкнути нагадування`,
} as const;
