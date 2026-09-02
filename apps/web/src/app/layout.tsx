import "./globals.css";
import { commissioner, eUkraine, literata } from "./fonts";

export const metadata = {
  title: "Adoption Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="uk"
      className={`${literata.variable} ${commissioner.variable} ${eUkraine.variable}`}
    >
      {/*
        The user agent's default 8px body margin is not decoration: combined
        with content-box padding on a full-height page it pushed the deck
        48px past the viewport in both axes (2x8 margin + 2x16 padding), which
        is a scrollbar on a screen that is supposed to be a fixed deck. Found
        against /discovery (E5 migrated the deck to /tvaryny/gortaty; the
        same margin math still applies there). Asserted in
        test/harness/discovery-layout.harness.ts.
      */}
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
