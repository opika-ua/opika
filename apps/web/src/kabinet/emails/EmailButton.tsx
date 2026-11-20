import { Section, Text } from "react-email";
import { escapeHtml } from "./escape";
import { DARK_CLASS } from "./styles";
import { FONT_STACK, LIGHT, TARGET, TYPE } from "./theme";

/** Outlook draws the VML pill at a fixed width: wide enough for the label, never past the column. */
const vmlWidth = (label: string): number => Math.min(520, Math.max(220, label.length * 10 + 72));

/**
 * The «bulletproof» primary button: real text on an ink pill, 48px tall. Outlook for Windows
 * cannot round or pad an `<a>`, so it gets a VML roundrect in a conditional comment and every other
 * client the anchor; React can't emit comments, so the cell is one escaped HTML string.
 */
function buttonHtml(label: string, url: string): string {
  const text = escapeHtml(label);
  const href = escapeHtml(url);
  const height = Number.parseInt(TARGET, 10);
  const padY = (height - 20) / 2;
  return [
    `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:${height}px;v-text-anchor:middle;width:${vmlWidth(label)}px;" arcsize="50%" stroke="f" fillcolor="${LIGHT.buttonFill}"><w:anchorlock/><center style="color:${LIGHT.buttonText};font-family:Arial,sans-serif;font-size:${TYPE.label.size};font-weight:bold;">${text}</center></v:roundrect><![endif]-->`,
    `<!--[if !mso]><!-- --><a href="${href}" class="${DARK_CLASS.button}" target="_blank" style="display:inline-block;box-sizing:border-box;background-color:${LIGHT.buttonFill};color:${LIGHT.buttonText};font-family:${escapeHtml(FONT_STACK)};font-size:${TYPE.label.size};font-weight:700;line-height:20px;text-align:center;text-decoration:none;padding:${padY}px 32px;border-radius:999px;mso-hide:all;">${text}</a><!--<![endif]-->`,
  ].join("");
}

export function EmailButton(props: { label: string; url: string; fallback: string }) {
  return (
    <Section style={{ margin: "8px 0 24px" }}>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
        <tbody>
          <tr>
            <td
              align="left"
              dangerouslySetInnerHTML={{ __html: buttonHtml(props.label, props.url) }}
            />
          </tr>
        </tbody>
      </table>
      {/* The raw URL as plain text, never a link whose text is a URL (IN-E8). */}
      <Text
        className={DARK_CLASS.secondary}
        style={{
          margin: "12px 0 0",
          fontSize: TYPE.caption.size,
          lineHeight: TYPE.caption.lineHeight,
          color: LIGHT.secondary,
        }}
      >
        {props.fallback} <span style={{ wordBreak: "break-all" }}>{props.url}</span>
      </Text>
    </Section>
  );
}
