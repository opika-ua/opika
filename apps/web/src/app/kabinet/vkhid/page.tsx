import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { KabinetBrand } from "../../../features/kabinet/KabinetBrand";
import { SignInCard } from "../../../features/kabinet/SignInCard";

/** K1's route (`docs/design/KABINET.md`, "Actors and routes"). */
export const metadata: Metadata = {
  title: uk.kabinet.signIn.pageTitle,
};

/**
 * K1 page (mock «K1 Вхід» 1440 / 360). Desktop: the brand sits on the page
 * background at padding 32, the card centred below it, bottom padding 96.
 * Phone: a white 64px header holds the brand, the card follows at padding
 * `20 16 24`.
 */
export default function SignInPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex min-h-16 items-center bg-rg-surface px-4 tablet:min-h-0 tablet:bg-transparent tablet:p-8">
        <KabinetBrand />
      </header>
      <main className="flex flex-1 flex-col px-4 pt-5 pb-6 tablet:items-center tablet:justify-center tablet:px-8 tablet:pt-8 tablet:pb-24">
        <SignInCard />
      </main>
    </div>
  );
}
