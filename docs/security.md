# Security notes

Owner decisions on security findings. The 2026-11-03 audit fixes L1, L2, L4, the `poweredByHeader`
setting and the `/rate-limited` origin ship in the separate "security hardening" PR; Dependabot
ships in its own PR. Public-repo rule: no production endpoint ids, rehearsal ids or personal
addresses in tracked files (placeholders: `ep-PRODUCTION`, `<owner email>`, `<rehearsal-shelter-uuid>`).

## Accepted risks (owner, 2026-11-03)

- **L5, Sentry tunnel accepts forged events.** The DSN is public by design; the tunnel is
  rate-limited (20/min/IP), size-capped and scrubbed, and nothing leaks. Sentry-side filters are the control.
- **L6, a signed-in kabinet account skips the per-adopter reveal limit.** Decision from #347; the
  per-IP budget still applies and contacts are public once revealed.
- **`/api/health` returns the git SHA.** The repo is public and the SHA helps operations; low value to an attacker.
- **The gate cookie equals the gate secret.** A bot shutter, not a boundary; removed at launch (2026-11-09, PR #448), kept here as history.
- **No CODEOWNERS.** Solo developer; every merge is the owner's.
- **CSP reports can carry ad/social click IDs.** Report-only CSP violations go straight from the browser to
  Sentry on the public adopter routes only (never /kabinet). The page URL in a report keeps whatever query the
  visitor arrived with, so `utm_*`, `fbclid` or `gclid` can reach Sentry; the app's own parameters there are
  catalogue filters only. The owner adds a Sentry scrubbing rule for those names (option A, 2026-11-16).
  CSP reports also count against the Sentry project's error quota; the mitigation is Sentry's inbound
  filters plus spike protection on that project (owner action, not code; 2026-11-16).
- **The kabinet and the public pages share one root layout.** A client navigation from a public page
  would run the kabinet inside the public document, which keeps the public report-only CSP (with its
  reporting) and the public referrer policy. Stopgap (owner, 2026-11-16): every public entry into
  /kabinet is a plain `<a>` (`features/kabinet/KabinetEntryLink.tsx`, a full document load), and
  `apps/web/src/guards/ui-guards.test.ts` guard 8, a source scan, fails outside the kabinet's own
  code (and in any server action) on an href/pathname, a router push/replace/prefetch, a
  redirect/permanentRedirect or a next/form action into /kabinet, written as a literal, a template, a
  constant that resolves to one, an import alias or a namespace member, the value on the same line or
  the next; and on any import of a kabinet module but the entry link and a reasoned list of server-only
  importers. It can't see a path built at runtime (concatenation, a function's result, a prop under
  another name), a constant declared over several lines, or a re-export under another name; the
  harness spec `kabinet-entry.harness.ts` checks the real entry points. Separate root layouts replace both:
  [#510](https://github.com/opika-ua/opika/issues/510). Kabinet links to public pages stay client
  navigations: a public page running inside the kabinet document sends no CSP reports and uses
  `strict-origin`, the safe direction.

## Later

- Enforce CSP with nonces once report-only data is clean (post-launch).
