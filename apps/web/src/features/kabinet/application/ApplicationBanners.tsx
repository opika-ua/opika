import { pluralizeUk } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import type { ReactNode } from "react";
import { Button } from "../../../ui/Button";
import { Heading } from "../../../ui/Heading";
import { Icon } from "../../../ui/Icon";
import { Panel } from "../../../ui/Panel";
import { Text } from "../../../ui/Text";
import type { ApplicationBanner } from "./application-banners";
import { dismissApprovedBanner } from "./dismiss-approved";

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
        return (
          <Panel
            key="approved"
            tone="outline"
            padding="md"
            className="flex items-start justify-between gap-3"
          >
            <Text look="label" className="self-center">
              {t.approved}
            </Text>
            {/* A native form post: works without JavaScript and needs no client component. */}
            <form action={dismissApprovedBanner.bind(null, banner.shelterId)}>
              <Button type="submit" variant="icon" aria-label={t.approvedClose}>
                <Icon name="close" size="md" />
              </Button>
            </form>
          </Panel>
        );
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
