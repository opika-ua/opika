import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { LinkButton } from "../../../ui/Button";
import { Container } from "../../../ui/Container";
import { Heading } from "../../../ui/Heading";
import { MAIN_LANDMARK } from "../../../ui/landmark";
import { Panel } from "../../../ui/Panel";

/**
 * A shelter page that has nothing to show: an unknown id, or a shelter that isn't verified (designer
 * round 1, S6). No new copy: «НЕ ЗНАЙДЕНО» is true of any address and «Усі тварини» leads to the
 * gallery, both the animal 404's own strings. That 404's title and body speak of a card, which is
 * false here, so they are not used.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function NotFound() {
  return (
    <main {...MAIN_LANDMARK} className="flex min-h-dvh items-center bg-page">
      <Container className="max-w-xl">
        <Panel padding="lg" className="flex flex-col items-start gap-4">
          <Heading level={1} look="title">
            {uk.detail.notFound.eyebrow}
          </Heading>
          <LinkButton href="/tvaryny">{uk.detail.notFound.action}</LinkButton>
        </Panel>
      </Container>
    </main>
  );
}
