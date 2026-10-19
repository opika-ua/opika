import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AnimalListScreen } from "../../../features/kabinet/animal-list/AnimalListScreen";
import { loadKabinetAnimalListPage } from "./load";

export const metadata: Metadata = { title: uk.kabinet.animalList.pageTitle };

/**
 * K2 · the shelter's animal list. A shelter whose writes the served policy
 * opens (every shelter's own admins, since PR 6) gets it with its moves, the
 * support view gets it read-only, and everyone else a 404, a super_admin
 * outside support mode included (`kabinetAnimalListPageOf`).
 */
export default async function AnimalListPage() {
  const page = await loadKabinetAnimalListPage();
  switch (page.kind) {
    case "sign_in":
      redirect("/kabinet/vkhid");
      break;
    case "not_found":
      notFound();
      break;
    case "list":
      return <AnimalListScreen page={page} />;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = page;
      return unreachable;
    }
  }
}
