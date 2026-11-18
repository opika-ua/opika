/**
 * A `Set-Cookie` value from Better Auth's response, as `cookies().set` takes it: the server action
 * can't forward raw headers, so the session cookie is re-set from its parts.
 */
export type ParsedCookie = {
  name: string;
  value: string;
  options: {
    path?: string;
    domain?: string;
    maxAge?: number;
    expires?: Date;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none";
  };
};

const decode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export function parseSetCookie(header: string): ParsedCookie | null {
  const [pair = "", ...attributes] = header.split(";");
  const eq = pair.indexOf("=");
  if (eq <= 0) return null;
  const name = pair.slice(0, eq).trim();
  // `cookies().set` encodes again, so the value goes in as Better Auth meant it.
  const value = decode(pair.slice(eq + 1).trim());
  const options: ParsedCookie["options"] = {};
  for (const attribute of attributes) {
    const at = attribute.indexOf("=");
    const key = (at === -1 ? attribute : attribute.slice(0, at)).trim().toLowerCase();
    const raw = at === -1 ? "" : attribute.slice(at + 1).trim();
    if (key === "path") options.path = raw;
    else if (key === "domain") options.domain = raw;
    else if (key === "max-age" && /^-?\d+$/.test(raw)) options.maxAge = Number(raw);
    else if (key === "expires" && !Number.isNaN(Date.parse(raw))) options.expires = new Date(raw);
    else if (key === "httponly") options.httpOnly = true;
    else if (key === "secure") options.secure = true;
    else if (key === "samesite") {
      const same = raw.toLowerCase();
      if (same === "lax" || same === "strict" || same === "none") options.sameSite = same;
    }
  }
  return { name, value, options };
}
