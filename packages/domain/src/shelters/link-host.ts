// Zod-free, so public client code can reach it through `../core`.

/**
 * Why a shelter-supplied web address can't be trusted to go where it reads, judged by how it
 * reads (never fetched). One rule for donation links (`donationUrlProblemOf`) and for links in
 * shelter-written text (`isLiveLinkUrl`).
 * `userinfo`: `https://user@host` reads as `user`'s site in a hurry. `idn`: a lookalike host
 * (Cyrillic letters, any `xn--` label) cannot be told apart from the real one by eye.
 * `ip_host` and `port` (`LinkAddressProblem`): an address that names no one.
 */
export type LinkHostProblem = "userinfo" | "idn" | LinkAddressProblem;

/**
 * `ip_host`: an IP literal, IPv4 in any spelling or IPv6 in brackets. `port`: any explicit port,
 * the scheme's default (`:443`) and an empty one (`host:`) included.
 */
export type LinkAddressProblem = "ip_host" | "port";

/** Dotted IPv4, as the parser leaves every IPv4 spelling (`0x7f.1`, `2130706433`). */
const IPV4_HOST = /^\d{1,3}(?:\.\d{1,3}){3}$/;

const addressProblemOfParsed = (url: URL, raw: string): LinkAddressProblem | null => {
  if (IPV4_HOST.test(url.hostname) || url.hostname.startsWith("[")) return "ip_host";
  // The parser drops a default port, so the raw host-and-port is read too: the text after
  // `scheme://` and any userinfo, up to the path (`\` ends it as `/` does for https).
  const hostAndPort =
    raw
      .trim()
      .replace(/^[^:]*:[/\\]*/, "")
      .split(/[/\\?#]/, 1)[0]
      ?.split("@")
      .pop() ?? "";
  if (url.port !== "" || hostAndPort.includes(":")) return "port";
  return null;
};

/** Only the address half of `linkHostProblemOf`: what `donation-links:audit-hosts` counts. */
export const linkAddressProblemOf = (raw: string): LinkAddressProblem | null => {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  return addressProblemOfParsed(url, raw);
};

export const linkHostProblemOf = (raw: string): LinkHostProblem | null => {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  // The parser turns a Unicode host into its `xn--` form, so the parsed host catches both IDN
  // cases; the raw authority is checked too, because the parser also folds some lookalikes into
  // plain ASCII, and for a bare `@`, which it drops from the parsed result.
  const authority =
    raw
      .trim()
      .replace(/^[^:]*:\/*/, "")
      .split(/[/?#]/, 1)[0] ?? "";
  if (url.username !== "" || url.password !== "" || authority.includes("@")) return "userinfo";
  if ([...authority].some((char) => char.charCodeAt(0) > 0x7f)) return "idn";
  if (url.hostname.split(".").some((label) => label.toLowerCase().startsWith("xn--"))) return "idn";
  return addressProblemOfParsed(url, raw);
};

/**
 * Whether a URL in shelter-written text may be a live link: https, a named host (an IP address
 * names no one), and no `LinkHostProblem` but `port`, which shelter text keeps (owner, 2026-11-24:
 * the port rule is for donation links only).
 */
export const isLiveLinkUrl = (raw: string): boolean => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.hostname === "") return false;
  const problem = linkHostProblemOf(raw);
  return problem === null || problem === "port";
};
