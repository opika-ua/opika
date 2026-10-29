import type { ReactNode } from "react";
import { KabinetBrand } from "./KabinetBrand";

/**
 * The frame of the signed-out kabinet pages (sign-in and invitation landing, forgot, new password):
 * the brand row, then one card centred on desktop and full width on a phone.
 */
export function AuthPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex min-h-16 items-center px-4 tablet:p-8">
        <KabinetBrand />
      </header>
      <main className="flex flex-1 flex-col px-4 pt-2 pb-6 tablet:items-center tablet:justify-center tablet:px-8 tablet:pt-8 tablet:pb-24">
        {children}
      </main>
    </div>
  );
}
