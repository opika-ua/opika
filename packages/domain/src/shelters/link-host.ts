// Zod-free, so public client code can reach it through `../core`.

/**
 * Why a shelter-supplied web address can't be trusted to go where it reads, judged by how it
 * reads (never fetched). One rule for donation links (`donationUrlProblemOf`) and for links in
 * shelter-written text (`isLiveLinkUrl`).
 * `userinfo`: `https://user@host` reads as `user`'s site in a hurry. `idn`: a lookalike host
 * (Cyrillic letters, any `xn--` label) cannot be told apart from the real one by eye.
 */
export type LinkHostProblem = "userinfo" | "idn";

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
  return null;
};

/** Dotted IPv4, as the parser leaves every IPv4 spelling (`0x7f.1`, `2130706433`). */
const IPV4_HOST = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/**
 * Whether a URL in shelter-written text may be a live link: https, a named host (an IP address
 * names no one), and no `LinkHostProblem`. Anything else is shown as the text it is.
 */
export const isLiveLinkUrl = (raw: string): boolean => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.hostname === "") return false;
  if (IPV4_HOST.test(url.hostname) || url.hostname.startsWith("[")) return false;
  return linkHostProblemOf(raw) === null;
};
