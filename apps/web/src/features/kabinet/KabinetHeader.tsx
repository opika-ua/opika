import { uk } from "@opika/i18n";
import { Container } from "../../ui/Container";
import { Icon } from "../../ui/Icon";
import { AccountMenu } from "./AccountMenu";
import { KabinetBrand } from "./KabinetBrand";
import { PUBLIC_GALLERY_PATH } from "./routes";

export type HeaderAccount =
  | { kind: "shelter"; shelterName: string; viewer: "admin" | "support" }
  /** `role`: «адміністратор сайту», shown under the person in the menu. */
  | { kind: "operator"; role: string | null };

/**
 * The kabinet's header on every page: the logo and «Кабінет» as muted text on the left; on the
 * right «На сайт ↗» (a new tab, so unsaved work is not lost) and the account button, labelled with
 * the shelter's name («Оператор» for the operator). The menu holds the name and role, «Акаунт і
 * пароль» (a shelter's own admin) and «Вийти». The support view keeps its role line and has no
 * working sign-out.
 */
export function KabinetHeader({ account }: { account: HeaderAccount }) {
  const t = uk.kabinet;
  const menu =
    account.kind === "operator"
      ? {
          buttonLabel: t.shell.operator,
          role: account.role,
          account: false,
          signOut: "enabled" as const,
        }
      : {
          buttonLabel: account.shelterName,
          role: account.viewer === "support" ? t.support.viewingAs : t.profile.role,
          account: account.viewer === "admin",
          signOut: account.viewer === "support" ? ("disabled" as const) : ("enabled" as const),
        };
  return (
    <header className="border-b-2 border-line bg-surface">
      <Container className="flex min-h-16 items-center gap-3 desktop:min-h-18 desktop:gap-5">
        <KabinetBrand />
        <div className="flex-1" />
        <a
          href={PUBLIC_GALLERY_PATH}
          target="_blank"
          rel="noopener"
          className="hidden min-h-target shrink-0 items-center gap-1 whitespace-nowrap rounded-field px-2 text-label text-ink hover:underline hover:underline-offset-4 focus-ring tablet:inline-flex"
        >
          {t.shell.toSite}
          <Icon name="arrow-up-right" size="md" />
          <span className="sr-only"> {t.shell.newTab}</span>
        </a>
        <AccountMenu {...menu} />
      </Container>
    </header>
  );
}
