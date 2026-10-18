import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AnimalPage } from "../../../../features/kabinet/AnimalPage";
import { loadKabinetAnimalPage } from "../load";

export const metadata: Metadata = { title: uk.kabinet.animalForm.pageTitleNew };

/**
 * K3 · a new animal (K-Q5: a name and a species make the draft). Only a
 * shelter whose writes the served policy opens gets the form; everyone else
 * gets a 404 (`kabinetAnimalPageOf`).
 */
export default async function NewAnimalPage() {
  const page = await loadKabinetAnimalPage({ kind: "new" });
  switch (page.kind) {
    case "sign_in":
      redirect("/kabinet/vkhid");
      break;
    case "not_found":
    case "missing":
      notFound();
      break;
    case "form":
      return <AnimalPage page={page} />;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = page;
      return unreachable;
    }
  }
}
