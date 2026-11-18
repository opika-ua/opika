import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { authUser } from "./auth";

/**
 * The confirmation email's two links, «Підтвердити email» and «Це не я». Only the SHA-256 of a
 * random token is stored, as for invitations; a used or expired token answers the same as none.
 */
export const registrationEmailTokens = pgTable(
  "registration_email_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    purpose: text("purpose", { enum: ["confirm_email", "not_me"] }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [
    check(
      "registration_email_tokens_purpose_check",
      sql`${t.purpose} IN ('confirm_email', 'not_me')`,
    ),
    index("registration_email_tokens_user_id_idx").on(t.userId),
  ],
);
