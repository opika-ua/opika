import { uk } from "@opika/i18n";
import { KabinetBrand } from "./KabinetBrand";
import { PUBLIC_GALLERY_PATH } from "./routes";
import { SignOutButton } from "./SignOutButton";

/**
 * The shelter kabinet's header on every page that has a shelter: the brand row on the left; on the
 * right the shelter's name, the role in ink-2, «Переглянути сайт» (a new tab, so unsaved work is not
 * lost) and «Вийти». The support view shows its own role line and no working sign-out.
 */
export function KabinetHeader({
  shelterName,
  viewer,
}: {
  shelterName: string;
  viewer: "admin" | "support";
}) {
  const support = viewer === "support";
  return (
    <header className="flex min-h-16 items-center gap-3 border-b-2 border-line bg-surface px-4 desktop:min-h-18 desktop:gap-5 desktop:px-8">
      <KabinetBrand />
      <div className="flex-1" />
      <p className="hidden min-w-0 items-baseline gap-2 desktop:flex">
        <span className="truncate text-label text-ink">{shelterName}</span>
        <span className="shrink-0 text-body text-ink-2">
          {support ? uk.kabinet.support.viewingAs : uk.kabinet.profile.role}
        </span>
      </p>
      <a
        href={PUBLIC_GALLERY_PATH}
        target="_blank"
        rel="noopener"
        className="hidden min-h-target shrink-0 items-center whitespace-nowrap rounded-field px-2 text-label text-ink underline underline-offset-4 focus-ring tablet:inline-flex"
      >
        {uk.kabinet.shell.viewSite}
        <span className="sr-only"> {uk.kabinet.shell.newTab}</span>
      </a>
      {support ? (
        <span className="text-body text-ink-2">{uk.kabinet.support.signOutDisabled}</span>
      ) : (
        <SignOutButton />
      )}
    </header>
  );
}
