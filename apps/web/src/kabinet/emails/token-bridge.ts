/**
 * The email kit's bridge to the site's one token set (`app/globals.css`, `@theme`). The CSS is the
 * only source, and an email has no CSS variables, so the values the kit needs are read out of it by
 * name into `tokens.generated.json` (`pnpm --filter @opika/web email:tokens`); a test fails while the
 * generated file disagrees with the CSS, so a brand change reaches the emails in the same PR.
 */

/** The tokens the emails use, by their CSS name without the `--` prefix. */
export const EMAIL_TOKEN_NAMES = [
  "color-page",
  "color-ink",
  "color-ink-2",
  "color-line",
  "color-on-ink",
  "color-on-accent-strong",
  "color-status-published",
  "color-status-reserved",
  "color-success-bg",
  "radius-panel",
  "radius-card",
  "text-title",
  "text-title--line-height",
  "text-title--font-weight",
  "text-body",
  "text-label",
  "text-caption",
  "spacing-target",
] as const;

export type EmailTokenName = (typeof EMAIL_TOKEN_NAMES)[number];

/** Each named custom property's last declared value in `css`; a missing one throws, naming it. */
export function emailTokensFromCss(css: string): Record<EmailTokenName, string> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const values = new Map<string, string>();
  for (const match of withoutComments.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) values.set(name, value.trim());
  }
  const entries = EMAIL_TOKEN_NAMES.map((name) => {
    const value = values.get(name);
    if (value === undefined) throw new Error(`globals.css has no --${name}`);
    return [name, value] as const;
  });
  return Object.fromEntries(entries) as Record<EmailTokenName, string>;
}

/** The generated file's text, stable so the drift test can compare it as it stands on disk. */
export function emailTokensJson(tokens: Record<EmailTokenName, string>): string {
  return `${JSON.stringify(tokens, null, 2)}\n`;
}
