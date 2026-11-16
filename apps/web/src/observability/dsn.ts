/** A Sentry DSN reduced to the parts the tunnel and the CSP report endpoint are built from. */
export type ParsedDsn = { host: string; projectId: string; publicKey: string };

const HOST = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i;
const PROJECT_ID = /^[0-9]+$/;
// Sentry's keys are hex; anything else could break out of a header value or a CSP directive.
const PUBLIC_KEY = /^[a-z0-9]{1,64}$/i;

/** `https://<key>@<host>/<projectId>`; anything else (http, a port, a path prefix) is refused. */
export function parseDsn(dsn: string | undefined): ParsedDsn | null {
  if (dsn === undefined || dsn.trim() === "") return null;
  let url: URL;
  try {
    url = new URL(dsn.trim());
  } catch {
    return null;
  }
  const projectId = url.pathname.replace(/^\//, "");
  if (url.protocol !== "https:" || url.port !== "" || url.username === "") return null;
  if (!(HOST.test(url.hostname) && PROJECT_ID.test(projectId))) return null;
  return { host: url.hostname.toLowerCase(), projectId, publicKey: url.username };
}

/** Where the tunnel forwards: built from our own DSN only, never from the request. */
export const envelopeUrlOf = (dsn: ParsedDsn): string =>
  `https://${dsn.host}/api/${dsn.projectId}/envelope/`;

/** Sentry's security endpoint for our own project, where browsers send CSP reports; null without a usable DSN. */
export function securityReportUrlOf(dsn: string | undefined): string | null {
  const parsed = parseDsn(dsn);
  if (parsed === null || !PUBLIC_KEY.test(parsed.publicKey)) return null;
  return `https://${parsed.host}/api/${parsed.projectId}/security/?sentry_key=${parsed.publicKey}`;
}

/** The browser's DSN, inlined at build time; undefined means every part of the SDK stays off. */
export const CLIENT_DSN: string | undefined =
  process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || undefined;
