import { oc } from "@orpc/contract";

/**
 * Who may call a kabinet procedure, declared on the procedure itself
 * (H2 S3 addendum §1). The handlers slice's middleware applies it; the
 * matrix test there asserts it by hand, never by reading this back.
 *
 * - `shelter` - the shelter's own cabinet; `shelterId` comes from the actor.
 *   Reads: shelter_admin (own) and support_view (its target). Writes:
 *   shelter_admin only, its own shelter (open since PR 6 of the K milestone).
 * - `registry` - the operator's; super_admin only, `shelterId` explicit.
 * - `support_exit` - the one write a support_view may make.
 * - `invitation_link` - the invitation's «Створіть пароль» (PW-2): no session, since the link's
 *   token is the credential. Signed-out callers only (and a signed-in user with no role), the
 *   same visitors the link's page shows the form to.
 */
export type KabinetAccess =
  | { surface: "shelter"; mode: "read" | "write" }
  | { surface: "registry" }
  | { surface: "support_exit" }
  | { surface: "invitation_link" };

export type KabinetMeta = { access: KabinetAccess | null };

/**
 * Every kabinet procedure starts from this builder. `access: null` is the
 * default on purpose: a contract test fails on any procedure still carrying
 * it, so a procedure can't ship without a declared policy (deny-by-default,
 * the same idea as `pick` over `omit`).
 */
export const kabinet = oc.$meta<KabinetMeta>({ access: null });

export const shelterRead = {
  access: { surface: "shelter", mode: "read" },
} as const satisfies KabinetMeta;
export const shelterWrite = {
  access: { surface: "shelter", mode: "write" },
} as const satisfies KabinetMeta;
export const registry = { access: { surface: "registry" } } as const satisfies KabinetMeta;
export const supportExit = { access: { surface: "support_exit" } } as const satisfies KabinetMeta;
export const invitationLink = {
  access: { surface: "invitation_link" },
} as const satisfies KabinetMeta;
