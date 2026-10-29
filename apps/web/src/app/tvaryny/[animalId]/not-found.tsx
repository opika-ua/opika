import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { LinkButton } from "../../../ui/Button";
import { Heading } from "../../../ui/Heading";
import { Panel } from "../../../ui/Panel";
import { Text } from "../../../ui/Text";

/**
 * Next's own 404 mechanism (`notFound()`, called from `page.tsx` in this
 * same segment) renders this file instead of a bare, unstyled default -
 * an animal id that doesn't resolve (removed, never existed, or a
 * malformed string in the URL) is a real, on-brand dead end, not the
 * generic error card `/tvaryny/error.tsx` already owns for genuine
 * failures. No mock frame covers this exact state; copy matches the
 * established eyebrow/title/body/action pattern from the gallery's own
 * error card (`docs/ui/README.md`).
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function NotFound() {
  const copy = uk.detail.notFound;
  return (
    <div className="flex min-h-dvh items-center justify-center bg-page p-6">
      <Panel padding="lg" className="flex w-full max-w-140 flex-col items-start gap-4">
        <Text look="hint" className="uppercase tracking-wider">
          {copy.eyebrow}
        </Text>
        <Heading level={1} look="display-l">
          {copy.title}
        </Heading>
        <Text look="lead" className="text-ink-2">
          {copy.body}
        </Text>
        <LinkButton href="/tvaryny" data-testid="not-found-action">
          {copy.action}
        </LinkButton>
      </Panel>
    </div>
  );
}
