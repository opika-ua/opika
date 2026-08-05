import { z } from "zod";

export const CurrencySchema = z.enum(["UAH", "PLN", "EUR"]);
export type Currency = z.infer<typeof CurrencySchema>;

/**
 * Minor units only, never a float: 12.30 UAH is `{ amountMinor: 1230 }`.
 * Floating-point money is the defect that survives every refactor.
 *
 * Deliberately unattached to any entity. The platform stores no payment data
 * and donations are an external link with no amount, so this ships as a
 * primitive awaiting its first consumer rather than as a speculative field.
 */
export const MoneySchema = z.object({
  amountMinor: z.int(),
  currency: CurrencySchema,
});
export type Money = z.infer<typeof MoneySchema>;
