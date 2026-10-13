# H2 invite PR: shapes for review

Shapes only, proposed alongside `docs/h2-invite-phase0.md`. Every one depends on the matching
Phase 0 answer; nothing here is built.

---

## 1. One refusal for "this address already has a role" (Q7, Q8)

Replaces `ALREADY_A_MEMBER` in `packages/contracts/src/errors.ts`:

```ts
/**
 * One person holds one role (HS-Q7, RG-T10): an address that administers a
 * shelter, is an operator, or holds a live invitation to another shelter
 * can't be invited. The reason says which, so S2/S4 can say it plainly.
 */
ADDRESS_HAS_A_ROLE: {
  status: 409,
  message: "That address already has a role in the registry.",
  data: z.object({
    reason: z.enum(["shelter_admin", "operator", "invited_elsewhere"]),
  }),
},
```

Declared on `registry.admins.invite` and `registry.shelters.create` (both currently declare
`ALREADY_A_MEMBER`). The repo side:
- `kabinetInvitationRepo.invite` returns
  `{ kind: "address_has_a_role"; reason: "shelter_admin" | "operator" | "invited_elsewhere" }`
  instead of `{ kind: "already_a_member" }`;
- the operator check reads `super_admins` (active grants only), never a field on the user
  (HS-T2);
- the "invited elsewhere" check counts a pending invitation as live only while it hasn't expired.

If Q7 goes B instead: keep the code `ALREADY_A_MEMBER`, add the same `data`. If Q8 goes B, drop
`"invited_elsewhere"`.

## 2. Production sign-in availability (Q6)

`apps/web/src/kabinet/auth-route.ts`:

```ts
export type KabinetAuthAvailability =
  | {
      kind: "available";
      sender: MagicLinkSender;
      invites: InvitationSender;
      secret: string;
      baseURL: string;
    }
  | { kind: "unavailable"; reason: "missing_config" };
// "no_sender_in_production" goes: production is available exactly when the
// provider key, BETTER_AUTH_SECRET and BETTER_AUTH_URL are present.
```

`apps/web/src/api/env.ts` (Q6 A), added to `RequiredProductionEnvSchema`:

```ts
BETTER_AUTH_SECRET: z
  .string()
  .min(32, "BETTER_AUTH_SECRET must be at least 32 characters (openssl rand -hex 32)"),
BETTER_AUTH_URL: z.url({ protocol: /^https$/ }),
KABINET_EMAIL_API_KEY: z.string().min(1, "KABINET_EMAIL_API_KEY is required"),
KABINET_EMAIL_FROM: z.string().min(3, "KABINET_EMAIL_FROM is required"), // "Name <addr@domain>"
// After location:verify --prod reports 0 mismatches (RG-Q10), in its own commit:
LOCATION_HMAC_SECRET: z
  .string()
  .min(32, "LOCATION_HMAC_SECRET must be at least 32 characters (openssl rand -hex 32)"),
```

The provider-specific name (e.g. `RESEND_API_KEY`) replaces `KABINET_EMAIL_API_KEY` once Q2 picks
one. The from-name is config, never a literal (the name is not final).

## 3. The invitation email (Q3 A)

`apps/web/src/kabinet/invitation-sender.ts`, beside `magic-link-sender.ts`:

```ts
/** How an invitee hears of an invitation (Q3). Tests capture; dev prints; prod uses the provider. */
export interface InvitationSender {
  send(message: {
    email: string;
    shelterName: string;
    /** `/kabinet/vkhid?zaproshennia=<id>`, absolute, on BETTER_AUTH_URL's origin. */
    url: string;
    expiresAt: Date;
  }): Promise<InvitationSendResult>;
}

export type InvitationSendResult =
  | { kind: "sent" }
  | { kind: "failed"; reason: "provider_error" | "copy_pending" };
```

The send runs after the invitation write and never decides it: `copy_pending` is Q5's refusal to
email `[COPY PENDING]` text in production. `ShelterAdminViewSchema` gains the outcome, so S2/S4
never claim "sent" for a send that failed:

```ts
invite: z.discriminatedUnion("status", [
  z.object({
    status: z.literal("pending"),
    expiresAt: z.date(),
    lastSend: z.enum(["sent", "failed"]).nullable(), // null: never attempted (created before this PR)
  }),
  z.object({ status: z.literal("accepted") }),
]),
```

The send outcome is stored per invitation, because `ShelterAdminView` is read back later.
Where it lives, a column on `auth_invitation` (Better Auth's table) or a row in a table of our
own, is a 0012 migration question for this PR's build phase. It isn't decided here.

## 4. Forwarded auth paths (Q4)

```ts
export const FORWARDED_AUTH_PATHS = [
  "/api/auth/sign-in/magic-link",
  "/api/auth/magic-link/verify",
  "/api/auth/get-session",
  "/api/auth/sign-out",
  "/api/auth/organization/accept-invitation", // the one organization path, on purpose (HS-Q7)
] as const;
```

## 5. The pre-launch gate exemption (Q1 A)

`apps/web/src/proxy.ts`:

```ts
/**
 * Behind their own authentication and noindex: the bot shutter isn't their
 * guard, and a shelter's magic link must work without the gate cookie.
 * Exact prefixes, never a substring test.
 */
const GATE_EXEMPT_PREFIXES = ["/kabinet/", "/api/auth/", "/api/kabinet/"] as const;
// plus the bare "/kabinet" route itself
```

No new procedures, no new tables beyond the §3 storage question.
