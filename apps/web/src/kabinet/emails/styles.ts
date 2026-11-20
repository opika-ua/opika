import type { InfoBoxKind } from "./model";
import { DARK, EMAIL_WIDTH } from "./theme";

/** Class names the head's media queries reach; inline styles carry the light look everywhere. */
export const DARK_CLASS = {
  page: "o-page",
  card: "o-card",
  text: "o-text",
  heading: "o-heading",
  secondary: "o-secondary",
  link: "o-link",
  button: "o-btn",
  rule: "o-rule",
  cardPad: "o-card-pad",
  shell: "o-shell",
  box: (kind: InfoBoxKind) => `o-box-${kind}`,
} as const;

/**
 * The head's one stylesheet. Light is inline; this adds Apple
 * Mail's dark variant (`prefers-color-scheme`; Gmail ignores it and inverts on its own) and the
 * phone layout, where the button takes the full width.
 */
export function headCss(): string {
  const kinds: InfoBoxKind[] = ["information", "success", "warning"];
  const dark = [
    `.${DARK_CLASS.page}{background-color:${DARK.page}!important}`,
    `.${DARK_CLASS.card}{background-color:${DARK.card}!important}`,
    `.${DARK_CLASS.text},.${DARK_CLASS.heading}{color:${DARK.text}!important}`,
    `.${DARK_CLASS.secondary}{color:${DARK.secondary}!important}`,
    `.${DARK_CLASS.link}{color:${DARK.link}!important}`,
    `.${DARK_CLASS.button}{background-color:${DARK.buttonFill}!important;color:${DARK.buttonText}!important}`,
    `.${DARK_CLASS.rule}{border-color:${DARK.rule}!important}`,
    ...kinds.map((kind) => `.${DARK_CLASS.box(kind)}{background-color:${DARK[kind]}!important}`),
  ].join("");
  return [
    ":root{color-scheme:light dark;supported-color-schemes:light dark}",
    `@media (prefers-color-scheme: dark){${dark}}`,
    `@media (max-width:${EMAIL_WIDTH}px){.${DARK_CLASS.button}{display:block!important}.${DARK_CLASS.cardPad}{padding:28px 20px!important}.${DARK_CLASS.shell}{padding:16px 8px!important}}`,
  ].join("\n");
}

/** Outlook for Windows: Arial instead of a face it can't load, and 96 dpi so the images keep their size. */
export const MSO_HEAD =
  "<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><style>body,table,td,p,a,h1,span{font-family:Arial,sans-serif!important}</style><![endif]-->";
