import { render } from "@react-email/render";
import { Hr, Link, Text } from "react-email";
import { type EmailAssetBase, LIVE_ASSET_BASE } from "./assets";
import { EmailButton } from "./EmailButton";
import { EmailInfoBox } from "./EmailInfoBox";
import { type EmailFooter, EmailLayout, MSO_HEAD_SLOT } from "./EmailLayout";
import { Lines } from "./Lines";
import type { EmailBlock, EmailChromeCopy, EmailModel } from "./model";
import { DARK_CLASS, MSO_HEAD } from "./styles";
import { LIGHT, TYPE } from "./theme";

export type RenderedEmail = { subject: string; html: string; text: string };

const paragraph = {
  margin: "0 0 16px",
  fontSize: TYPE.body.size,
  lineHeight: TYPE.body.lineHeight,
  color: LIGHT.text,
} as const;

function Block(props: { block: EmailBlock; copy: EmailChromeCopy }) {
  const { block } = props;
  switch (block.kind) {
    case "paragraph":
      return (
        <Text className={DARK_CLASS.text} style={paragraph}>
          <Lines text={block.text} />
        </Text>
      );
    case "button":
      return <EmailButton label={block.label} url={block.url} fallback={props.copy.fallbackLink} />;
    case "box":
      return <EmailInfoBox kind={block.tone} text={block.text} />;
    case "divider":
      return (
        <Hr
          className={DARK_CLASS.rule}
          style={{ margin: "8px 0 20px", border: "none", borderTop: `1px solid ${LIGHT.rule}` }}
        />
      );
    case "secondaryLink":
      return (
        <Text style={paragraph}>
          <Link
            href={block.url}
            className={DARK_CLASS.link}
            style={{ color: LIGHT.ink, textDecoration: "underline" }}
          >
            {block.label}
          </Link>
        </Text>
      );
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled block; unreachable at runtime */
    default: {
      const unreachable: never = block;
      return unreachable;
    }
  }
}

const footerOf = (model: EmailModel, copy: EmailChromeCopy): EmailFooter => ({
  ...(model.recipient === "registrant" || model.recipient === "shelterAdmin"
    ? { reason: copy.reason[model.recipient] }
    : {}),
  independence: copy.independence,
  contact: copy.contact,
});

/**
 * The plain-text part, from the same model: the button's raw URL on its own line under its label,
 * a secondary link's after its label as before (`emailBody`). The text part has no anchor to
 * disagree with its URL (IN-E8).
 */
export function plainTextOf(model: EmailModel, copy: EmailChromeCopy): string {
  const blocks = model.blocks.flatMap((block): string[] => {
    switch (block.kind) {
      case "paragraph":
      case "box":
        return [block.text];
      case "button":
        return [`${block.label}:\n${block.url}`];
      case "secondaryLink":
        return [`${block.label}: ${block.url}`];
      case "divider":
        return [];
      /* v8 ignore next 4 -- exists so the compiler rejects an unhandled block; unreachable at runtime */
      default: {
        const unreachable: never = block;
        return unreachable;
      }
    }
  });
  const footer = footerOf(model, copy);
  const footerLines = [
    ...(footer.reason ? [footer.reason] : []),
    footer.independence,
    footer.contact,
  ];
  return [model.heading, ...blocks, `--\n${footerLines.join("\n")}`].join("\n\n");
}

/** One email, rendered: the HTML part through React Email and the text part from the model. */
export async function renderEmail(
  model: EmailModel,
  copy: EmailChromeCopy,
  assetBase: EmailAssetBase = LIVE_ASSET_BASE,
): Promise<RenderedEmail> {
  const html = await render(
    <EmailLayout
      title={model.subject}
      preheader={model.preheader}
      heading={model.heading}
      logoAlt={copy.logoAlt}
      assetBase={assetBase}
      footer={footerOf(model, copy)}
    >
      {model.blocks.map((block, index) => (
        <Block key={index} block={block} copy={copy} />
      ))}
    </EmailLayout>,
  );
  const slot = new RegExp(`<meta name="${MSO_HEAD_SLOT}"\\s*/?>`);
  if (!slot.test(html))
    throw new Error("The Outlook head slot is missing from the rendered email.");
  return {
    subject: model.subject,
    html: html.replace(slot, () => MSO_HEAD),
    text: plainTextOf(model, copy),
  };
}
