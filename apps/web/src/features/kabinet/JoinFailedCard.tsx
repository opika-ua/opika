import { uk } from "@opika/i18n";
import { LinkButton } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Heading } from "../../ui/Heading";
import { Text } from "../../ui/Text";

/**
 * `/kabinet` for a signed-in person whose invitation couldn't be accepted
 * this time (IN-Q12: "sees a clear message … and gets a retry"). The retry is
 * a plain link back to `/kabinet`, whose load runs the accept again.
 */
export function JoinFailedCard() {
  return (
    <Card
      as="section"
      tone="outline"
      aria-labelledby="join-failed-title"
      className="flex w-full flex-col gap-6 p-5 tablet:w-120 tablet:p-8"
    >
      <div className="flex flex-col gap-2">
        <Heading level={1} look="title" id="join-failed-title">
          {uk.kabinet.confirm.joinFailedTitle}
        </Heading>
        <div role="alert">
          <Text look="body" className="text-ink-2">
            {uk.kabinet.confirm.joinFailed}
          </Text>
        </div>
      </div>
      <LinkButton href="/kabinet" size="lg" className="w-full">
        {uk.kabinet.confirm.joinRetry}
      </LinkButton>
    </Card>
  );
}
