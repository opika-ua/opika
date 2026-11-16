import { modifyRouteRegex } from "next/dist/lib/redirect-status";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { compileNonPath } from "next/dist/shared/lib/router/utils/prepare-destination";

export type HeaderRule = { source: string; headers: { key: string; value: string }[] };

/**
 * What `next start` sends for a URL from next.config's `headers()`, matched the way its router builds
 * header routes (`filesystem.js`, whose regex is also the routes manifest's): every rule matching the
 * path alone, in order, the last value for a key winning. Keys lower-cased.
 */
export function sentOn(rules: readonly HeaderRule[], url: string): Map<string, string> {
  const { pathname } = new URL(url, "https://opika.example");
  const sent = new Map<string, string>();
  for (const rule of rules) {
    const params = getPathMatch(rule.source, {
      strict: true,
      removeUnnamedParams: true,
      regexModifier: (regex) => modifyRouteRegex(regex, undefined),
    })(pathname);
    if (params === false) continue;
    const compiled = (text: string) =>
      Object.keys(params).length > 0 ? compileNonPath(text, params) : text;
    for (const { key, value } of rule.headers) {
      sent.set(compiled(key).toLowerCase(), compiled(value));
    }
  }
  return sent;
}
