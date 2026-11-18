import { pluralizeUk } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import type { ReactNode } from "react";
import { Heading } from "../../../ui/Heading";
import { Panel } from "../../../ui/Panel";
import { Text } from "../../../ui/Text";
import { ApprovedBanner } from "./ApprovedBanner";
import type { ApplicationBanner } from "./application-banners";

const t = uk.kabinet.application;

/**
 * The banners `applicationBannersOf` chose, in its order. `resendConfirmation` is the slot for the
 * registration PR's resend button; until it lands the «Підтвердіть email» banner shows without it.
 */
export function ApplicationBanners({
  banners,
  resendConfirmation = null,
}: {
  banners: readonly ApplicationBanner[];
  resendConfirmation?: ReactNode;
}) {
  return banners.map((banner) => {
    switch (banner.kind) {
      case "pending":
        return (
          <Panel
            key="pending"
            as="section"
            padding="lg"
            aria-labelledby="application-pending"
            className="flex flex-col gap-2"
          >
            <Heading level={2} look="title" id="application-pending">
              {uk.kabinet.profileStatus.application}
            </Heading>
            <Text>{t.pending}</Text>
          </Panel>
        );
      case "confirm_email":
        return (
          <Panel
            key="confirm_email"
            tone="outline"
            padding="md"
            className="flex flex-col items-start gap-3"
          >
            <Text look="label">{fillTemplate(t.confirmEmail, { email: banner.email })}</Text>
            {resendConfirmation}
          </Panel>
        );
      case "approved":
        return <ApprovedBanner key="approved" />;
      case "days_left":
        return (
          <Panel key="days_left" tone="outline" padding="md">
            <Text look="label">
              {fillTemplate(pluralizeUk(banner.daysLeft, t.earlyListingDaysLeft), {
                count: String(banner.daysLeft),
              })}
            </Text>
          </Panel>
        );
      /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
      default: {
        const unreachable: never = banner;
        return unreachable;
      }
    }
  });
}
