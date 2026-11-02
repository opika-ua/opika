/** A Sentry DSN reduced to the two parts the tunnel compares and builds its target from. */
export type ParsedDsn = { host: string; projectId: string };

const HOST = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i;
const PROJECT_ID = /^[0-9]+$/;

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
  return { host: url.hostname.toLowerCase(), projectId };
}

/** Where the tunnel forwards: built from our own DSN only, never from the request. */
export const envelopeUrlOf = (dsn: ParsedDsn): string =>
  `https://${dsn.host}/api/${dsn.projectId}/envelope/`;

/** The browser's DSN, inlined at build time; undefined means every part of the SDK stays off. */
export const CLIENT_DSN: string | undefined =
  process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || undefined;
