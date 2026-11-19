import { pluralizeUk } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { Button } from "../../../ui/Button";
import { Heading } from "../../../ui/Heading";
import { Icon } from "../../../ui/Icon";
import { Panel } from "../../../ui/Panel";
import { Text } from "../../../ui/Text";
import { TextLink } from "../../../ui/TextLink";
import { ResendConfirmation } from "../registration/ResendConfirmation";
import { SHELTER_CONTACTS_PATH } from "../routes";
import type { ApplicationBanner } from "./application-banners";
import { dismissApprovedBanner } from "./dismiss-approved";

const t = uk.kabinet.application;

/**
 * The banners `applicationBannersOf` chose, in its order. «Підтвердіть email» carries the resend
 * button, so it shows exactly when the banner does (never in the support view).
 */
export function ApplicationBanners({ banners }: { banners: readonly ApplicationBanner[] }) {
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
            <ResendConfirmation />
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
            {banner.contact === "present" ? (
              <Text look="label" className="self-center">
                {t.approved}
              </Text>
            ) : (
              <div className="flex flex-col items-start gap-1">
                <Text look="label">{t.approvedNoContact}</Text>
                <TextLink href={SHELTER_CONTACTS_PATH} className="text-label">
                  {t.publishNoContactLink}
                </TextLink>
              </div>
            )}
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
