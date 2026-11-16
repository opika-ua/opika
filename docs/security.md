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

## Later

- Enforce CSP with nonces once report-only data is clean (post-launch).
