import { fillTemplate, uk } from "@opika/i18n";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { AnimalPage } from "../../../../features/kabinet/AnimalPage";
import { animalTabOf } from "../../../../features/kabinet/animal-form/animal-tabs";
import { loadKabinetAnimalPage } from "../load";

type Params = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string | string[] }>;
};

/** One read per request, shared by the title and the page. */
const load = cache((animalId: string) => loadKabinetAnimalPage({ kind: "existing", animalId }));

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const page = await load((await params).id);
  return page.kind === "form" && page.view !== null
    ? { title: fillTemplate(uk.kabinet.animalForm.pageTitleEdit, { name: page.view.name }) }
    : {};
}

const firstOf = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * K3 · one animal: the form, writable exactly when the served policy opens
 * this shelter's writes (for its own admins, since PR 6), read-only for a
 * support view; `errors.notFound` for an id that isn't this
 * shelter's animal; a 404 for anyone without a shelter (a super_admin outside
 * support mode included).
 */
export default async function AnimalEditPage({ params, searchParams }: Params) {
  const page = await load((await params).id);
  switch (page.kind) {
    case "sign_in":
      redirect("/kabinet/vkhid");
      break;
    case "not_found":
      notFound();
      break;
    case "missing":
    case "form":
      return <AnimalPage page={page} tab={animalTabOf(firstOf((await searchParams)?.tab))} />;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = page;
      return unreachable;
    }
  }
}
