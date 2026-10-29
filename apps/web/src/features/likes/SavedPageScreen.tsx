import { ukPublic as uk } from "@opika/i18n/public";
import { Container } from "../../ui/Container";
import { Heading } from "../../ui/Heading";
import { SiteHeader } from "../chrome/SiteHeader";
import { SavedCards } from "./SavedCards";

interface SavedPageScreenProps {
  /** Designer feedback batch D: whether to show the role-aware header's kabinet nav. Defaulted, like `AnimalDetailScreen`'s - the real caller (`app/zberezheni/page.tsx`) always passes it explicitly. */
  kabinetSignedIn?: boolean;
}

/**
 * S8, the saved page (`/zberezheni`). No mock frame exists (`docs/designer-round-1.md` §4): the layout
 * is the gallery's own card and grid, his copy for every state. The header and title render on the
 * server; `SavedCards` is the one client island (the list lives in `localStorage`).
 */
export function SavedPageScreen({ kabinetSignedIn = false }: SavedPageScreenProps) {
  return (
    <div className="min-h-dvh bg-page">
      <SiteHeader kabinetSignedIn={kabinetSignedIn} />

      <Container as="main" className="flex flex-col gap-13 pt-10 pb-10 desktop:pb-14">
        <SavedCards
          intro={
            <>
              <Heading level={1} look="display-l" className="desktop:text-display-xl">
                {uk.likes.title}
              </Heading>
              <p className="text-caption text-ink-2">{uk.likes.deviceOnly}</p>
            </>
          }
        />
      </Container>
    </div>
  );
}
