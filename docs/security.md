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
  catalogue filters only. Mitigated by Sentry scrubbing (owner settings, 2026-11-16: the click-ID names,
  `$http.query_string`, `user.geo.**`; IP storage off). Verified 2026-11-16 on a desktop Chrome report (event
  2abed011): no query-string table, no geography, the document URI's values gone. CSP reports also count
  against the Sentry project's error quota; mitigated by Sentry's inbound filters plus spike protection on
  that project (owner settings, not code).
- **CSP reports come only from browsers that deliver `report-to` (Chromium today), by choice.** A report's request
  goes straight from the browser to Sentry, so the app's UA reduction (`apps/web/src/observability/scrub.ts`)
  doesn't apply, and Sentry derives device model and OS from the User-Agent before data scrubbing runs:
  verified 2026-11-16, where the desktop event 2abed011 kept "Windows >=10" and a simulated iOS report via
  report-uri (event add9b2fb, the Threads iPhone UA) kept "iPhone 17 Pro" and "iOS 26.6.1" despite the
  `contexts.device.**` / `contexts.client_os.**` rules; only the raw header was redacted. WebKit sends CSP
  reports through `report-uri` with its full UA, so the policy has `report-to` and no `report-uri` (owner,
  2026-11-16): Chromium's reduced UA (browser family and major version, an OS family like "Windows >=10") is
  accepted, and every iOS browser (all WebKit), Safari and Firefox report nothing today. Two caveats, both
  unverified: Android in-app WebViews (Instagram, Threads, Facebook) are Chromium but keep a full UA, so if
  they deliver `report-to` reports, those carry the device model and Android version (check the device
  field of CSP events in Sentry); and if Firefox or WebKit ship `report-to`, they start reporting with their
  own UA with no change here.
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
  `strict-origin`, the safe direction. Since audit B1 the full document load into /kabinet is also what
  gives the kabinet its enforced nonce policy, and a public page inside the kabinet document runs under
  that policy (`kabinet-csp.harness.ts` opens the gallery and an animal page there).

## Later

- Enforce a strict `script-src` on the public pages: hash-based, so static caching survives, as a separate
  proposal (owner, 2026-11-24). /kabinet enforces a nonce-based policy since audit B1
  (`kabinetContentSecurityPolicy` in `apps/web/src/security-headers.ts`, sent by `proxy.ts`).
- Before enforcing a stricter `script-src`: if Safari/iOS coverage of CSP violations is needed, revisit our own
  collector (option B: `/api/csp-report`, dropping the User-Agent before forwarding), since today only Chromium
  reports (owner, 2026-11-16).
