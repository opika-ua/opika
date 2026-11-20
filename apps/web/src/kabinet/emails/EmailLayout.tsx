import type { ReactNode } from "react";
import { Container, Head, Heading, Html, Img, Link, Preview, Section, Text } from "react-email";
import { assetUrl, EMAIL_LOGO, type EmailAssetBase } from "./assets";
import { DARK_CLASS, headCss } from "./styles";
import { EMAIL_WIDTH, FONT_STACK, LIGHT, RADIUS, TYPE } from "./theme";

/** Where the Outlook-only head block goes; `renderEmail` swaps it in, since React can't emit a comment. */
export const MSO_HEAD_SLOT = "o-mso-head";

export type EmailFooter = {
  /** Why this address got the mail, where one applies. */
  reason?: string;
  independence: string;
  contact: string;
  switchOff?: { prompt: string; action: string; url: string };
};

const caption = {
  margin: "0 0 8px",
  fontSize: TYPE.caption.size,
  lineHeight: TYPE.caption.lineHeight,
  color: LIGHT.secondary,
  textAlign: "center",
} as const;

/**
 * Every email's frame (plan §3): cream ground, the logo on its opaque plate, a 600px white card
 * holding the one `h1` and the body, and a text-only footer. Tables throughout (`role=presentation`),
 * `lang="uk"`, the subject as `<title>`, light and dark colour schemes declared.
 */
export function EmailLayout(props: {
  title: string;
  preheader: string;
  heading: string;
  logoAlt: string;
  assetBase: EmailAssetBase;
  footer: EmailFooter;
  children: ReactNode;
}) {
  const { footer } = props;
  return (
    <Html
      lang="uk"
      dir="ltr"
      {...{
        "xmlns:v": "urn:schemas-microsoft-com:vml",
        "xmlns:o": "urn:schemas-microsoft-com:office:office",
      }}
    >
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <meta name="format-detection" content="telephone=no, date=no, address=no" />
        <title>{props.title}</title>
        <meta name={MSO_HEAD_SLOT} />
        <style dangerouslySetInnerHTML={{ __html: headCss(props.assetBase) }} />
      </Head>
      <body
        lang="uk"
        className={DARK_CLASS.page}
        style={{ margin: 0, padding: 0, backgroundColor: LIGHT.page, fontFamily: FONT_STACK }}
      >
        <Preview useTitleTag={false}>{props.preheader}</Preview>
        {/* The ground as a table cell too: some clients drop the body's own background. */}
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
          <tbody>
            <tr>
              <td className={DARK_CLASS.page} style={{ backgroundColor: LIGHT.page }}>
                <Container
                  tdClassName={DARK_CLASS.shell}
                  style={{ maxWidth: `${EMAIL_WIDTH}px`, width: "100%", padding: "32px 12px" }}
                >
                  <Section style={{ padding: "0 0 24px", textAlign: "center" }}>
                    <Img
                      src={assetUrl(props.assetBase, EMAIL_LOGO.file)}
                      width={EMAIL_LOGO.width}
                      height={EMAIL_LOGO.height}
                      alt={props.logoAlt}
                      style={{
                        display: "block",
                        margin: "0 auto",
                        borderRadius: "12px",
                        border: 0,
                      }}
                    />
                  </Section>
                  <Section
                    className={DARK_CLASS.card}
                    style={{ backgroundColor: LIGHT.card, borderRadius: RADIUS.card }}
                  >
                    <table
                      role="presentation"
                      width="100%"
                      cellPadding={0}
                      cellSpacing={0}
                      border={0}
                    >
                      <tbody>
                        <tr>
                          <td className={DARK_CLASS.cardPad} style={{ padding: "40px 36px 24px" }}>
                            <Heading
                              as="h1"
                              className={DARK_CLASS.heading}
                              style={{
                                margin: "0 0 20px",
                                fontFamily: FONT_STACK,
                                fontSize: TYPE.title.size,
                                lineHeight: TYPE.title.lineHeight,
                                fontWeight: TYPE.title.weight,
                                color: LIGHT.ink,
                              }}
                            >
                              {props.heading}
                            </Heading>
                            {props.children}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </Section>
                  <Section style={{ padding: "24px 16px 0" }}>
                    {footer.switchOff ? (
                      <Text className={DARK_CLASS.secondary} style={caption}>
                        {footer.switchOff.prompt}{" "}
                        <Link
                          href={footer.switchOff.url}
                          className={DARK_CLASS.link}
                          style={{ color: LIGHT.secondary, textDecoration: "underline" }}
                        >
                          {footer.switchOff.action}
                        </Link>
                      </Text>
                    ) : null}
                    {footer.reason ? (
                      <Text className={DARK_CLASS.secondary} style={caption}>
                        {footer.reason}
                      </Text>
                    ) : null}
                    <Text className={DARK_CLASS.secondary} style={caption}>
                      {footer.independence}
                    </Text>
                    {/* Plain text, not a mailto link whose text is an address (IN-E8). */}
                    <Text className={DARK_CLASS.secondary} style={caption}>
                      {footer.contact}
                    </Text>
                  </Section>
                </Container>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </Html>
  );
}
